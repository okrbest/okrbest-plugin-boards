// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { effects as blocksEffects } from '@blocksuite/blocks/effects'
import { effects as presetsEffects } from '@blocksuite/presets/effects'

declare global {
    interface Window {
        __BLOCKSUITE_EFFECTS_INITIALIZED__?: boolean
    }
}

if (typeof window !== 'undefined' && !window.__BLOCKSUITE_EFFECTS_INITIALIZED__) {
    blocksEffects()
    presetsEffects()
    window.__BLOCKSUITE_EFFECTS_INITIALIZED__ = true
}

import { PageEditor } from '@blocksuite/presets'
import { AffineSchemas } from '@blocksuite/blocks/schemas'
import { Doc, DocCollection, Schema } from '@blocksuite/store'

import { Card } from '../../../blocks/card'
import { loadDataIntoCollection } from '../../../utils/blockSuiteUtils'

import { MattermostBlobEngine } from './blobEngine'

export interface EditorInitResult {
    editor: PageEditor;
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
    // MattermostBlobEngine은 내부에 IndexedDB 캐시를 포함
    // - get(): IndexedDB 캐시에서 먼저 찾고, 없으면 서버에서 가져와서 캐시
    // - set(): 서버에 업로드 후 IndexedDB에 캐시
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
    // 플러그인이 재로드될 때 import된 PageEditor 클래스와 customElements에 등록된 클래스가
    // 달라질 수 있으므로, 등록된 클래스를 우선 사용하여 'Illegal constructor' 에러 방지
    const RegisteredPageEditor = customElements.get('page-editor') as (new () => PageEditor) | undefined
    const editor = RegisteredPageEditor ? new RegisteredPageEditor() : new PageEditor()
    editor.doc = doc

    console.log('[Editor] Editor initialized successfully')
    console.log('[Editor] Doc ID:', doc.id)
    console.log('[Editor] Collection ID:', collection.id)

    return { editor, doc, collection }
}
