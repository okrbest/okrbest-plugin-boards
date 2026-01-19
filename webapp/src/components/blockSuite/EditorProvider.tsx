// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useLayoutEffect, useState } from 'react'
import { Doc, DocCollection } from '@blocksuite/store'
import { AffineEditorContainer } from '@blocksuite/presets'
import { useIntl } from 'react-intl'

import { Card } from '../../blocks/card'
import octoClient from '../../octoClient'
import { sendFlashMessage } from '../flashMessages'
import { saveSnapshot } from '../../utils/blockSuiteUtils'

import { EditorContext, EditorContextValue } from './editor/context'
import { initEditor, loadEditorData } from './editor/editor'

interface EditorProviderProps {
    card: Card;
    boardId?: string;
    readOnly?: boolean;
    children: React.ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ 
    card, 
    readOnly = false,
    children 
}) => {
    const intl = useIntl()
    const [editor, setEditor] = useState<AffineEditorContainer | null>(null)
    const [doc, setDoc] = useState<Doc | null>(null)
    const [collection, setCollection] = useState<DocCollection | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)

    // 1. 에디터 초기화
    useLayoutEffect(() => {
        if (!card?.id) {
            setIsLoading(false)
            return
        }

        console.log('[EditorProvider] Initializing editor for card:', card.id, 'readOnly:', readOnly)
        setIsLoading(true)

        try {
            const { editor: newEditor, doc: newDoc, collection: newCollection } = initEditor(card.id)

            // readOnly 모드 설정
            // BlockSuite의 mode는 'page' 또는 'edgeless'만 지원
            // readonly는 doc 레벨에서 설정해야 함
            newEditor.mode = 'page'
            console.log('[EditorProvider] Editor mode set to: page, readOnly:', readOnly)

            // readonly 속성 설정 (있다면)
            if ('readonly' in newEditor) {
                (newEditor as any).readonly = readOnly
                console.log('[EditorProvider] Set editor.readonly to', readOnly)
            }

            setEditor(newEditor)
            setDoc(newDoc)
            setCollection(newCollection)
        } catch (error) {
            console.error('Failed to initialize BlockSuite editor:', error)
            setIsLoading(false)
            sendFlashMessage({
                content: intl.formatMessage({
                    id: 'blocksuite.init.error',
                    defaultMessage: 'Failed to initialize editor'
                }),
                severity: 'high'
            })
        }

        return () => {
            setEditor(null)
            setDoc(null)
            setCollection(null)
        }
    }, [card.id, readOnly, intl])

    // 2. 데이터 로드
    useEffect(() => {
        if (!editor || !doc) {
            console.log('[EditorProvider] Skipping data load: editor or doc not ready')
            return
        }

        console.log('[EditorProvider] ====== Data Load useEffect triggered ======')
        console.log('[EditorProvider] Card:', card.id, card.title)

        const loadData = async () => {
            console.log('[EditorProvider] Setting loading state...')
            setIsLoading(true)
            try {
                console.log('[EditorProvider] Calling loadEditorData...')
                const loadedDoc = await loadEditorData(editor, doc, card)
                console.log('[EditorProvider] loadEditorData returned')

                // 스냅샷 로드 시 새로운 doc이 생성되므로 에디터에 반영
                if (loadedDoc && loadedDoc !== doc) {
                    console.log('[EditorProvider] New doc created, updating editor')
                    editor.doc = loadedDoc
                    setDoc(loadedDoc)
                } else {
                    console.log('[EditorProvider] Using existing doc')
                }

                console.log('[EditorProvider] ✅ Data load completed successfully')
                setIsLoading(false)
            } catch (error) {
                console.error('[EditorProvider] ❌ Failed to load BlockSuite content:', error)
                if (error instanceof Error) {
                    console.error('[EditorProvider] Error stack:', error.stack)
                }
                setIsLoading(false)
                sendFlashMessage({
                    content: intl.formatMessage({
                        id: 'blocksuite.load.error',
                        defaultMessage: 'Failed to load editor content'
                    }),
                    severity: 'high'
                })
            }
        }

        loadData()
    }, [editor, card.id, intl])

    // 3. 자동 저장
    useEffect(() => {
        console.log('[AutoSave] useEffect triggered - doc:', !!doc, 'readOnly:', readOnly, 'isLoading:', isLoading)

        if (!doc || readOnly || isLoading) {
            console.log('[AutoSave] Skipping auto-save setup')
            return
        }

        // spaceDoc이 준비되었는지 확인
        if (!doc.spaceDoc) {
            console.warn('[AutoSave] doc.spaceDoc is not ready yet')
            return
        }

        console.log('[AutoSave] Setting up auto-save listener for card:', card.id)

        let timeout: NodeJS.Timeout
        const handleUpdate = () => {
            console.log('[AutoSave] Document updated, scheduling save...')
            clearTimeout(timeout)
            setSaveStatus('saving')

            timeout = setTimeout(async () => {
                console.log('[AutoSave] Saving snapshot...')
                try {
                    const snapshot = await saveSnapshot(doc)
                    console.log('[AutoSave] Snapshot created, size:', JSON.stringify(snapshot).length, 'bytes')
                    console.log('[AutoSave] Calling saveBlockSuiteContent for card:', card.id)

                    await octoClient.saveBlockSuiteContent(card.id, snapshot)
                    console.log('[AutoSave] ✅ Save successful')
                    setSaveStatus('saved')

                    setTimeout(() => {
                        setSaveStatus(null)
                    }, 3000)
                } catch (error) {
                    console.error('[AutoSave] ❌ Failed to auto-save:', error)
                    if (error instanceof Error) {
                        console.error('[AutoSave] Error message:', error.message)
                        console.error('[AutoSave] Error stack:', error.stack)
                    }
                    setSaveStatus('error')
                    sendFlashMessage({
                        content: intl.formatMessage({
                            id: 'blocksuite.save.error',
                            defaultMessage: 'Failed to save changes'
                        }),
                        severity: 'high'
                    })

                    setTimeout(() => {
                        setSaveStatus(null)
                    }, 5000)
                }
            }, 2000) // 2초 Debounce
        }

        // doc.spaceDoc은 내부 Y.Doc 인스턴스입니다.
        try {
            console.log('[AutoSave] Attaching update listener to spaceDoc')
            doc.spaceDoc.on('update', handleUpdate)
            console.log('[AutoSave] ✅ Update listener attached')
        } catch (error) {
            console.warn('[AutoSave] ⚠️ Failed to attach update listener to spaceDoc:', error)
            return
        }

        return () => {
            console.log('[AutoSave] Cleaning up auto-save listener')
            try {
                doc.spaceDoc.off('update', handleUpdate)
            } catch (error) {
                // cleanup 오류 무시
            }
            clearTimeout(timeout)
        }
    }, [doc, card.id, readOnly, isLoading, intl])

    const contextValue: EditorContextValue = {
        editor,
        doc,
        collection,
        card,
        isLoading,
        saveStatus,
    }

    return (
        <EditorContext.Provider value={contextValue}>
            {children}
        </EditorContext.Provider>
    )
}
