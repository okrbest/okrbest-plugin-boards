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

        setIsLoading(true)

        try {
            const { editor: newEditor, doc: newDoc, collection: newCollection } = initEditor(card.id)
      
            setEditor(newEditor)
            setDoc(newDoc)
            setCollection(newCollection)
        } catch (error) {
            console.error('Failed to initialize editor:', error)
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
    }, [card.id, intl])

    // 2. 데이터 로드
    useEffect(() => {
        if (!editor || !doc) return

        const loadData = async () => {
            setIsLoading(true)
            try {
                const loadedDoc = await loadEditorData(editor, doc, card)
                
                // 스냅샷 로드 시 새로운 doc이 생성되므로 에디터에 반영
                if (loadedDoc && loadedDoc !== doc) {
                    editor.doc = loadedDoc
                    setDoc(loadedDoc)
                    // collection은 동일할 것으로 가정
                }
                
                setIsLoading(false)
            } catch (error) {
                console.error('Failed to load editor data:', error)
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
    }, [editor, doc, card, intl])

    // 3. 자동 저장
    useEffect(() => {
        if (!doc || readOnly) return

        let timeout: NodeJS.Timeout
        const handleUpdate = () => {
            clearTimeout(timeout)
            setSaveStatus('saving')

            timeout = setTimeout(async () => {
                try {
                    const snapshot = await saveSnapshot(doc)
                    await octoClient.saveBlockSuiteContent(card.id, snapshot)
                    setSaveStatus('saved')

                    setTimeout(() => {
                        setSaveStatus(null)
                    }, 3000)
                } catch (error) {
                    console.error('Failed to auto-save:', error)
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
        // Yjs 의존성을 직접 import하지 않아도 BlockSuite 객체를 통해 접근 가능합니다.
        doc.spaceDoc.on('update', handleUpdate)
        return () => {
            doc.spaceDoc.off('update', handleUpdate)
            clearTimeout(timeout)
        }
    }, [doc, card.id, readOnly, intl])

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
