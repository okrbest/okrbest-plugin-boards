// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {BlobSource} from '@blocksuite/sync'
import type {DocSnapshot} from '@blocksuite/store'

import octoClient from '../../octoClient'
import {Utils} from '../../utils'

// MIME type mapping for common image extensions
const extensionToMimeType: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.avif': 'image/avif',
}

/**
 * BlockSuite의 getImageBlob()은 blob.type.startsWith('image/')를 검사합니다.
 * 서버가 application/octet-stream으로 응답하면 다운로드가 실패하므로,
 * 파일 확장자에서 올바른 MIME 타입을 추론하여 blob을 재생성합니다.
 */
function ensureImageMimeType(blob: Blob, filename: string): Blob {
    if (blob.type && blob.type.startsWith('image/')) {
        return blob
    }

    const lastDotIndex = filename.lastIndexOf('.')
    if (lastDotIndex !== -1) {
        const extension = filename.substring(lastDotIndex).toLowerCase()
        const mimeType = extensionToMimeType[extension]
        if (mimeType) {
            Utils.log(`ensureImageMimeType: inferred type ${mimeType} from extension ${extension}`)
            return new Blob([blob], {type: mimeType})
        }
    }

    Utils.log(`ensureImageMimeType: defaulting to image/png for ${filename}`)
    return new Blob([blob], {type: 'image/png'})
}

// Module-level maps persist across BlobSource instances
// Key format: `${boardId}:${blobKey}` -> fileId
const globalKeyToFileIdMap = new Map<string, string>()
const globalBlobCache = new Map<string, Blob>()
const globalInFlightGets = new Map<string, Promise<Blob | null>>()
const upcomingPasteKeys = new Map<string, number>()

type ClipboardBlobPayloadItem = {
    key: string
    dataUrl: string
}

type ClipboardBlobPayload = {
    version: 1
    items: ClipboardBlobPayloadItem[]
}

type BuildClipboardBlobPayloadOptions = {
    preferredKeys?: string[]
}

type BuildClipboardBlobPayloadResult = {
    payloadText: string | null
    diagnostics: {
        preferredKeyCount: number
        mappingKeyCount: number
        payloadItemCount: number
    }
}

type ExtractBlobPayloadResult = {
    payloadText: string | null
    cleanText: string
    reason?: string
}

type ClipboardPayloadCarrier = 'custom_mime' | 'custom_text_mime' | 'plain_marker' | 'html_marker'

type ExtractBlobPayloadFromClipboardDataResult = {
    payloadText: string | null
    cleanText: string
    reason?: string
    carrier?: ClipboardPayloadCarrier
}

type HydrateClipboardBlobPayloadResult = {
    hydrated: number
    failed: number
}

export const FOCALBOARD_CLIPBOARD_BLOB_MARKER = '\n\n[FOCALBOARD_CLIPBOARD_BLOB_PAYLOAD]\n'
export const FOCALBOARD_CLIPBOARD_BLOB_MIME = 'application/x-focalboard-blob-payload+json'
export const FOCALBOARD_CLIPBOARD_BLOB_TEXT_MIME = 'text/x-focalboard-blob-payload'

function makeGlobalKey(boardId: string, key: string): string {
    return `${boardId}:${key}`
}

function splitGlobalKey(globalKey: string): {boardId: string; key: string} | null {
    const splitAt = globalKey.indexOf(':')
    if (splitAt <= 0 || splitAt >= globalKey.length - 1) {
        return null
    }
    return {
        boardId: globalKey.substring(0, splitAt),
        key: globalKey.substring(splitAt + 1),
    }
}

function getFirstGlobalKeyByBlobKey(map: Map<string, unknown>, key: string, boardIdToSkip?: string): string | undefined {
    for (const globalKey of map.keys()) {
        const parsed = splitGlobalKey(globalKey)
        if (!parsed) {
            continue
        }
        if (parsed.key !== key) {
            continue
        }
        if (boardIdToSkip && parsed.boardId === boardIdToSkip) {
            continue
        }
        return globalKey
    }
    return undefined
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result)
            } else {
                reject(new Error('blob_to_data_url_failed'))
            }
        }
        reader.onerror = () => reject(new Error('blob_to_data_url_error'))
        reader.readAsDataURL(blob)
    })
}

