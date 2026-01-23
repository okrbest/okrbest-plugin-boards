// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {BlobSource} from '@blocksuite/sync'

import octoClient from '../../octoClient'

export function createFocalboardBlobSource(boardId: string): BlobSource {
    return {
        name: 'focalboard',
        readonly: false,

        async get(key: string): Promise<Blob | null> {
            if (!key) {
                return null
            }

            try {
                const fileInfo = await octoClient.getFileAsDataUrl(boardId, key)
                if (!fileInfo?.url) {
                    return null
                }

                const response = await fetch(fileInfo.url)
                if (!response.ok) {
                    return null
                }

                return await response.blob()
            } catch (err) {
                console.error('Failed to fetch blob:', key, err)
                return null
            }
        },

        async set(key: string, value: Blob): Promise<string> {
            try {
                const file = new File([value], key, {type: value.type})
                const fileId = await octoClient.uploadFile(boardId, file)
                return fileId || key
            } catch (err) {
                console.error('Failed to upload blob:', err)
                return key
            }
        },

        async delete(key: string): Promise<void> {
            console.warn('Blob delete not implemented:', key)
        },

        async list(): Promise<string[]> {
            return []
        },
    }
}
