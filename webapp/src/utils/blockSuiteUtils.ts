// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { Doc } from '@blocksuite/store'
import * as Y from 'yjs'

import octoClient from '../octoClient'
import { Block } from '../blocks/block'
import { Card } from '../blocks/card'

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
    // 1. 기본 구조 생성
    const pageId = doc.addBlock('affine:page' as any, {})
    doc.addBlock('affine:surface' as any, {}, pageId)
    const noteId = doc.addBlock('affine:note' as any, {}, pageId)

    // 2. 정렬 (contentOrder가 있다면 그것을 따라야 함)
    const contentOrder = card.fields?.contentOrder || []
    
    // contentOrder가 중첩 배열(string | string[])일 수 있으므로 flat하게 만듦 (간단한 구현을 위해)
    // 실제로는 중첩 구조를 지원해야 할 수도 있지만, 1차적으로는 평탄화하여 순서대로 넣음
    const flatContentOrder: string[] = []
    contentOrder.forEach(item => {
        if (Array.isArray(item)) {
            flatContentOrder.push(...item)
        } else {
            flatContentOrder.push(item)
        }
    })

    const sortedBlocks = [...blocks].sort((a, b) => {
        const aIndex = flatContentOrder.indexOf(a.id)
        const bIndex = flatContentOrder.indexOf(b.id)
        if (aIndex === -1 && bIndex === -1) return 0
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
    })

    // 3. 변환 및 추가
    sortedBlocks.forEach(block => {
        const text = new Y.Text(block.title)
        
        switch (block.type) {
        case 'text':
            doc.addBlock('affine:paragraph' as any, { text } as any, noteId)
            break
        case 'image':
            // fileId를 sourceId로 매핑
            doc.addBlock('affine:image' as any, { 
                sourceId: block.fields.fileId, 
                width: block.fields.width || 0,
                height: block.fields.height || 0
            } as any, noteId)
            break
        case 'checkbox':
            doc.addBlock('affine:list' as any, { 
                type: 'todo', 
                text,
                checked: !!block.fields.value
            } as any, noteId)
            break
        case 'h1':
            doc.addBlock('affine:paragraph' as any, { type: 'h1', text } as any, noteId)
            break
        case 'h2':
            doc.addBlock('affine:paragraph' as any, { type: 'h2', text } as any, noteId)
            break
        case 'h3':
            doc.addBlock('affine:paragraph' as any, { type: 'h3', text } as any, noteId)
            break
        case 'quote':
            doc.addBlock('affine:paragraph' as any, { type: 'quote', text } as any, noteId)
            break
        case 'divider':
            doc.addBlock('affine:divider' as any, {}, noteId)
            break
        case 'list-item': {
            const listType = block.fields.listType || 'bulleted'
            doc.addBlock('affine:list' as any, { 
                type: listType === 'numbered' ? 'numbered' : 'bulleted', 
                text 
            } as any, noteId)
            break
        }
        case 'video':
            // TODO: 비디오 지원 확인 필요, 일단 embed로 매핑
            doc.addBlock('affine:embed' as any, { 
                type: 'video',
                sourceId: block.fields.fileId,
                // filename 정보가 있다면 좋음
            } as any, noteId)
            break
        case 'attachment':
            doc.addBlock('affine:attachment' as any, { 
                sourceId: block.fields.fileId, 
                name: block.fields.filename || 'attachment',
                size: block.fields.size || 0
            } as any, noteId)
            break
        default:
            // 알 수 없는 타입은 텍스트로 처리
            const fallbackText = new Y.Text(block.title) // 원본 텍스트 유지
            doc.addBlock('affine:paragraph' as any, { text: fallbackText } as any, noteId)
            break
        }
    })
}
