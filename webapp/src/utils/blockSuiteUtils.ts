// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { Doc } from '@blocksuite/store'
import * as Y from 'yjs'

import octoClient from '../octoClient'
import { Block } from '../blocks/block'
import { Card } from '../blocks/card'

/**
 * 이미지 URL 생성 (Mattermost 파일 API 사용)
 * BlockSuite 이미지 블록에서 사용할 URL을 생성합니다.
 */
export function getImageUrl(boardId: string, fileId: string): string {
    const baseUrl = octoClient.getBaseURL()
    // teamId는 octoClient의 public 속성
    const teamId = (octoClient as any).teamId || '0'
    // 파일 URL 패턴: /api/v2/files/teams/{teamId}/{boardId}/{fileId}
    return `${baseUrl}/api/v2/files/teams/${teamId}/${boardId}/${fileId}`
}

/**
 * 이미지 파일 업로드 및 BlockSuite 이미지 블록 생성
 */
export async function uploadImageToBlockSuite(
    boardId: string,
    file: File,
    doc: Doc,
    parentId: string
): Promise<string | null> {
    try {
        // Mattermost 파일 API로 업로드
        const fileId = await octoClient.uploadFile(boardId, file)
        
        if (!fileId) {
            console.error('Failed to upload file')
            return null
        }

        // 이미지 크기 정보 가져오기 (선택사항)
        const imageSize = await getImageSize(file)
        
        // BlockSuite 이미지 블록 생성
        const imageBlockId = doc.addBlock('affine:image' as any, {
            sourceId: fileId,
            filename: file.name,
            width: imageSize.width || 0,
            height: imageSize.height || 0,
        } as any, parentId)

        return imageBlockId
    } catch (error) {
        console.error('Failed to upload image to BlockSuite', error)
        return null
    }
}

/**
 * 이미지 파일 크기 가져오기
 */
function getImageSize(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        
        img.onload = () => {
            URL.revokeObjectURL(url)
            resolve({ width: img.width, height: img.height })
        }
        
        img.onerror = () => {
            URL.revokeObjectURL(url)
            resolve({ width: 0, height: 0 })
        }
        
        img.src = url
    })
}

export async function loadData(card: Card, doc: Doc) {
    try {
        const info = await octoClient.getBlockSuiteInfo(card.id)

        if (info) {
            const snapshot = await octoClient.getBlockSuiteContent(card.id)
            // applyUpdate requires Uint8Array
            Y.applyUpdate(doc.spaceDoc, new Uint8Array(snapshot))
        } else {
            // 마이그레이션: 기존 블록 가져오기
            // cardId를 parentId로 가지는 블록들을 조회
            const legacyBlocks = await octoClient.getBlocksWithParent(card.id)
            
            if (legacyBlocks && legacyBlocks.length > 0) {
                convertAndApplyBlocks(legacyBlocks, card, doc)
            } else {
                // 블록이 없는 경우에도 기본 페이지 구조는 생성해야 함
                initEmptyPage(doc)
            }
            
            // 자동 저장
            const snapshot = Y.encodeStateAsUpdate(doc.spaceDoc)
            await octoClient.saveBlockSuiteContent(card.id, snapshot)
        }
    } catch (e) {
        console.error("Failed to load BlockSuite data", e)
    }
}

function initEmptyPage(doc: Doc) {
    // 이미 페이지가 있는지 확인
    if (doc.getBlocks().length > 0) return

    const pageId = doc.addBlock('affine:page' as any, {})
    doc.addBlock('affine:surface' as any, {}, pageId)
    const noteId = doc.addBlock('affine:note' as any, {}, pageId)
    doc.addBlock('affine:paragraph' as any, {}, noteId) // 빈 문단 하나 추가
}

