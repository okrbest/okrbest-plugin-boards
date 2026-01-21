// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useLayoutEffect, useState } from 'react'
import { Doc, DocCollection } from '@blocksuite/store'
import { PageEditor } from '@blocksuite/presets'
import { useIntl } from 'react-intl'

import { Card } from '../../blocks/card'
import octoClient from '../../octoClient'
import { sendFlashMessage } from '../flashMessages'
import { saveSnapshot } from '../../utils/blockSuiteUtils'

import { EditorContext, EditorContextValue } from './editor/context'
import { initEditor } from './editor/editor'

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
    const [editor, setEditor] = useState<PageEditor | null>(null)
    const [doc, setDoc] = useState<Doc | null>(null)
    const [collection, setCollection] = useState<DocCollection | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)

    // 1. 에디터 초기화 및 데이터 로드 (한 번에 처리)
    useLayoutEffect(() => {
        if (!card?.id) {
            setIsLoading(false)
            return
        }

        console.log('[EditorProvider] Initializing editor for card:', card.id, 'readOnly:', readOnly)
        setIsLoading(true)

        let mounted = true

        const initAndLoad = async () => {
            try {
                // boardId가 없으면 card.boardId 사용
                const boardId = card.boardId
                
                // 1. 에디터와 컬렉션 초기화 (데이터 로드 포함)
                const { editor: newEditor, doc: loadedDoc, collection: newCollection } = await initEditor(card.id, boardId, card)

                if (!mounted) return

                // PageEditor is specifically designed for page editing, no mode setting needed
                console.log('[EditorProvider] PageEditor initialized, readOnly:', readOnly)
     
                // readonly 속성 설정 (있다면)
                if ('readonly' in newEditor) {
                    (newEditor as any).readonly = readOnly
                    console.log('[EditorProvider] Set editor.readonly to', readOnly)
                }

                setEditor(newEditor)
                setDoc(loadedDoc)
                setCollection(newCollection)
                setIsLoading(false)
                console.log('[EditorProvider] ✅ Editor initialized and data loaded successfully')
            } catch (error) {
                console.error('Failed to initialize BlockSuite editor:', error)
                if (mounted) {
                    setIsLoading(false)
                    sendFlashMessage({
                        content: intl.formatMessage({
                            id: 'blocksuite.init.error',
                            defaultMessage: 'Failed to initialize editor'
                        }),
                        severity: 'high'
                    })
                }
            }
        }

        initAndLoad()

        return () => {
            mounted = false
            setEditor(null)
            setDoc(null)
            setCollection(null)
        }
    }, [card.id, card.boardId, readOnly, intl])

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
