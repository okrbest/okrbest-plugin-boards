// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'

import AddDescriptionTourStep from '../onboardingTour/addDescription/add_description'

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

    // 에디터를 DOM에 마운트
    // 참고: 이미지 드래그앤드롭과 붙여넣기는 BlockSuite 에디터가 자체적으로 처리합니다.
    // BlobEngine.set()이 호출되어 Mattermost 서버에 업로드됩니다.
    useEffect(() => {
        const mountPoint = editorMountRef.current
        if (!mountPoint || !editor) return

        // 기존 내용 정리
        mountPoint.innerHTML = ''
    
        // BlockSuite 에디터 마운트
        if (editor.doc) {
            mountPoint.appendChild(editor)
        }

        return () => {
            // cleanup: React가 DOM을 정리하기 전에 editor를 제거
            if (mountPoint && editor) {
                try {
                    if (mountPoint.contains(editor)) {
                        mountPoint.removeChild(editor)
                    }
                } catch {
                    // cleanup 오류 무시
                }
            }
        }
    }, [editor])

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = { boardId, readOnly, doc, card } // lint 경고 방지 (향후 사용 가능)

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
            {/* 온보딩 투어: 에디터 영역 안내 */}
            {!isLoading && <AddDescriptionTourStep />}
            
            <div ref={editorMountRef} className="blocksuite-editor-mount octo-content" style={{ height: '100%' }} />
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
