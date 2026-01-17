// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { DocCollection, Schema } from '@blocksuite/store'
import { AffineEditorContainer } from '@blocksuite/presets'
import { AffineSchemas } from '@blocksuite/blocks'
import * as Y from 'yjs'
import { useIntl } from 'react-intl'

import { loadData, uploadImageToBlockSuite } from '../../utils/blockSuiteUtils'
import octoClient from '../../octoClient'
import { Card } from '../../blocks/card'
import { sendFlashMessage } from '../flashMessages'

// import '@blocksuite/presets/themes/affine.css'
import './BlockSuiteEditor.scss'

interface Props {
    card: Card;
    boardId: string;
    readOnly?: boolean;
}

export const BlockSuiteEditor: React.FC<Props> = ({ card, boardId, readOnly }) => {
    const intl = useIntl()
    const cardId = card.id
    const containerRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<AffineEditorContainer | null>(null)
    const [doc, setDoc] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)

    // 파일 업로드 핸들러
    const handleFileUpload = useCallback(async (files: FileList) => {
        if (!doc || readOnly || !files.length) return

        try {
            // BlockSuite의 현재 선택된 블록 또는 기본 note 블록 찾기
            const blocks = doc.getBlocks()
            const noteBlock = blocks.find((block: any) => block.flavour === 'affine:note')
            const parentId = noteBlock?.id || blocks[0]?.id

            if (!parentId) {
                console.warn('No parent block found for image insertion')
                sendFlashMessage({
                    content: intl.formatMessage({
                        id: 'blocksuite.upload.error',
                        defaultMessage: 'Failed to upload image: No block found'
                    }),
                    severity: 'normal'
                })
                return
            }

            // 각 파일 업로드 및 이미지 블록 생성
            let uploadedCount = 0
            for (const file of Array.from(files)) {
                if (file.type.startsWith('image/')) {
                    const result = await uploadImageToBlockSuite(boardId, file, doc, parentId)
                    if (result) {
                        uploadedCount++
                    }
                }
            }

            if (uploadedCount > 0) {
                sendFlashMessage({
                    content: intl.formatMessage({
                        id: 'blocksuite.upload.success',
                        defaultMessage: `Uploaded ${uploadedCount} image(s)`
                    }, { count: uploadedCount }),
                    severity: 'low'
                })
            }
        } catch (error) {
            console.error('Failed to handle file upload', error)
            sendFlashMessage({
                content: intl.formatMessage({
                    id: 'blocksuite.upload.error',
                    defaultMessage: 'Failed to upload image'
                }),
                severity: 'high'
            })
        }
    }, [doc, boardId, readOnly, intl])

    // 드래그 앤 드롭 핸들러
    const handleDrop = useCallback((event: DragEvent) => {
        if (readOnly || !event.dataTransfer?.files.length) return

        event.preventDefault()
        event.stopPropagation()
        handleFileUpload(event.dataTransfer.files)
    }, [handleFileUpload, readOnly])

    // 클립보드 붙여넣기 핸들러
    const handlePaste = useCallback((event: ClipboardEvent) => {
        if (readOnly || !event.clipboardData?.files.length) return

        event.preventDefault()
        handleFileUpload(event.clipboardData.files)
    }, [handleFileUpload, readOnly])

    // 1. 초기화 및 에디터 마운트
    useEffect(() => {
        if (!containerRef.current) return

        setIsLoading(true)

        // 기존 에디터 인스턴스 정리 (중복 생성 방지)
        containerRef.current.innerHTML = ''

        const schema = new Schema()
        schema.register(AffineSchemas)
        const collection = new DocCollection({ schema })
        const newDoc = collection.createDoc({ id: cardId })
        setDoc(newDoc)

        const editor = new AffineEditorContainer()
        editor.doc = newDoc
        editorRef.current = editor
        containerRef.current.appendChild(editor)

        // 드래그 앤 드롭 이벤트 리스너 추가
        const container = containerRef.current
        container.addEventListener('drop', handleDrop)
        container.addEventListener('dragover', (e) => {
            e.preventDefault() // drop 이벤트를 활성화하기 위해 필요
        })

        // 클립보드 붙여넣기 이벤트 리스너 추가
        document.addEventListener('paste', handlePaste)

        // 초기화 완료 (데이터 로드는 별도 useEffect에서 처리)
        // setIsLoading(false)는 loadData가 완료된 후 설정됨

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = ''
            }
            container.removeEventListener('drop', handleDrop)
            document.removeEventListener('paste', handlePaste)
            editorRef.current = null
            setIsLoading(false)
        }
    }, [cardId, handleDrop, handlePaste])

    // 2. 데이터 로드
    useEffect(() => {
        if (!doc) return
        
        const loadCardData = async () => {
            setIsLoading(true)
            try {
                await loadData(card, doc)
                setIsLoading(false)
            } catch (e) {
                console.error("Failed to load BlockSuite data in editor", e)
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
        
        loadCardData()
    }, [doc, card, intl])

    // 3. 자동 저장 (Debounce 권장)
    useEffect(() => {
        if (!doc || readOnly) return
        
        let timeout: NodeJS.Timeout
        const handleUpdate = () => {
            clearTimeout(timeout)
            setSaveStatus('saving')
            setIsSaving(true)
            
            timeout = setTimeout(async () => {
                const snapshot = Y.encodeStateAsUpdate(doc.spaceDoc)
                try {
                    await octoClient.saveBlockSuiteContent(cardId, snapshot)
                    setSaveStatus('saved')
                    setIsSaving(false)
                    
                    // 3초 후 저장 상태 표시 제거
                    setTimeout(() => {
                        setSaveStatus(null)
                    }, 3000)
                } catch (e) {
                    console.error("Failed to auto-save BlockSuite content", e)
                    setSaveStatus('error')
                    setIsSaving(false)
                    sendFlashMessage({
                        content: intl.formatMessage({
                            id: 'blocksuite.save.error',
                            defaultMessage: 'Failed to save changes'
                        }),
                        severity: 'high'
                    })
                    
                    // 5초 후 에러 상태 제거
                    setTimeout(() => {
                        setSaveStatus(null)
                    }, 5000)
                }
            }, 2000) // 2초 Debounce
        }

        doc.spaceDoc.on('update', handleUpdate)
        return () => {
            doc.spaceDoc.off('update', handleUpdate)
            clearTimeout(timeout)
        }
    }, [doc, cardId, readOnly, intl])

    return (
        <div ref={containerRef} className={`blocksuite-editor-wrapper ${isLoading ? 'loading' : ''}`}>
            {isLoading && (
                <div className="blocksuite-loading-overlay">
                    <div className="blocksuite-loading-spinner" />
                    <span>{intl.formatMessage({
                        id: 'blocksuite.loading',
                        defaultMessage: 'Loading editor...'
                    })}</span>
                </div>
            )}
            {!isLoading && saveStatus && (
                <div className={`blocksuite-save-status ${saveStatus}`}>
                    {saveStatus === 'saving' && intl.formatMessage({
                        id: 'blocksuite.saving',
                        defaultMessage: 'Saving...'
                    })}
                    {saveStatus === 'saved' && intl.formatMessage({
                        id: 'blocksuite.saved',
                        defaultMessage: 'Saved'
                    })}
                    {saveStatus === 'error' && intl.formatMessage({
                        id: 'blocksuite.save.error',
                        defaultMessage: 'Save failed'
                    })}
                </div>
            )}
        </div>
    )
}
