// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'

import AddDescriptionTourStep from '../onboardingTour/addDescription/add_description'

import { useEditor } from './editor/context'
import './BlockSuiteEditor.scss'

const SHADOW_DOM_CSS = `
:host {
    --affine-text-primary-color: #000000;
    --affine-text-secondary-color: #666666;
    --affine-text-disable-color: #999999;
    --affine-background-primary-color: #ffffff;
    --affine-background-secondary-color: #f8f9fa;
    --affine-background-tertiary-color: #f1f3f5;
    --affine-background-overlay-panel-color: #ffffff;
    --affine-background-code-block: #f8f9fa;
    --affine-hover-color: rgba(0,0,0,0.04);
    --affine-hover-color-filled: #f5f5f5;
    --affine-border-color: #e3e2e4;
    --affine-popover-shadow: 0 4px 16px rgba(0,0,0,0.15);
    --affine-menu-shadow: 0 4px 16px rgba(0,0,0,0.15);
    --affine-white: #ffffff;
    --affine-black: #000000;
    --affine-z-index-modal: 10001 !important;
    --affine-z-index-popover: 10001 !important;
    --affine-editor-side-padding: 24px;
    --affine-editor-bottom-padding: 0;
}
* { --affine-text-primary-color: #000000; color: inherit; }
.affine-page-root-block-container { padding-left: 24px !important; padding-right: 0 !important; padding-bottom: 0 !important; }
affine-drag-handle-widget { display: flex !important; pointer-events: auto !important; }
.affine-drag-handle-container { pointer-events: auto !important; cursor: grab !important; }
.affine-drag-handle-grabber { visibility: visible !important; background: var(--affine-placeholder-color, rgba(0, 0, 0, 0.3)) !important; }
`

let styleSheet: CSSStyleSheet | null = null
let observer: MutationObserver | null = null

function injectToShadowRoot(root: ShadowRoot): void {
    if (!styleSheet) {
        try {
            styleSheet = new CSSStyleSheet()
            styleSheet.replaceSync(SHADOW_DOM_CSS)
        } catch {
            if (!root.getElementById('bs-theme')) {
                const style = document.createElement('style')
                style.id = 'bs-theme'
                style.textContent = SHADOW_DOM_CSS
                root.appendChild(style)
            }
            return
        }
    }
    if (!root.adoptedStyleSheets.includes(styleSheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, styleSheet]
    }
}

function processElement(el: Element): void {
    if (el.shadowRoot) injectToShadowRoot(el.shadowRoot)
    el.querySelectorAll('*').forEach(child => {
        if (child.shadowRoot) injectToShadowRoot(child.shadowRoot)
    })
}

function initStyleInjection(): void {
    if (observer) return
    observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node instanceof Element) processElement(node)
            }
        }
    })
    observer.observe(document.body, { childList: true, subtree: true })
}

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

    useEffect(() => {
        initStyleInjection()
    }, [])

    // 에디터 외부 클릭 시 selection 해제
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element
            const wrapper = wrapperRef.current

            if (target.closest('affine-slash-menu') ||
                target.closest('affine-format-bar-widget') ||
                target.closest('affine-drag-handle-widget') ||
                target.closest('.affine-drag-handle-container') ||
                target.closest('.affine-drag-handle-grabber') ||
                target.closest('.blocksuite-overlay') ||
                target.closest('.blocksuite-portal')) {
                return
            }

            // 에디터 wrapper 외부 클릭 시 selection 해제
            if (wrapper && !wrapper.contains(target)) {
                if (editor?.host?.selection) {
                    editor.host.selection.clear()
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside)

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [editor])

    // 에디터 DOM 마운트
    useEffect(() => {
        const mountPoint = editorMountRef.current
        if (!mountPoint || !editor) return

        mountPoint.innerHTML = ''
        
        if (!editor.doc) return
        
        mountPoint.appendChild(editor)
        processElement(editor)

        return () => {
            if (mountPoint.contains(editor)) {
                try {
                    mountPoint.removeChild(editor)
                } catch {}
            }
        }
    }, [editor])

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/naming-convention
    const unusedVars = { boardId, readOnly, doc, card }

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
