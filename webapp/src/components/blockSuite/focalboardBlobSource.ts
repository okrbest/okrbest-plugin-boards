// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {BlobSource} from '@blocksuite/sync'
import type {DocSnapshot, BlockSnapshot} from '@blocksuite/store'

import octoClient from '../../octoClient'
import {Utils} from '../../utils'

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
    globalKeyToFileIdMap.forEach((fileId, globalKey) => {
        if (globalKey.startsWith(prefix)) {
            const key = globalKey.substring(prefix.length)
            result[key] = fileId
        }
    })
    return result
}

export function restoreBlobMappings(boardId: string, mappings: Record<string, string>): void {
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

export function prepareSnapshotForSave(snapshot: DocSnapshot, boardId: string): DocSnapshot {
    const blobMap = getAllBlobMappings(boardId)
    if (Object.keys(blobMap).length === 0) {
        return snapshot
    }

    Utils.log(`prepareSnapshotForSave: saving ${Object.keys(blobMap).length} blob mappings`)

    const extended = snapshot as ExtendedDocSnapshot
    return {
        ...extended,
        meta: {
            ...extended.meta,
            blobMap,
        },
    }
}

export function restoreSnapshotBlobMappings(snapshot: DocSnapshot, boardId: string): void {
    const extended = snapshot as ExtendedDocSnapshot
    if (extended.meta?.blobMap) {
        Utils.log(`restoreSnapshotBlobMappings: found ${Object.keys(extended.meta.blobMap).length} mappings`)
        restoreBlobMappings(boardId, extended.meta.blobMap)
    }
}

export function createFocalboardBlobSource(boardId: string): BlobSource {
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

                Utils.log(`BlobSource.get: fetching file from server, boardId=${boardId}, key=${key}, fileId=${fileId}`)
                const fileInfo = await octoClient.getFileAsDataUrl(boardId, fileId)
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

                const blob = await response.blob()
                Utils.log(`BlobSource.get: successfully fetched blob, size=${blob.size}`)

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
                    Utils.log(`BlobSource.set: stored key->fileId mapping: ${key} -> ${fileId}`)
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
