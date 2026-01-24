// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'



import AddDescriptionTourStep from '../onboardingTour/addDescription/add_description'

import { useEditor } from './editor/context'
import './BlockSuiteEditor.scss'

/**
 * BlockSuite 테마 CSS 변수 - 최소한의 커스터마이징
 * z-index만 Mattermost 모달과의 호환성을 위해 조정
 */
const THEME_CSS = `
:host, :root, body, html {
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
    --affine-editor-side-padding: 0;
    --affine-editor-bottom-padding: 0;
}

affine-editor-container,
affine-page-root,
affine-note,
affine-paragraph,
affine-list,
affine-code,
affine-divider,
affine-image,
.affine-paragraph-block-container,
.affine-block-children-container,
[data-block-id] {
    --affine-text-primary-color: #000000;
    --affine-editor-side-padding: 0 !important;
    color: #000000;
}

.affine-list-block__prefix,
.affine-list-block__suffix {
    color: #000000;
}

.affine-page-root-block-container,
div.affine-page-root-block-container {
    --affine-editor-side-padding: 0 !important;
    padding: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    padding-bottom: 0 !important;
    margin: 0 !important;
}

/* Drag handle widget styles */
affine-drag-handle-widget {
    display: flex !important;
    pointer-events: auto !important;
}

.affine-drag-handle-widget {
    display: flex !important;
}

.affine-drag-handle-container {
    pointer-events: auto !important;
    cursor: grab !important;
}

.affine-drag-handle-grabber {
    visibility: visible !important;
    background: var(--affine-placeholder-color, rgba(0, 0, 0, 0.3)) !important;
}
`

// 캐시된 CSSStyleSheet (Constructable Stylesheet)
let cachedStyleSheet: CSSStyleSheet | null = null

/**
 * CSSStyleSheet를 생성하거나 캐시에서 반환
 * Constructable Stylesheets를 지원하지 않는 브라우저에서는 null 반환
 */
function getStyleSheet(): CSSStyleSheet | null {
    if (cachedStyleSheet) return cachedStyleSheet
    
    try {
        cachedStyleSheet = new CSSStyleSheet()
        cachedStyleSheet.replaceSync(THEME_CSS)
        return cachedStyleSheet
    } catch {
        // Constructable Stylesheets 미지원 브라우저
        return null
    }
}

/**
 * Shadow DOM에 스타일을 효율적으로 주입
 * - Constructable Stylesheets 사용 (지원 시)
 * - 폴백: <style> 태그 주입
 */
function injectStyleToShadowRoot(shadowRoot: ShadowRoot): void {
    const styleId = 'bs-theme'
    
    // 이미 주입된 경우 스킵
    if (shadowRoot.getElementById(styleId)) return
    
    const sheet = getStyleSheet()
    
    if (sheet) {
        // Constructable Stylesheets 사용 (성능 최적화)
        try {
            shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet]
            return
        } catch {
            // adoptedStyleSheets 실패 시 폴백
        }
    }
    
    // 폴백: <style> 태그 주입
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = THEME_CSS
    shadowRoot.appendChild(style)
}

/**
 * 요소와 그 하위 Shadow DOM에 스타일 주입
 * WeakSet으로 이미 처리된 요소 추적하여 중복 방지
 */
const processedElements = new WeakSet<Element>()

function injectStyles(element: Element): void {
    if (processedElements.has(element)) return
    processedElements.add(element)
    
    // 현재 요소의 Shadow DOM에 스타일 주입
    if (element.shadowRoot) {
        injectStyleToShadowRoot(element.shadowRoot)
        
        // Shadow DOM 내부 요소들도 처리
        element.shadowRoot.querySelectorAll('*').forEach(injectStyles)
    }
    
    // 자식 요소들 처리
    element.querySelectorAll('*').forEach(injectStyles)
}

/**
 * 전역 :root 스타일 주입 (한 번만)
 */
let globalStyleInjected = false

function injectGlobalStyle(): void {
    if (globalStyleInjected) return
    
    const styleId = 'bs-global-theme'
    if (document.getElementById(styleId)) {
        globalStyleInjected = true
        return
    }
    
    const style = document.createElement('style')
    style.id = styleId
    // 전체 THEME_CSS를 주입 (:host를 :root로 대체)
    style.textContent = THEME_CSS.replace(/:host/g, ':root')
    document.head.appendChild(style)
    globalStyleInjected = true
}

/**
 * Body 포털 요소 감시 (슬래시 메뉴, 포맷 바 등)
 * BlockSuite의 기본 동작을 유지하되, z-index만 조정
 */
let bodyObserver: MutationObserver | null = null

function setupBodyObserver(): void {
    if (bodyObserver) return

    bodyObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue

                const tag = node.tagName.toLowerCase()

                // BlockSuite 포털 요소 감지 - z-index 스타일만 주입
                if (tag.startsWith('affine-') ||
                    node.classList.contains('blocksuite-overlay') ||
                    node.classList.contains('blocksuite-portal')) {
                    injectStyles(node)
                }
            }
        }
    })

    // body와 그 모든 자손 요소 감시
    bodyObserver.observe(document.body, { childList: true, subtree: true })
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

    // 전역 테마 스타일 및 Body Observer 초기화
    useEffect(() => {
        injectGlobalStyle()
        setupBodyObserver()
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
        
        // 초기 스타일 주입 (z-index만)
        injectStyles(editor)

        // 동적 변경 감시 - 새로 추가되는 요소에도 스타일 주입
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element) {
                        injectStyles(node)
                    }
                }
            }
        })

        observer.observe(mountPoint, { childList: true, subtree: true })

        return () => {
            observer.disconnect()
            
            if (mountPoint.contains(editor)) {
                try {
                    mountPoint.removeChild(editor)
                } catch {
                    // cleanup 오류 무시
                }
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
