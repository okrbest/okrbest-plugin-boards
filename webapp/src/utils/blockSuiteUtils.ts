// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { Doc } from '@blocksuite/store'
import * as Y from 'yjs'

import octoClient from '../octoClient'
import { Block } from '../blocks/block'

export async function loadData(cardId: string, doc: Doc) {
    try {
        const info = await octoClient.getBlockSuiteInfo(cardId)

        if (info) {
            const snapshot = await octoClient.getBlockSuiteContent(cardId)
            // applyUpdate requires Uint8Array
            Y.applyUpdate(doc.spaceDoc, new Uint8Array(snapshot))
        } else {
            // 마이그레이션: 기존 블록 가져오기
            // cardId를 parentId로 가지는 블록들을 조회
            const legacyBlocks = await octoClient.getBlocksWithParent(cardId)
            
            if (legacyBlocks && legacyBlocks.length > 0) {
                convertAndApplyBlocks(legacyBlocks, doc)
            } else {
                // 블록이 없는 경우에도 기본 페이지 구조는 생성해야 함
                initEmptyPage(doc)
            }
            
            // 자동 저장
            const snapshot = Y.encodeStateAsUpdate(doc.spaceDoc)
            await octoClient.saveBlockSuiteContent(cardId, snapshot)
        }
    } catch (e) {
        console.error("Failed to load BlockSuite data", e)
    }
}

function initEmptyPage(doc: Doc) {
    // 이미 페이지가 있는지 확인
    if (doc.getBlocks().length > 0) return

    const pageId = doc.addBlock('affine:page', {})
    doc.addBlock('affine:surface', {}, pageId)
    const noteId = doc.addBlock('affine:note', {}, pageId)
    doc.addBlock('affine:paragraph', {}, noteId) // 빈 문단 하나 추가
}

function convertAndApplyBlocks(blocks: Block[], doc: Doc) {
    // 1. 기본 구조 생성
    const pageId = doc.addBlock('affine:page', {})
    doc.addBlock('affine:surface', {}, pageId)
    const noteId = doc.addBlock('affine:note', {}, pageId)

    // 2. 정렬 (contentOrder가 있다면 그것을 따라야 함. 일단은 배열 순서대로)
    // TODO: card.fields.contentOrder 로직 추가 필요. 현재는 blocks 순서대로.

    blocks.forEach(block => {
        switch (block.type) {
        case 'text':
            doc.addBlock('affine:paragraph', { text: new Y.Text(block.title) }, noteId)
            break
        case 'image':
            // fileId를 sourceId로 매핑
            doc.addBlock('affine:image', { 
                sourceId: block.fields.fileId, 
                width: block.fields.width,
                height: block.fields.height
            }, noteId)
            break
        case 'checkbox':
            doc.addBlock('affine:list', { 
                type: 'todo', 
                text: new Y.Text(block.title),
                checked: block.fields.value ? true : false
            }, noteId)
            break
        case 'h1':
            doc.addBlock('affine:paragraph', { type: 'h1', text: new Y.Text(block.title) }, noteId)
            break
        case 'h2':
            doc.addBlock('affine:paragraph', { type: 'h2', text: new Y.Text(block.title) }, noteId)
            break
        case 'h3':
            doc.addBlock('affine:paragraph', { type: 'h3', text: new Y.Text(block.title) }, noteId)
            break
        case 'divider':
            doc.addBlock('affine:divider', {}, noteId)
            break
            // 추가 타입들...
        default:
            // 알 수 없는 타입은 텍스트로 처리하거나 무시
            doc.addBlock('affine:paragraph', { text: new Y.Text(`[Unsupported block: ${block.type}] ${block.title}`) }, noteId)
            break
        }
    })
}
