// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { AffineEditorContainer, createEmptyDoc } from '@blocksuite/presets'
import { Doc, Schema, DocCollection } from '@blocksuite/store'
import { AffineSchemas } from '@blocksuite/blocks'

import { Card } from '../../../blocks/card'
import { loadData } from '../../../utils/blockSuiteUtils'

export interface EditorInitResult {
    editor: AffineEditorContainer;
    doc: Doc;
    collection: DocCollection;
}

/**
 * BlockSuite 에디터 초기화
 * @param cardId 카드 ID (doc ID로 사용)
 * @returns 초기화된 에디터, doc, collection
 */
export function initEditor(cardId: string): EditorInitResult {
    // cardId 유효성 확인
    if (!cardId || typeof cardId !== 'string' || cardId.trim() === '') {
        throw new Error(`Invalid cardId: ${cardId}`)
    }

    const schema = new Schema().register(AffineSchemas)
    const collection = new DocCollection({ schema })
    collection.meta.initialize()

    // doc 생성 - id를 지정
    let doc: Doc
    const existingDoc = collection.getDoc(cardId)
  
    if (existingDoc) {
        doc = existingDoc
        // 기존 doc도 load() 호출
        doc.load()
    } else {
    // id를 지정하여 doc 생성
        doc = collection.createDoc({ id: cardId })
    
        if (!doc) {
            // createEmptyDoc() 사용 (fallback)
            console.warn('createDoc returned null, using createEmptyDoc', { cardId })
            const emptyDoc = createEmptyDoc()
            doc = emptyDoc.init()
            console.warn('Using auto-generated doc id instead of cardId', { 
                cardId, 
                docId: doc.id 
            })
        } else {
            // doc.load()에 callback을 전달하여 Yjs 타입이 문서에 추가되도록 기본 구조 생성
            // callback 내에서 블록을 추가하면 Yjs 타입이 문서에 추가되기 전에 블록을 추가할 수 있음
            doc.load(() => {
                // callback 내에서 기본 구조 생성 (빈 문서인 경우에만)
                try {
                    const blocks = doc.getBlocks()
                    if (blocks.length === 0) {
                        const pageId = doc.addBlock('affine:page' as never, {} as never)
                        doc.addBlock('affine:surface' as never, {} as never, pageId)
                        const noteId = doc.addBlock('affine:note' as never, {} as never, pageId)
                        doc.addBlock('affine:paragraph' as never, {} as never, noteId)
                    }
                } catch (error) {
                    console.warn('Failed to init default structure in doc.load callback:', error)
                    // 에러가 발생해도 계속 진행 (loadData에서 처리됨)
                }
            })
        }
    }

    // 에디터 생성 및 설정
    const editor = new AffineEditorContainer()
    editor.doc = doc

    return { editor, doc, collection }
}

/**
 * 에디터에 데이터 로드
 * @param editor 에디터 인스턴스
 * @param doc 문서 인스턴스
 * @param card 카드 정보
 * @returns 로드된(또는 새로 생성된) 문서
 */
export async function loadEditorData(
    _editor: AffineEditorContainer,
    doc: Doc,
    card: Card
): Promise<Doc> {
    return await loadData(card, doc)
}