function convertAndApplyBlocks(blocks: Block[], card: Card, doc: Doc) {
    if (!blocks || blocks.length === 0) {
        console.warn('No blocks to convert')
        initEmptyPage(doc)
        return
    }

    try {
        // 1. 기본 구조 생성
        const pageId = doc.addBlock('affine:page' as any, {})
        doc.addBlock('affine:surface' as any, {}, pageId)
        const noteId = doc.addBlock('affine:note' as any, {}, pageId)

        // 2. 정렬 (contentOrder가 있다면 그것을 따라야 함)
        const contentOrder = card.fields?.contentOrder || []
        
        // contentOrder가 중첩 배열(string | string[])일 수 있으므로 flat하게 만듦
        // 실제로는 중첩 구조를 지원해야 할 수도 있지만, 1차적으로는 평탄화하여 순서대로 넣음
        const flatContentOrder: string[] = []
        contentOrder.forEach(item => {
            if (Array.isArray(item)) {
                flatContentOrder.push(...item)
            } else if (typeof item === 'string') {
                flatContentOrder.push(item)
            }
        })

        // contentOrder에 없는 블록도 포함하여 정렬
        const sortedBlocks = [...blocks].sort((a, b) => {
            const aIndex = flatContentOrder.indexOf(a.id)
            const bIndex = flatContentOrder.indexOf(b.id)
            if (aIndex === -1 && bIndex === -1) return 0
            if (aIndex === -1) return 1 // contentOrder에 없는 블록은 뒤로
            if (bIndex === -1) return -1
            return aIndex - bIndex
        })

        // 3. 변환 및 추가 (에러 처리 포함)
        const convertedCount = { success: 0, failed: 0 }
        
        sortedBlocks.forEach((block, index) => {
            try {
                convertBlock(block, noteId, doc)
                convertedCount.success++
            } catch (error) {
                console.error(`Failed to convert block ${block.id} (type: ${block.type})`, error)
                convertedCount.failed++
                // 실패한 블록은 텍스트로 fallback
                try {
                    const fallbackText = new Y.Text(block.title || `[Block conversion failed: ${block.type}]`)
                    doc.addBlock('affine:paragraph' as any, { text: fallbackText } as any, noteId)
                } catch (fallbackError) {
                    console.error(`Failed to add fallback block for ${block.id}`, fallbackError)
                }
            }
        })

        // 변환 결과 로깅
        if (convertedCount.failed > 0) {
            console.warn(`Block conversion completed: ${convertedCount.success} success, ${convertedCount.failed} failed`)
        } else {
            console.log(`Block conversion completed: ${convertedCount.success} blocks converted successfully`)
        }
    } catch (error) {
        console.error('Failed to convert blocks', error)
        // 에러 발생 시 기본 페이지라도 생성
        initEmptyPage(doc)
        throw error
    }
}

/**
 * 단일 블록을 BlockSuite 형식으로 변환
 */
function convertBlock(block: Block, parentId: string, doc: Doc): void {
    const text = block.title ? new Y.Text(block.title) : new Y.Text()
    
    // 공통 필드: 원본 타입 보존 (역마이그레이션 가능)
    const commonFields: Record<string, any> = {
        originalType: block.type, // 원본 타입 보존
        originalId: block.id, // 원본 ID 보존 (필요시)
    }

    switch (block.type) {
    case 'text':
        doc.addBlock('affine:paragraph' as any, { 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'image': {
        // fileId를 sourceId로 매핑
        const props: Record<string, any> = {
            sourceId: block.fields?.fileId || '',
            width: block.fields?.width || 0,
            height: block.fields?.height || 0,
            ...commonFields
        }
        
        // filename이 있다면 추가
        if (block.fields?.filename) {
            props.filename = block.fields.filename
        }
        
        doc.addBlock('affine:image' as any, props as any, parentId)
        break
    }

    case 'checkbox':
        doc.addBlock('affine:list' as any, { 
            type: 'todo', 
            text,
            checked: !!block.fields?.value,
            ...commonFields
        } as any, parentId)
        break

    case 'h1':
        doc.addBlock('affine:paragraph' as any, { 
            type: 'h1', 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'h2':
        doc.addBlock('affine:paragraph' as any, { 
            type: 'h2', 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'h3':
        doc.addBlock('affine:paragraph' as any, { 
            type: 'h3', 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'quote':
        doc.addBlock('affine:paragraph' as any, { 
            type: 'quote', 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'divider':
        doc.addBlock('affine:divider' as any, {
            ...commonFields
        } as any, parentId)
        break

    case 'list-item': {
        const listType = block.fields?.listType || 'bulleted'
        doc.addBlock('affine:list' as any, { 
            type: listType === 'numbered' ? 'numbered' : 'bulleted', 
            text,
            ...commonFields
        } as any, parentId)
        break
    }

    case 'video': {
        const props: Record<string, any> = {
            type: 'video',
            sourceId: block.fields?.fileId || '',
            ...commonFields
        }
        
        // filename이 있다면 추가
        if (block.fields?.filename) {
            props.filename = block.fields.filename
        }
        
        doc.addBlock('affine:embed' as any, props as any, parentId)
        break
    }

    case 'attachment': {
        const props: Record<string, any> = {
            sourceId: block.fields?.fileId || '', 
            name: block.fields?.filename || block.fields?.name || 'attachment',
            size: block.fields?.size || 0,
            ...commonFields
        }
        
        // URL이 있다면 추가 (기존 파일 API)
        if (block.fields?.url) {
            props.url = block.fields.url
        }
        
        doc.addBlock('affine:attachment' as any, props as any, parentId)
        break
    }

    default:
        // 알 수 없는 타입은 텍스트로 처리 (원본 정보 보존)
        const fallbackText = new Y.Text(block.title || `[Unknown block type: ${block.type}]`)
        doc.addBlock('affine:paragraph' as any, { 
            text: fallbackText,
            ...commonFields
        } as any, parentId)
        break
    }
}
