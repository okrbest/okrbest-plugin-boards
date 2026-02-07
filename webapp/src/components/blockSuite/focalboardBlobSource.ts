// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {BlobSource} from '@blocksuite/sync'
import type {DocSnapshot, BlockSnapshot} from '@blocksuite/store'

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

function makeGlobalKey(boardId: string, key: string): string {
    return `${boardId}:${key}`
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

            try {
                const fileId = globalKeyToFileIdMap.get(globalKey) || key

                Utils.log(`BlobSource.get: fetching file from server, boardId=${boardId}, teamId=${teamId}, key=${key}, fileId=${fileId}`)
                const fileInfo = await octoClient.getFileAsDataUrl(boardId, fileId, teamId)
                Utils.log(`BlobSource.get: fileInfo=${JSON.stringify(fileInfo)}`)

                if (!fileInfo?.url) {
                    Utils.log('BlobSource.get: no url in fileInfo, returning null')
                    return null
                }

                const response = await fetch(fileInfo.url)
                if (!response.ok) {
                    Utils.log(`BlobSource.get: fetch failed with status ${response.status}`)
                    return null
                }

                let blob = await response.blob()
                Utils.log(`BlobSource.get: successfully fetched blob, size=${blob.size}, type=${blob.type}`)

                blob = ensureImageMimeType(blob, fileId)

                globalBlobCache.set(globalKey, blob)

                return blob
            } catch (err) {
                Utils.logError(`BlobSource.get failed: ${err}`)
                console.error('Failed to fetch blob:', key, err)
                return null
            }
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
