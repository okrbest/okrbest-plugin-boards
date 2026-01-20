// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'

// BlockSuite 공식 테마 CSS
import '@toeverything/theme/style.css'

import AddDescriptionTourStep from '../onboardingTour/addDescription/add_description'

import { useEditor } from './editor/context'
import './BlockSuiteEditor.scss'

/**
 * BlockSuite 테마 CSS 변수 오버라이드
 * @toeverything/theme/style.css 에서 정의된 --affine-* 변수들을 커스터마이징
 */
const THEME_CSS = `
:host, :root, body, html {
    --affine-text-primary-color: #000000 !important;
    --affine-text-secondary-color: #666666 !important;
    --affine-text-disable-color: #999999 !important;
    --affine-background-primary-color: #ffffff !important;
    --affine-background-secondary-color: #f8f9fa !important;
    --affine-background-tertiary-color: #f1f3f5 !important;
    --affine-background-overlay-panel-color: #ffffff !important;
    --affine-background-code-block: #f8f9fa !important;
    --affine-hover-color: rgba(0,0,0,0.04) !important;
    --affine-hover-color-filled: #f5f5f5 !important;
    --affine-border-color: #e3e2e4 !important;
    --affine-popover-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
    --affine-menu-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
    --affine-white: #ffffff !important;
    --affine-black: #000000 !important;
    --affine-z-index-modal: 10001 !important;
    --affine-z-index-popover: 10001 !important;
}

/* Force text color directly on BlockSuite elements */
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
    --affine-text-primary-color: #000000 !important;
    color: #000000 !important;
}

/* Remove border from editor containers */
affine-editor-container,
affine-page-root {
    border: none !important;
    border-width: 0 !important;
    border-style: none !important;
    outline: none !important;
}

/* Rich text content */
.affine-paragraph-rich-text-wrapper,
rich-text,
v-line,
v-text {
    color: #000000 !important;
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
 * Shadow DOM 내부를 포함하여 요소를 검색
 * @param root 검색을 시작할 루트 노드
 * @param selector CSS 선택자
 * @returns 찾은 요소들의 배열
 */
function querySelectorAllDeep(root: Document | ShadowRoot | Element, selector: string): Element[] {
    const results: Element[] = []
    
    // 현재 루트에서 검색
    const found = root.querySelectorAll(selector)
    results.push(...Array.from(found))
    
    // 모든 요소의 Shadow DOM 내부 검색
    const allElements = root.querySelectorAll('*')
    for (const el of allElements) {
        if (el.shadowRoot) {
            results.push(...querySelectorAllDeep(el.shadowRoot, selector))
        }
    }
    
    return results
}

/**
 * 서브메뉴 위치를 부모 메뉴 오른쪽에 고정
 * @param el 위치를 수정할 서브메뉴 요소
 * @param subMenuIndex 서브메뉴 인덱스
 * @param allSubMenus 모든 서브메뉴 요소 배열 (Shadow DOM 포함)
 */
function fixSubMenuPosition(el: HTMLElement, subMenuIndex: number, allSubMenus: Element[]): void {
    // sub-menu-0은 슬래시 메뉴 자체이므로 수정 불필요
    if (subMenuIndex === 0) return
    
    // 부모 메뉴 찾기 (allSubMenus에서 검색)
    const parentMenu = allSubMenus.find(m => m.getAttribute('data-testid') === `sub-menu-${subMenuIndex - 1}`)
    if (!parentMenu) return
    
    const parentRect = parentMenu.getBoundingClientRect()
    
    // 서브메뉴를 부모 메뉴 오른쪽에 배치 (important로 강제 적용)
    el.style.setProperty('position', 'fixed', 'important')
    el.style.setProperty('left', `${parentRect.right + 4}px`, 'important')
    el.style.setProperty('top', `${parentRect.top}px`, 'important')
    el.style.setProperty('bottom', 'auto', 'important')
    el.style.setProperty('right', 'auto', 'important')
    el.style.setProperty('transform', 'none', 'important')
    el.style.setProperty('z-index', `${10002 + subMenuIndex}`, 'important')
    el.style.setProperty('background-color', '#ffffff', 'important')
    el.style.setProperty('box-shadow', '0 4px 16px rgba(0,0,0,0.15)', 'important')
    el.style.setProperty('border-radius', '12px', 'important')
    el.style.setProperty('border', '1px solid rgb(227, 226, 228)', 'important')
}

/**
 * 모든 서브메뉴의 위치를 확인하고 수정 (Shadow DOM 포함)
 */
function fixAllSubMenuPositions(): void {
    // Shadow DOM 내부를 포함하여 모든 sub-menu 찾기
    const subMenus = querySelectorAllDeep(document, '[data-testid^="sub-menu-"]')
    
    subMenus.forEach(menu => {
        const testId = menu.getAttribute('data-testid')
        if (!testId) return
        
        const match = testId.match(/sub-menu-(\d+)/)
        if (!match) return
        
        const index = parseInt(match[1], 10)
        if (index > 0) {
            fixSubMenuPosition(menu as HTMLElement, index, subMenus)
        }
    })
}

/**
 * Body 포털 요소 감시 (슬래시 메뉴, 포맷 바 등)
 */
let bodyObserver: MutationObserver | null = null
let subMenuCheckInterval: number | null = null

function setupBodyObserver(): void {
    if (bodyObserver) return
    
    bodyObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue
                
                const tag = node.tagName.toLowerCase()
                
                // BlockSuite 포털 요소 감지
                if (tag.startsWith('affine-') || 
                    node.classList.contains('blocksuite-overlay') ||
                    node.classList.contains('blocksuite-portal')) {
                    
                    injectStyles(node)
                    
                    // Shadow DOM이 없는 포털 요소에 직접 스타일 적용
                    if (!node.shadowRoot) {
                        const el = node as HTMLElement
                        el.style.cssText = `
                            background-color: #ffffff !important;
                            color: #000000 !important;
                            box-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
                            border-radius: 8px !important;
                            border: 1px solid rgba(0,0,0,0.1) !important;
                        `
                    }
                }
                
                // 슬래시 메뉴 서브메뉴 위치 수정 (Shadow DOM 포함)
                const testId = node.getAttribute('data-testid')
                if (testId && testId.startsWith('sub-menu-')) {
                    // 새로운 sub-menu가 추가되면 전체 서브메뉴 위치 재계산
                    fixAllSubMenuPositions()
                }
                
                // 내부에 서브메뉴가 있는지도 확인 (중첩된 경우)
                const innerSubMenus = node.querySelectorAll('[data-testid^="sub-menu-"]')
                if (innerSubMenus.length > 0) {
                    fixAllSubMenuPositions()
                }
            }
        }
    })
    
    // body와 그 모든 자손 요소 감시
    bodyObserver.observe(document.body, { childList: true, subtree: true })
    
    // 서브메뉴 위치 주기적 확인 (MutationObserver가 놓친 경우 대비)
    if (!subMenuCheckInterval) {
        subMenuCheckInterval = window.setInterval(() => {
            fixAllSubMenuPositions()
        }, 100)
    }
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

    // 에디터 외부 클릭 시 selection 해제 및 위젯 정리
    useEffect(() => {
        // 실제 편집 가능한 요소에 포커스되어 있는지 확인하는 헬퍼
        const isEditableElement = (element: Element | null): boolean => {
            if (!element) return false
            const tagName = element.tagName.toLowerCase()
            // 실제 편집 가능한 요소들
            if (tagName === 'rich-text' || 
                tagName === 'v-line' || 
                tagName === 'v-text' ||
                element.getAttribute('contenteditable') === 'true' ||
                element.closest('rich-text') ||
                element.closest('[contenteditable="true"]')) {
                return true
            }
            return false
        }

        // 에디터 컨테이너 요소인지 확인 (편집 불가능한 wrapper 요소들)
        const isEditorContainerElement = (element: Element | null): boolean => {
            if (!element) return false
            const tagName = element.tagName.toLowerCase()
            return tagName === 'affine-page-root' || 
                   tagName === 'affine-editor-container' ||
                   tagName === 'editor-host' ||
                   tagName === 'affine-doc-page' ||
                   tagName === 'affine-note' ||
                   element.classList.contains('affine-page-viewport') ||
                   element.classList.contains('affine-page-root-block-container') ||
                   element.classList.contains('affine-note-block-container')
        }
        
        // 마지막 편집 가능한 블록에 포커스 주기
        const focusLastEditableBlock = (): boolean => {
            const wrapper = wrapperRef.current
            if (!wrapper) return false
            
            // 마지막 rich-text 요소 찾기
            const richTexts = wrapper.querySelectorAll('rich-text')
            if (richTexts.length > 0) {
                const lastRichText = richTexts[richTexts.length - 1] as HTMLElement
                
                // rich-text 내의 v-line 또는 contenteditable 요소에 포커스
                const editableContent = lastRichText.querySelector('[contenteditable="true"]') ||
                                       lastRichText.querySelector('v-line')
                if (editableContent) {
                    (editableContent as HTMLElement).focus()
                    
                    // 커서를 텍스트 끝으로 이동
                    const selection = window.getSelection()
                    if (selection && editableContent.textContent) {
                        const range = document.createRange()
                        range.selectNodeContents(editableContent)
                        range.collapse(false) // false = 끝으로 이동
                        selection.removeAllRanges()
                        selection.addRange(range)
                    }
                    return true
                }
            }
            return false
        }
        
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element
            const wrapper = wrapperRef.current
            
            // BlockSuite 포털 요소(슬래시 메뉴, 포맷 바 등)인 경우 무시
            if (target.closest('affine-slash-menu') ||
                target.closest('affine-format-bar-widget') ||
                target.closest('.blocksuite-overlay') ||
                target.closest('.blocksuite-portal') ||
                target.closest('[data-testid^="sub-menu-"]')) {
                return
            }
            
            // 에디터 wrapper 외부 클릭 시 selection 해제
            if (wrapper && !wrapper.contains(target)) {
                if (editor?.host?.selection) {
                    editor.host.selection.clear()
                }
                // 기존 format bar 등 위젯 제거
                const widgets = document.querySelectorAll('affine-format-bar-widget, affine-slash-menu')
                widgets.forEach(w => {
                    try { w.remove() } catch { /* 무시 */ }
                })
            }
        }
        
        // 에디터 컨테이너의 빈 영역 클릭 시 마지막 블록에 포커스
        const handleEditorContainerClick = (event: MouseEvent) => {
            const target = event.target as Element
            const wrapper = wrapperRef.current
            
            if (!wrapper || !wrapper.contains(target)) return
            
            // 편집 가능한 요소 클릭은 정상 처리
            if (isEditableElement(target)) return
            
            // 에디터 컨테이너 영역(빈 공간) 클릭 시 마지막 블록에 포커스
            if (isEditorContainerElement(target)) {
                event.preventDefault()
                event.stopPropagation()
                
                // 약간의 딜레이 후 포커스 (BlockSuite 내부 처리 완료 후)
                requestAnimationFrame(() => {
                    focusLastEditableBlock()
                })
            }
        }

        // 에디터 컨테이너(비편집 영역)에서 키 입력 시 불필요한 동작 방지
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as Element
            
            // BlockSuite 포털 요소 포커스인 경우: 정상 동작
            if (target.closest('affine-format-bar-widget') ||
                target.closest('affine-slash-menu') ||
                target.closest('.blocksuite-portal')) {
                return
            }
            
            // 포커스된 요소가 에디터 컨테이너 요소(비편집 영역)인 경우
            // 예: affine-page-root, affine-editor-container 등을 직접 클릭한 경우
            if (isEditorContainerElement(target) && !isEditableElement(target)) {
                // Enter 키 입력 시 새 블록 생성 및 format bar 생성 방지
                // 대신 마지막 블록에 포커스를 줌
                if (event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    focusLastEditableBlock()
                    return
                }
                
                // format bar 중복 생성 방지 (다른 키 입력의 경우)
                requestAnimationFrame(() => {
                    const formatBars = document.querySelectorAll('affine-format-bar-widget')
                    if (formatBars.length > 1) {
                        // 첫 번째를 제외한 나머지 제거
                        Array.from(formatBars).slice(1).forEach(bar => {
                            try { bar.remove() } catch { /* 무시 */ }
                        })
                    }
                })
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('click', handleEditorContainerClick, true)
        document.addEventListener('keydown', handleKeyDown, true)
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('click', handleEditorContainerClick, true)
            document.removeEventListener('keydown', handleKeyDown, true)
        }
    }, [editor])

    // 에디터 DOM 마운트
    useEffect(() => {
        const mountPoint = editorMountRef.current
        if (!mountPoint || !editor) return

        mountPoint.innerHTML = ''
        
        if (!editor.doc) return
        
        mountPoint.appendChild(editor)
        
        // 초기 스타일 주입
        injectStyles(editor)
        
        // 인라인 스타일에서 border와 box-shadow 제거하는 함수
        const removeBorderFromElements = () => {
            const selectors = [
                'affine-editor-container', 
                'affine-page-root', 
                'affine-doc-page',
                'affine-paragraph',
                'affine-page-image'
            ]
            selectors.forEach(selector => {
                const elements = mountPoint.querySelectorAll(selector)
                elements.forEach(el => {
                    const htmlEl = el as HTMLElement
                    // border 관련 속성 제거
                    htmlEl.style.removeProperty('border')
                    htmlEl.style.removeProperty('border-width')
                    htmlEl.style.removeProperty('border-style')
                    htmlEl.style.removeProperty('border-color')
                    htmlEl.style.removeProperty('border-top')
                    htmlEl.style.removeProperty('border-bottom')
                    htmlEl.style.removeProperty('border-left')
                    htmlEl.style.removeProperty('border-right')
                    // box-shadow 제거
                    htmlEl.style.removeProperty('box-shadow')
                })
            })
        }
        
        // 초기 border 제거
        removeBorderFromElements()
        
        // 동적 변경 감시
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element) {
                        injectStyles(node)
                    }
                }
            }
            // 매 변경마다 border 제거 확인
            removeBorderFromElements()
        })
        
        observer.observe(mountPoint, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })

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
