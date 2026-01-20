// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { BlobSource } from '@blocksuite/sync'

import octoClient from '../../../octoClient'

/**
 * Mattermost 파일 API를 사용하는 BlobSource 구현
 * BlockSuite 에디터의 이미지/첨부파일 업로드/다운로드를 처리합니다.
 * 
 * BlockSuite는 blob의 hash를 key로 사용하지만, Mattermost는 자체 fileId를 생성합니다.
 * 이 매핑을 관리하기 위해 keyToFileId 맵을 사용합니다.
 */
export class MattermostBlobEngine implements BlobSource {
    readonly name = 'mattermost'
    readonly = false
    private boardId: string
    
    // BlockSuite blob key (hash) -> Mattermost fileId 매핑
    // 업로드 시 저장하고, 다운로드 시 참조합니다.
    private keyToFileId: Map<string, string> = new Map()

    constructor(boardId: string) {
        this.boardId = boardId
        console.log('[MattermostBlobEngine] Created for board:', boardId)
    }

    /**
     * Blob 다운로드 (이미지 렌더링 시 호출됨)
     * @param key BlockSuite blob key 또는 Mattermost fileId
     */
    async get(key: string): Promise<Blob | null> {
        console.log('[MattermostBlobEngine] get() called with key:', key)
        try {
            // 1. 먼저 key가 매핑에 있는지 확인 (업로드 직후 조회하는 경우)
            let fileId = this.keyToFileId.get(key)
            
            if (fileId) {
                console.log('[MattermostBlobEngine] Found fileId in mapping:', fileId)
            } else {
                // 2. 매핑에 없으면 key 자체가 fileId일 수 있음 (기존에 저장된 이미지)
                // key에서 확장자 제거 (예: "abc123.gif" -> "abc123")
                fileId = key.includes('.') ? key.split('.')[0] : key
                console.log('[MattermostBlobEngine] Using key as fileId:', fileId)
            }
            
            console.log('[MattermostBlobEngine] Fetching file with fileId:', fileId, 'boardId:', this.boardId)
            
            // octoClient를 사용하여 인증된 요청 수행
            const blob = await octoClient.getFileAsBlob(this.boardId, fileId)
            
            if (!blob) {
                console.error(`[MattermostBlobEngine] Failed to get blob ${key}: no blob returned`)
                return null
            }
            
            console.log('[MattermostBlobEngine] Downloaded blob:', key, 'size:', blob.size, 'type:', blob.type)
            return blob
        } catch (error) {
            console.error(`[MattermostBlobEngine] Error downloading blob ${key}:`, error)
            return null
        }
    }

    /**
     * Blob 업로드 (이미지 드래그앤드롭/붙여넣기 시 호출됨)
     * @param key 클라이언트에서 생성한 키 (SHA hash)
     * @param value 업로드할 Blob 데이터
     * @returns key 그대로 반환 (BlockSuite가 이 key를 문서에 저장함)
     * 
     * 중요: BlockSuite는 set()에서 반환된 값을 blob의 새 key로 사용합니다.
     * Mattermost fileId를 반환하면 BlockSuite가 문서에 fileId를 저장하게 됩니다.
     * 하지만 BlockSuite가 이미 hash를 계산해서 set()을 호출했으므로,
     * 내부적으로 매핑을 관리하고 원래 key를 반환하는 것이 안전합니다.
     */
    async set(key: string, value: Blob): Promise<string> {
        console.log('[MattermostBlobEngine] set() called with key:', key, 'blob size:', value.size, 'type:', value.type)
        
        // 이미 이 key에 대한 업로드가 진행 중이거나 완료된 경우 스킵
        if (this.keyToFileId.has(key)) {
            console.log('[MattermostBlobEngine] Key already mapped, returning fileId:', this.keyToFileId.get(key))
            return this.keyToFileId.get(key)!
        }
        
        try {
            // Blob을 File 객체로 변환 (파일명은 key 기반으로 생성)
            const extension = this.getExtensionFromMimeType(value.type)
            const filename = `image_${key.substring(0, 8)}${extension}`
            const file = new File([value], filename, { type: value.type })
            
            console.log('[MattermostBlobEngine] Uploading file:', filename, 'to board:', this.boardId)
            const fileId = await octoClient.uploadFile(this.boardId, file)
            
            if (!fileId) {
                throw new Error('Failed to upload file to Mattermost - no fileId returned')
            }
            
            // 매핑 저장: BlockSuite key -> Mattermost fileId
            this.keyToFileId.set(key, fileId)
            console.log('[MattermostBlobEngine] Upload successful, fileId:', fileId, 'mapped from key:', key)
            
            // fileId를 반환하여 BlockSuite 문서에 fileId가 저장되도록 함
            return fileId
        } catch (error) {
            console.error('[MattermostBlobEngine] Error uploading blob:', error)
            throw error
        }
    }

    /**
     * MIME 타입에서 파일 확장자 추출
     */
    private getExtensionFromMimeType(mimeType: string): string {
        const mimeToExt: Record<string, string> = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/svg+xml': '.svg',
            'image/bmp': '.bmp',
        }
        return mimeToExt[mimeType] || '.png'
    }

    async delete(key: string): Promise<void> {
        console.warn('[MattermostBlobEngine] delete() called for key:', key, '- not implemented')
        // Mattermost 파일 삭제 API가 필요하면 여기에 구현
    }

    async list(): Promise<string[]> {
        console.log('[MattermostBlobEngine] list() called - returning empty array')
        // 보드의 모든 파일 목록을 반환해야 하지만, 현재는 지원하지 않음
        return []
    }
}
