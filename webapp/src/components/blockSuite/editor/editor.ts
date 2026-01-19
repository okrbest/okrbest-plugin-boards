// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { AffineEditorContainer, createEmptyDoc } from '@blocksuite/presets'
import { Doc, DocCollection } from '@blocksuite/store'

import { Card } from '../../../blocks/card'
import { loadData } from '../../../utils/blockSuiteUtils'

export interface EditorInitResult {
    editor: AffineEditorContainer;
    doc: Doc;
    collection: DocCollection;
}

/**
 * BlockSuite 에디터 초기화
 * createEmptyDoc()을 사용하여 올바르게 초기화된 doc을 생성
 * @param cardId 카드 ID (참조용, doc ID는 자동 생성됨)
 * @returns 초기화된 에디터, doc, collection
 */
export function initEditor(cardId: string): EditorInitResult {
    // cardId 유효성 확인
    if (!cardId || typeof cardId !== 'string' || cardId.trim() === '') {
        throw new Error(`Invalid cardId: ${cardId}`)
    }

    console.log('[Editor] Initializing editor for card:', cardId)

    // createEmptyDoc()은 이미 초기화된 doc, collection을 반환
    // 기본 구조(page, surface, note, paragraph)가 이미 포함되어 있음
    const doc = createEmptyDoc().init()
    const collection = doc.collection

    // 에디터 생성 및 설정
    const editor = new AffineEditorContainer()
    editor.doc = doc

    console.log('[Editor] Editor initialized successfully')
    console.log('[Editor] Doc ID:', doc.id)
    console.log('[Editor] Collection ID:', collection.id)

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
