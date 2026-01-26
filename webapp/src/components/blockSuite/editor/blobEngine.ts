// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { BlobSource, IndexedDBBlobSource } from '@blocksuite/sync'

import octoClient from '../../../octoClient'

/**
 * Mattermost 파일 API를 사용하는 BlobSource 구현 (IndexedDB 캐시 포함)
 * BlockSuite 에디터의 이미지/첨부파일 업로드/다운로드를 처리합니다.
 * 
 * 성능 최적화:
 * - get(): IndexedDB 캐시에서 먼저 찾고, 없으면 서버에서 가져와서 캐시
 * - set(): 서버에 업로드 후 IndexedDB에 캐시
 * 
 * 참고: BlockSuite는 blob의 hash를 key로 사용하지만, Mattermost는 자체 fileId를 생성합니다.
 * set()에서 fileId를 반환하여 BlockSuite 문서에 fileId가 저장되도록 합니다.
 */
export class MattermostBlobEngine implements BlobSource {
    readonly name = 'mattermost'
    readonly = false
    private boardId: string
    
    // IndexedDB 캐시 - 로컬에서 빠르게 이미지를 로드
    private cache: IndexedDBBlobSource

    constructor(boardId: string) {
        this.boardId = boardId
        this.cache = new IndexedDBBlobSource(`focalboard_blob_${boardId}`)
        console.log('[MattermostBlobEngine] Created for board:', boardId, 'with IndexedDB cache')
    }

    /**
     * Blob 다운로드 (이미지 렌더링 시 호출됨)
     * 1. IndexedDB 캐시에서 먼저 찾음 (빠름)
     * 2. 캐시에 없으면 서버에서 가져와서 캐시에 저장
     * @param key Mattermost fileId (스냅샷에 저장된 값)
     */
    async get(key: string): Promise<Blob | null> {
        console.log('[MattermostBlobEngine] get() called with key:', key)
        
        try {
            // 1. IndexedDB 캐시에서 먼저 찾기
            const cached = await this.cache.get(key)
            if (cached) {
                console.log('[MattermostBlobEngine] ✅ Cache hit for:', key)
                return cached
            }
            console.log('[MattermostBlobEngine] Cache miss for:', key, '- fetching from server')
            
            // 2. 캐시에 없으면 서버에서 가져오기
            // key에서 확장자 제거 (예: "abc123.gif" -> "abc123")
            const fileId = key.includes('.') ? key.split('.')[0] : key
            
            console.log('[MattermostBlobEngine] Fetching from server, fileId:', fileId, 'boardId:', this.boardId)
            
            const blob = await octoClient.getFileAsBlob(this.boardId, fileId)
            
            if (!blob) {
                console.error(`[MattermostBlobEngine] Failed to get blob ${key}: no blob returned`)
                return null
            }
            
            console.log('[MattermostBlobEngine] Downloaded blob:', key, 'size:', blob.size, 'type:', blob.type)
            
            // 3. 캐시에 저장 (백그라운드로 처리하여 렌더링 지연 방지)
            this.cache.set(key, blob).catch(err => {
                console.warn('[MattermostBlobEngine] Failed to cache blob:', key, err)
            })
            
            return blob
        } catch (error) {
            console.error(`[MattermostBlobEngine] Error downloading blob ${key}:`, error)
            return null
        }
    }

    /**
     * Blob 업로드 (이미지 드래그앤드롭/붙여넣기 시 호출됨)
     * 1. 서버에 업로드
     * 2. IndexedDB 캐시에 저장 (fileId를 key로)
     * 3. fileId 반환 (BlockSuite가 문서에 fileId를 저장)
     * 
     * @param key 클라이언트에서 생성한 키 (SHA hash) - 사용하지 않음
     * @param value 업로드할 Blob 데이터
     * @returns fileId (Mattermost에서 생성한 파일 ID)
     */
    async set(key: string, value: Blob): Promise<string> {
        console.log('[MattermostBlobEngine] set() called with key:', key, 'blob size:', value.size, 'type:', value.type)
        
        // 이미 캐시에 있는지 확인 (중복 업로드 방지)
        const cached = await this.cache.get(key)
        if (cached) {
            console.log('[MattermostBlobEngine] Blob already cached with key:', key)
            return key
        }
        
        try {
            // 1. 서버에 업로드
            const extension = this.getExtensionFromMimeType(value.type)
            const filename = `image_${key.substring(0, 8)}${extension}`
            const file = new File([value], filename, { type: value.type })
            
            console.log('[MattermostBlobEngine] Uploading file:', filename, 'to board:', this.boardId)
            const fileId = await octoClient.uploadFile(this.boardId, file)
            
            if (!fileId) {
                throw new Error('Failed to upload file to Mattermost - no fileId returned')
            }
            
            console.log('[MattermostBlobEngine] Upload successful, fileId:', fileId)
            
            // 2. IndexedDB 캐시에 저장 (fileId를 key로 사용)
            await this.cache.set(fileId, value)
            console.log('[MattermostBlobEngine] Cached blob with fileId:', fileId)
            
            // 3. fileId 반환 (BlockSuite가 문서에 fileId를 저장)
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
