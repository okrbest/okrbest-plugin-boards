// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {DocSnapshot} from '@blocksuite/store'

import {Utils} from '../../utils'

/**
 * BlockSuite 문서 메타데이터
 */
export interface BlockSuiteDocInfo {
    cardId: string
    size: number
    version: number
    createdAt: number
    updatedAt: number
}

/**
 * BlockSuite API 응답 타입
 */
interface SaveDocResponse {
    cardId: string
    size: number
    version: number
}

/**
 * BlockSuite API 클라이언트
 *
 * 백엔드 API 엔드포인트:
 * - GET  /cards/{cardId}/blocksuite/content - DocSnapshot JSON 로드
 * - PUT  /cards/{cardId}/blocksuite/content - DocSnapshot JSON 저장
 * - GET  /cards/{cardId}/blocksuite/info    - 문서 메타데이터 조회
 * - DELETE /cards/{cardId}/blocksuite       - 문서 삭제
 */
class BlockSuiteApiClient {
    private getBaseURL(): string {
        return Utils.getBaseURL(true).replace(/\/$/, '')
    }

    private getHeaders(): Record<string, string> {
        return {
            'X-Requested-With': 'XMLHttpRequest',
        }
    }

    private getJsonHeaders(): Record<string, string> {
        return {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
        }
    }

    /**
     * BlockSuite 문서 존재 여부 및 메타데이터 확인
     * @param cardId 카드 ID
     * @returns 문서 정보 또는 null (404인 경우)
     */
    async getDocInfo(cardId: string): Promise<BlockSuiteDocInfo | null> {
        const url = `${this.getBaseURL()}/api/v2/cards/${encodeURIComponent(cardId)}/blocksuite/info`

        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: this.getHeaders(),
            })

            if (response.status === 404) {
                return null
            }

            if (!response.ok) {
                throw new Error(`Failed to get doc info: ${response.status}`)
            }

            return await response.json() as BlockSuiteDocInfo
        } catch (error) {
            Utils.logError(`BlockSuiteApi.getDocInfo error: ${error}`)
            throw error
        }
    }

    /**
     * BlockSuite 문서 DocSnapshot JSON 로드
     * @param cardId 카드 ID
     * @returns DocSnapshot 또는 null (404인 경우)
     */
    async getDocContent(cardId: string): Promise<DocSnapshot | null> {
        const url = `${this.getBaseURL()}/api/v2/cards/${encodeURIComponent(cardId)}/blocksuite/content`

        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: this.getHeaders(),
            })

            if (response.status === 404) {
                return null
            }

            if (!response.ok) {
                throw new Error(`Failed to get doc content: ${response.status}`)
            }

            return await response.json() as DocSnapshot
        } catch (error) {
            Utils.logError(`BlockSuiteApi.getDocContent error: ${error}`)
            throw error
        }
    }

    /**
     * BlockSuite 문서 DocSnapshot JSON 저장
     * @param cardId 카드 ID
     * @param snapshot DocSnapshot JSON
     * @returns 저장된 문서 정보
     */
    async saveDocContent(cardId: string, snapshot: DocSnapshot): Promise<SaveDocResponse> {
        const url = `${this.getBaseURL()}/api/v2/cards/${encodeURIComponent(cardId)}/blocksuite/content`

        try {
            const response = await fetch(url, {
                method: 'PUT',
                credentials: 'include',
                headers: this.getJsonHeaders(),
                body: JSON.stringify(snapshot),
            })

            if (!response.ok) {
                throw new Error(`Failed to save doc content: ${response.status}`)
            }

            return await response.json() as SaveDocResponse
        } catch (error) {
            Utils.logError(`BlockSuiteApi.saveDocContent error: ${error}`)
            throw error
        }
    }

    /**
     * BlockSuite 문서 삭제
     * @param cardId 카드 ID
     */
    async deleteDoc(cardId: string): Promise<void> {
        const url = `${this.getBaseURL()}/api/v2/cards/${encodeURIComponent(cardId)}/blocksuite`

        try {
            const response = await fetch(url, {
                method: 'DELETE',
                credentials: 'include',
                headers: this.getHeaders(),
            })

            if (!response.ok && response.status !== 404) {
                throw new Error(`Failed to delete doc: ${response.status}`)
            }
        } catch (error) {
            Utils.logError(`BlockSuiteApi.deleteDoc error: ${error}`)
            throw error
        }
    }
}

const blockSuiteApi = new BlockSuiteApiClient()
export default blockSuiteApi
export {BlockSuiteApiClient}