function dataUrlToBlob(dataUrl: string): Blob | null {
    if (!dataUrl.startsWith('data:')) {
        return null
    }

    const commaIndex = dataUrl.indexOf(',')
    if (commaIndex === -1) {
        return null
    }

    const meta = dataUrl.substring(5, commaIndex)
    const body = dataUrl.substring(commaIndex + 1)
    const isBase64 = meta.endsWith(';base64')
    const mimeType = (isBase64 ? meta.substring(0, Math.max(0, meta.length - ';base64'.length)) : meta) || 'application/octet-stream'

    try {
        if (isBase64) {
            const binary = atob(body)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i)
            }
            return new Blob([bytes], {type: mimeType})
        }
        return new Blob([decodeURIComponent(body)], {type: mimeType})
    } catch {
        return null
    }
}

function parseClipboardBlobPayload(payloadText: string): ClipboardBlobPayload | null {
    if (!payloadText) {
        return null
    }
    try {
        const parsed = JSON.parse(payloadText) as ClipboardBlobPayload
        if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

function setUpcomingPasteKey(boardId: string, key: string, ttlMs: number): void {
    const expireAt = Date.now() + Math.max(1, ttlMs)
    upcomingPasteKeys.set(makeGlobalKey(boardId, key), expireAt)
}

function fetchUpcomingPasteKey(boardId: string, key: string): number | undefined {
    const globalKey = makeGlobalKey(boardId, key)
    const expiresAt = upcomingPasteKeys.get(globalKey)
    if (!expiresAt) {
        return undefined
    }
    if (expiresAt <= Date.now()) {
        upcomingPasteKeys.delete(globalKey)
        return undefined
    }
    return expiresAt
}

function clearUpcomingPasteKey(boardId: string, key: string): void {
    upcomingPasteKeys.delete(makeGlobalKey(boardId, key))
}

export function registerUpcomingPasteKeys(boardId: string, keys: string[], ttlMs = 8000): void {
    for (const key of keys) {
        if (!key) {
            continue
        }
        setUpcomingPasteKey(boardId, key, ttlMs)
    }
}

export function hasUpcomingPasteKey(boardId: string, key: string): boolean {
    return !!fetchUpcomingPasteKey(boardId, key)
}

export function primeBlobCacheForBoard(boardId: string, key: string, blob: Blob): void {
    if (!boardId || !key) {
        return
    }
    globalBlobCache.set(makeGlobalKey(boardId, key), blob)
}

export function registerBlobMapping(boardId: string, key: string, fileId: string): void {
    globalKeyToFileIdMap.set(makeGlobalKey(boardId, key), fileId)
}

export function getFileIdForKey(boardId: string, key: string): string | undefined {
    return globalKeyToFileIdMap.get(makeGlobalKey(boardId, key))
}

export function getAllBlobMappings(boardId: string): Record<string, string> {
    const result: Record<string, string> = {}
    const prefix = `${boardId}:`
    Utils.log(`getAllBlobMappings: boardId=${boardId}, globalMap size=${globalKeyToFileIdMap.size}`)
    globalKeyToFileIdMap.forEach((fileId, globalKey) => {
        Utils.log(`getAllBlobMappings: checking ${globalKey}`)
        if (globalKey.startsWith(prefix)) {
            const key = globalKey.substring(prefix.length)
            result[key] = fileId
        }
    })
    return result
}

export function restoreBlobMappings(boardId: string, mappings: Record<string, string>): void {
    Utils.log(`restoreBlobMappings: boardId=${boardId}, mappings count=${Object.keys(mappings).length}`)
    for (const [key, fileId] of Object.entries(mappings)) {
        registerBlobMapping(boardId, key, fileId)
        Utils.log(`restoreBlobMappings: restored ${key} -> ${fileId}`)
    }
}

interface ExtendedDocSnapshot extends DocSnapshot {
    meta: DocSnapshot['meta'] & {
        blobMap?: Record<string, string>
    }
}

export function prepareSnapshotForSave(snapshot: DocSnapshot, boardId: string): ExtendedDocSnapshot {
    const blobMap = getAllBlobMappings(boardId)
    if (Object.keys(blobMap).length === 0) {
        return snapshot as ExtendedDocSnapshot
    }

    Utils.log(`prepareSnapshotForSave: saving ${Object.keys(blobMap).length} blob mappings`)
    for (const [key, fileId] of Object.entries(blobMap)) {
        Utils.log(`prepareSnapshotForSave: ${key} -> ${fileId}`)
    }

    const extended = snapshot as ExtendedDocSnapshot
    const result: ExtendedDocSnapshot = {
        ...extended,
        meta: {
            ...extended.meta,
            blobMap,
        },
    }
    return result
}

export function restoreSnapshotBlobMappings(snapshot: DocSnapshot, boardId: string): void {
    const extended = snapshot as ExtendedDocSnapshot
    if (extended.meta?.blobMap) {
        Utils.log(`restoreSnapshotBlobMappings: found ${Object.keys(extended.meta.blobMap).length} mappings`)
        restoreBlobMappings(boardId, extended.meta.blobMap)
    }
}

export async function buildClipboardBlobPayload(boardId: string, teamId: string, options?: BuildClipboardBlobPayloadOptions): Promise<BuildClipboardBlobPayloadResult> {
    const preferredKeys = Array.from(new Set((options?.preferredKeys || []).filter(Boolean)))
    const mappingEntries = Object.entries(getAllBlobMappings(boardId))
    const mappingKeys = mappingEntries.map(([key]) => key)
    const candidateKeys = Array.from(new Set([...preferredKeys, ...mappingKeys]))
    const items: ClipboardBlobPayloadItem[] = []

    for (const key of candidateKeys) {
        let blob = globalBlobCache.get(makeGlobalKey(boardId, key)) || null
        if (!blob) {
            const fileId = getFileIdForKey(boardId, key)
            if (fileId) {
                try {
                    const fileInfo = await octoClient.getFileAsDataUrl(boardId, fileId, teamId)
                    if (fileInfo?.url) {
                        const response = await fetch(fileInfo.url)
                        if (response.ok) {
                            blob = ensureImageMimeType(await response.blob(), fileId)
                            primeBlobCacheForBoard(boardId, key, blob)
                        }
                    }
                } catch (err) {
                    Utils.logError(`buildClipboardBlobPayload: failed to resolve ${key}: ${err}`)
                }
            }
        }

        if (!blob) {
            continue
        }

        try {
            const dataUrl = await blobToDataUrl(blob)
            items.push({key, dataUrl})
        } catch (err) {
            Utils.logError(`buildClipboardBlobPayload: failed to encode blob ${key}: ${err}`)
        }
    }

    if (items.length === 0) {
        return {
            payloadText: null,
            diagnostics: {
                preferredKeyCount: preferredKeys.length,
                mappingKeyCount: mappingKeys.length,
                payloadItemCount: 0,
            },
        }
    }

    const payload: ClipboardBlobPayload = {
        version: 1,
        items,
    }

    return {
        payloadText: JSON.stringify(payload),
        diagnostics: {
            preferredKeyCount: preferredKeys.length,
            mappingKeyCount: mappingKeys.length,
            payloadItemCount: items.length,
        },
    }
}

export function appendBlobPayloadToPlainText(plainText: string, payloadText: string): string {
    if (!payloadText) {
        return plainText
    }
    return `${plainText}${FOCALBOARD_CLIPBOARD_BLOB_MARKER}${payloadText}`
}

export function extractBlobPayloadFromPlainText(plainText: string): ExtractBlobPayloadResult {
    const markerIndex = plainText.lastIndexOf(FOCALBOARD_CLIPBOARD_BLOB_MARKER)
    if (markerIndex === -1) {
        return {
            payloadText: null,
            cleanText: plainText,
            reason: 'clipboard_marker_missing',
        }
    }

    const payloadStart = markerIndex + FOCALBOARD_CLIPBOARD_BLOB_MARKER.length
    const payloadText = plainText.substring(payloadStart).trim()
    const cleanText = plainText.substring(0, markerIndex)
    if (!payloadText) {
        return {
            payloadText: null,
            cleanText,
            reason: 'clipboard_payload_empty',
        }
    }
    return {payloadText, cleanText}
}

const HTML_PAYLOAD_MARKER_PREFIX = '<!--FOCALBOARD_CLIPBOARD_BLOB_PAYLOAD:'
const HTML_PAYLOAD_MARKER_SUFFIX = '-->'

export function appendBlobPayloadToHtml(html: string, payloadText: string): string {
    if (!payloadText) {
        return html
    }
    const encoded = encodeURIComponent(payloadText)
    return `${html}${HTML_PAYLOAD_MARKER_PREFIX}${encoded}${HTML_PAYLOAD_MARKER_SUFFIX}`
}

export function extractBlobPayloadFromHtml(html: string): ExtractBlobPayloadResult {
    const markerIndex = html.lastIndexOf(HTML_PAYLOAD_MARKER_PREFIX)
    if (markerIndex === -1) {
        return {
            payloadText: null,
            cleanText: html,
            reason: 'clipboard_html_marker_missing',
        }
    }

    const valueStart = markerIndex + HTML_PAYLOAD_MARKER_PREFIX.length
    const valueEnd = html.indexOf(HTML_PAYLOAD_MARKER_SUFFIX, valueStart)
    if (valueEnd === -1) {
        return {
            payloadText: null,
            cleanText: html,
            reason: 'clipboard_html_marker_invalid',
        }
    }

    const encodedPayload = html.substring(valueStart, valueEnd)
    const cleanText = `${html.substring(0, markerIndex)}${html.substring(valueEnd + HTML_PAYLOAD_MARKER_SUFFIX.length)}`
    if (!encodedPayload) {
        return {
            payloadText: null,
            cleanText,
            reason: 'clipboard_html_payload_empty',
        }
    }

    try {
        return {
            payloadText: decodeURIComponent(encodedPayload),
            cleanText,
        }
    } catch {
        return {
            payloadText: null,
            cleanText,
            reason: 'clipboard_html_payload_decode_failed',
        }
    }
}

export function extractBlobPayloadFromClipboardData(clipboardData: DataTransfer): ExtractBlobPayloadFromClipboardDataResult {
    if (!clipboardData) {
        return {payloadText: null, cleanText: '', reason: 'clipboard_data_missing'}
    }

    const plainText = clipboardData.getData('text/plain') || ''
    const customMimePayload = clipboardData.getData(FOCALBOARD_CLIPBOARD_BLOB_MIME)
    if (customMimePayload) {
        const plainExtract = extractBlobPayloadFromPlainText(plainText)
        return {
            payloadText: customMimePayload,
            cleanText: plainExtract.cleanText,
            carrier: 'custom_mime',
        }
    }

    const customTextMimePayload = clipboardData.getData(FOCALBOARD_CLIPBOARD_BLOB_TEXT_MIME)
    if (customTextMimePayload) {
        const plainExtract = extractBlobPayloadFromPlainText(plainText)
        return {
            payloadText: customTextMimePayload,
            cleanText: plainExtract.cleanText,
            carrier: 'custom_text_mime',
        }
    }

    const plainExtract = extractBlobPayloadFromPlainText(plainText)
    if (plainExtract.payloadText) {
        return {
            payloadText: plainExtract.payloadText,
            cleanText: plainExtract.cleanText,
            carrier: 'plain_marker',
        }
    }

    const html = clipboardData.getData('text/html')
    const htmlExtract = extractBlobPayloadFromHtml(html)
    if (htmlExtract.payloadText) {
        return {
            payloadText: htmlExtract.payloadText,
            cleanText: plainExtract.cleanText,
            carrier: 'html_marker',
        }
    }

    return {
        payloadText: null,
        cleanText: plainExtract.cleanText,
        reason: plainExtract.reason || htmlExtract.reason || 'clipboard_payload_not_found',
    }
}

export function extractClipboardBlobPayloadKeys(payloadText: string): string[] {
    const payload = parseClipboardBlobPayload(payloadText)
    if (!payload) {
        return []
    }
    return Array.from(new Set(payload.items.map((item) => item.key).filter(Boolean)))
}

export function extractClipboardBlobPayloadItemMap(payloadText: string): Record<string, string> {
    const payload = parseClipboardBlobPayload(payloadText)
    if (!payload) {
        return {}
    }
    const map: Record<string, string> = {}
    for (const item of payload.items) {
        if (!item.key || !item.dataUrl) {
            continue
        }
        map[item.key] = item.dataUrl
    }
    return map
}

export async function hydrateClipboardBlobPayload(targetBoardId: string, teamId: string, payloadText: string): Promise<HydrateClipboardBlobPayloadResult> {
    const payload = parseClipboardBlobPayload(payloadText)
    if (!payload) {
        return {hydrated: 0, failed: 0}
    }

    let hydrated = 0
    let failed = 0
    const uploads: Array<Promise<void>> = []

    for (const item of payload.items) {
        if (!item?.key || !item?.dataUrl) {
            failed++
            continue
        }
        const blob = dataUrlToBlob(item.dataUrl)
        if (!blob) {
            failed++
            continue
        }

        hydrated++
        primeBlobCacheForBoard(targetBoardId, item.key, blob)
        registerUpcomingPasteKeys(targetBoardId, [item.key])

        uploads.push((async () => {
            try {
                const file = new File([blob], item.key, {type: blob.type || 'application/octet-stream'})
                const fileId = await octoClient.uploadFile(targetBoardId, file)
                if (fileId) {
                    registerBlobMapping(targetBoardId, item.key, fileId)
                    clearUpcomingPasteKey(targetBoardId, item.key)
                }
            } catch (err) {
                Utils.logWarn(`hydrateClipboardBlobPayload: upload failed for key ${item.key}: ${err}`)
            }
        })())
    }

    if (uploads.length > 0) {
        await Promise.all(uploads)
    }

    return {hydrated, failed}
}

export function createFocalboardBlobSource(boardId: string, teamId: string): BlobSource {
    return {
        name: 'focalboard',
        readonly: false,

        async get(key: string): Promise<Blob | null> {
            Utils.log(`BlobSource.get called with key: ${key}`)

            if (!key) {
                Utils.log('BlobSource.get: key is empty, returning null')
                return null
            }

            const globalKey = makeGlobalKey(boardId, key)
            const cachedBlob = globalBlobCache.get(globalKey)
            if (cachedBlob) {
                Utils.log(`BlobSource.get: found blob in local cache, size=${cachedBlob.size}`)
                return cachedBlob
            }

            const inFlight = globalInFlightGets.get(globalKey)
            if (inFlight) {
                return inFlight
            }

            const inFlightPromise = (async (): Promise<Blob | null> => {
                try {
                    const localFileId = globalKeyToFileIdMap.get(globalKey)
                    if (localFileId) {
                        Utils.log(`BlobSource.get: fetching local mapped file, boardId=${boardId}, key=${key}, fileId=${localFileId}`)
                        const localFileInfo = await octoClient.getFileAsDataUrl(boardId, localFileId, teamId)
                        if (localFileInfo?.url) {
                            const localResponse = await fetch(localFileInfo.url)
                            if (localResponse.ok) {
                                const localBlob = ensureImageMimeType(await localResponse.blob(), localFileId)
                                globalBlobCache.set(globalKey, localBlob)
                                clearUpcomingPasteKey(boardId, key)
                                return localBlob
                            }
                        }
                    }

                    if (hasUpcomingPasteKey(boardId, key) && !localFileId) {
                        Utils.log(`BlobSource.get: key ${key} is pending hydration, skip network fallback`)
                        return null
                    }

                    const sourceCachedGlobalKey = getFirstGlobalKeyByBlobKey(globalBlobCache, key, boardId)
                    if (sourceCachedGlobalKey) {
                        const sourceBlob = globalBlobCache.get(sourceCachedGlobalKey)
                        if (sourceBlob) {
                            globalBlobCache.set(globalKey, sourceBlob)
                            try {
                                const file = new File([sourceBlob], key, {type: sourceBlob.type || 'application/octet-stream'})
                                const uploadedFileId = await octoClient.uploadFile(boardId, file)
                                if (uploadedFileId) {
                                    registerBlobMapping(boardId, key, uploadedFileId)
                                }
                            } catch (err) {
                                Utils.logWarn(`BlobSource.get: cross-board upload failed (cached source): ${err}`)
                            }
                            clearUpcomingPasteKey(boardId, key)
                            return sourceBlob
                        }
                    }

                    const sourceMappingGlobalKey = getFirstGlobalKeyByBlobKey(globalKeyToFileIdMap, key, boardId)
                    if (!sourceMappingGlobalKey) {
                        Utils.log('BlobSource.get: no source mapping found, returning null')
                        return null
                    }

                    const source = splitGlobalKey(sourceMappingGlobalKey)
                    if (!source) {
                        return null
                    }
                    const sourceFileId = globalKeyToFileIdMap.get(sourceMappingGlobalKey)
                    if (!sourceFileId) {
                        return null
                    }

                    Utils.log(`BlobSource.get: fetching source-board file, sourceBoard=${source.boardId}, key=${key}, fileId=${sourceFileId}`)
                    const fileInfo = await octoClient.getFileAsDataUrl(source.boardId, sourceFileId, teamId)
                    Utils.log(`BlobSource.get: fileInfo=${JSON.stringify(fileInfo)}`)

                    if (!fileInfo?.url) {
                        Utils.log('BlobSource.get: source file has no URL, returning null')
                        return null
                    }

                    const response = await fetch(fileInfo.url)
                    if (!response.ok) {
                        Utils.log(`BlobSource.get: fetch failed with status ${response.status}`)
                        return null
                    }

                    let blob = await response.blob()
                    Utils.log(`BlobSource.get: successfully fetched blob, size=${blob.size}, type=${blob.type}`)

                    blob = ensureImageMimeType(blob, sourceFileId)
                    globalBlobCache.set(globalKey, blob)

                    try {
                        const file = new File([blob], key, {type: blob.type || 'application/octet-stream'})
                        const uploadedFileId = await octoClient.uploadFile(boardId, file)
                        if (uploadedFileId) {
                            registerBlobMapping(boardId, key, uploadedFileId)
                        }
                    } catch (err) {
                        Utils.logWarn(`BlobSource.get: cross-board upload failed (mapped source): ${err}`)
                    }

                    clearUpcomingPasteKey(boardId, key)
                    return blob
                } catch (err) {
                    Utils.logError(`BlobSource.get failed: ${err}`)
                    console.error('Failed to fetch blob:', key, err)
                    return null
                } finally {
                    globalInFlightGets.delete(globalKey)
                }
            })()

            globalInFlightGets.set(globalKey, inFlightPromise)
            return inFlightPromise
        },

        async set(key: string, value: Blob): Promise<string> {
            Utils.log(`BlobSource.set called with key: ${key}, blob size: ${value.size}, type: ${value.type}`)

            const globalKey = makeGlobalKey(boardId, key)
            globalBlobCache.set(globalKey, value)
            Utils.log(`BlobSource.set: stored blob in local cache with key=${key}`)

            try {
                const file = new File([value], key, {type: value.type})
                Utils.log(`BlobSource.set: uploading file to boardId=${boardId}`)
                const fileId = await octoClient.uploadFile(boardId, file)
                Utils.log(`BlobSource.set: upload complete, fileId=${fileId}`)

                if (fileId && fileId !== key) {
                    globalKeyToFileIdMap.set(globalKey, fileId)
                    Utils.log(`BlobSource.set: stored key->fileId mapping: globalKey=${globalKey}, key=${key} -> ${fileId}`)
                }

                return key
            } catch (err) {
                Utils.logError(`BlobSource.set failed: ${err}`)
                console.error('Failed to upload blob:', err)
                return key
            }
        },

        async delete(key: string): Promise<void> {
            Utils.log(`BlobSource.delete called with key: ${key}`)
            const globalKey = makeGlobalKey(boardId, key)
            globalBlobCache.delete(globalKey)
            globalKeyToFileIdMap.delete(globalKey)
        },

        async list(): Promise<string[]> {
            Utils.log('BlobSource.list called')
            const prefix = `${boardId}:`
            const keys: string[] = []
            globalBlobCache.forEach((_, k) => {
                if (k.startsWith(prefix)) {
                    keys.push(k.substring(prefix.length))
                }
            })
            return keys
        },
    }
}
