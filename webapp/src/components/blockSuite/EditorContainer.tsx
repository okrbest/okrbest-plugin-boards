// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useRef, useCallback } from 'react'
import { useIntl } from 'react-intl'

import { uploadImageToBlockSuite } from '../../utils/blockSuiteUtils'
import { sendFlashMessage } from '../flashMessages'

import { useEditor } from './editor/context'
import './BlockSuiteEditor.scss'

interface EditorContainerProps {
    boardId: string;
    readOnly?: boolean;
}

export const EditorContainer: React.FC<EditorContainerProps> = ({ 
    boardId, 
    readOnly = false 
}) => {
    const intl = useIntl()
    const { editor, doc, card, isLoading, saveStatus } = useEditor()
    const wrapperRef = useRef<HTMLDivElement>(null)
    const editorMountRef = useRef<HTMLDivElement>(null)

    // 파일 업로드 핸들러
    const handleFileUpload = useCallback(async (files: FileList) => {
        if (!doc || readOnly || !files.length || !card) return

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
    }, [doc, boardId, readOnly, card, intl])

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

    // 에디터를 DOM에 마운트
    useEffect(() => {
        const mountPoint = editorMountRef.current
        if (!mountPoint || !editor) return

        // 기존 내용 정리 (React가 관리하지 않는 영역이므로 안전)
        mountPoint.innerHTML = '' // replaceChildren은 React 17 환경에서 폴리필 필요할 수 있으므로 innerHTML 사용
    
        // BlockSuite 권장 순서: doc을 먼저 설정한 후 DOM에 추가
        if (editor.doc) {
            mountPoint.appendChild(editor)
        }

        return () => {
            // cleanup: React가 DOM을 정리하기 전에 editor를 제거
            if (mountPoint && editor) {
                try {
                    // editor가 mountPoint의 직접 자식인지 확인
                    if (mountPoint.contains(editor)) {
                        mountPoint.removeChild(editor)
                    }
                } catch (error) {
                    // cleanup 오류 무시 (이미 제거되었을 수 있음)
                    console.debug('Editor cleanup error (ignored):', error)
                }
            }
        }
    }, [editor])

    // 이벤트 리스너 관리
    useEffect(() => {
        const wrapper = wrapperRef.current
        if (!wrapper) return

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault()
        }

        wrapper.addEventListener('drop', handleDrop)
        wrapper.addEventListener('dragover', handleDragOver)
        document.addEventListener('paste', handlePaste)

        return () => {
            wrapper.removeEventListener('drop', handleDrop)
            wrapper.removeEventListener('dragover', handleDragOver)
            document.removeEventListener('paste', handlePaste)
        }
    }, [handleDrop, handlePaste])

    // editor가 없으면 로딩 표시만 (모든 hooks 호출 후 조건부 렌더링)
    if (!editor) {
        return (
            <div className="blocksuite-editor-wrapper loading">
                <div className="blocksuite-loading-overlay">
                    <div className="blocksuite-loading-spinner" />
                    <span>{intl.formatMessage({
                        id: 'blocksuite.loading',
                        defaultMessage: 'Loading editor...'
                    })}</span>
                </div>
            </div>
        )
    }

    return (
        <div ref={wrapperRef} className={`blocksuite-editor-wrapper ${isLoading ? 'loading' : ''}`}>
            <div ref={editorMountRef} className="blocksuite-editor-mount" style={{ height: '100%' }} />
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
