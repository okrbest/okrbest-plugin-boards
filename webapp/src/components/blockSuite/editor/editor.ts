// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// BlockSuite Web Components 등록 (반드시 다른 import 전에 호출)
import { effects as blocksEffects } from '@blocksuite/blocks/effects'
import { effects as presetsEffects } from '@blocksuite/presets/effects'

// Custom Elements 등록 (한 번만 실행)
blocksEffects()
presetsEffects()

import { AffineEditorContainer } from '@blocksuite/presets'
import { AffineSchemas } from '@blocksuite/blocks/schemas'
import { Doc, DocCollection, Schema } from '@blocksuite/store'

import { Card } from '../../../blocks/card'
import { loadDataIntoCollection } from '../../../utils/blockSuiteUtils'

import { MattermostBlobEngine } from './blobEngine'

export interface EditorInitResult {
    editor: AffineEditorContainer;
    doc: Doc;
    collection: DocCollection;
}

/**
 * BlockSuite 에디터 초기화 (데이터 로드 포함)
 * 데이터를 먼저 로드한 후 에디터에 연결하여 렌더링 오류 방지
 * @param cardId 카드 ID
 * @param boardId 보드 ID (이미지 업로드를 위해 필요)
 * @param card 카드 정보 (데이터 로드용)
 * @returns 초기화된 에디터, doc, collection
 */
export async function initEditor(cardId: string, boardId: string, card: Card): Promise<EditorInitResult> {
    // 유효성 확인
    if (!cardId || typeof cardId !== 'string' || cardId.trim() === '') {
        throw new Error(`Invalid cardId: ${cardId}`)
    }
    if (!boardId || typeof boardId !== 'string' || boardId.trim() === '') {
        throw new Error(`Invalid boardId: ${boardId}`)
    }

    console.log('[Editor] Initializing editor for card:', cardId, 'board:', boardId)

    // 1. Schema 등록
    const schema = new Schema().register(AffineSchemas)

    // 2. BlobEngine 생성
    const blobEngine = new MattermostBlobEngine(boardId)

    // 3. DocCollection 생성
    const collection = new DocCollection({ 
        schema,
        blobSources: {
            main: blobEngine
        }
    })
    
    // 메타데이터 초기화
    collection.meta.initialize()

    // 4. 데이터 로드 (에디터 연결 전에 수행)
    // Job.snapshotToDoc을 사용하여 올바른 Y.js 구조 생성
    console.log('[Editor] Loading data before editor mount...')
    const doc = await loadDataIntoCollection(card, collection)
    console.log('[Editor] Data loaded, doc ID:', doc.id)

    // 5. 에디터 생성 및 설정 (데이터가 로드된 doc에 연결)
    const editor = new AffineEditorContainer()
    editor.doc = doc

    console.log('[Editor] Editor initialized successfully')
    console.log('[Editor] Doc ID:', doc.id)
    console.log('[Editor] Collection ID:', collection.id)

    return { editor, doc, collection }
}
