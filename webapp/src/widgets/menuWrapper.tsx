// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React, {useRef, useState, useEffect, useCallback, useLayoutEffect} from 'react'

import RootPortal from '../components/rootPortal'

import './menuWrapper.scss'

type Props = {
    children?: React.ReactNode
    stopPropagationOnToggle?: boolean
    className?: string
    disabled?: boolean
    isOpen?: boolean
    onToggle?: (open: boolean) => void
    label?: string
    /** overflow로 잘리는 부모가 있을 때 서브메뉴를 Portal로 렌더링 */
    usePortal?: boolean
    /** usePortal일 때 메뉴 위치 (기본: 'left') */
    menuPosition?: 'left' | 'right' | 'top' | 'bottom'
}

const MenuWrapper = (props: Props) => {
    const node = useRef<HTMLDivElement>(null)
    const [open, setOpen] = useState(Boolean(props.isOpen))

    if (!Array.isArray(props.children) || props.children.length !== 2) {
        throw new Error('MenuWrapper needs exactly 2 children')
    }

    const close = useCallback((): void => {
        if (open) {
            setOpen(false)
            props.onToggle && props.onToggle(false)
        }
    }, [props.onToggle, open])

    const closeOnBlur = useCallback((e: Event) => {
        if (e.target && node.current?.contains(e.target as Node)) {
            return
        }
        // Portal 서브메뉴 클릭 시: closeOnBlur가 먼저 실행되면 메뉴가 unmount되어
        // "수정" 등 클릭 핸들러가 실행되지 않음. Portal 영역 클릭은 무시하고
        // menuItemClicked로 메뉴 닫기를 위임
        const target = e.target as Node
        const el = target instanceof Element ? target : target.parentElement
        if (el?.closest('.MenuWrapper-portal')) {
            return
        }

        close()
    }, [close])

    const keyboardClose = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            close()
        }

        if (e.key === 'Tab') {
            closeOnBlur(e)
        }
    }, [close, closeOnBlur])

    const toggle = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>): void => {
        if (props.disabled) {
            return
        }

        /**
         * This is only here so that we can toggle the menus in the sidebar, because the default behavior of the mobile
         * version (ie the one that uses a modal) needs propagation to close the modal after selecting something
         * We need to refactor this so that the modal is explicitly closed on toggle, but for now I am aiming to preserve the existing logic
         * so as to not break other things
        **/
        if (props.stopPropagationOnToggle) {
            e.preventDefault()
            e.stopPropagation()
        }
        const newOpen = !open
        setOpen(newOpen)
        if (newOpen) {
            document.dispatchEvent(new CustomEvent('menuWrapperOpened', {
                detail: {source: node.current},
            }))
        }
        props.onToggle && props.onToggle(newOpen)
    }, [props.onToggle, open, props.disabled, props.stopPropagationOnToggle])

    const {children} = props
    const trigger = children ? Object.values(children)[0] : null
    const menu = children ? Object.values(children)[1] : null
    const [position, setPosition] = useState<{top: number, right?: number, left?: number, bottom?: number} | null>(null)
    const portalRef = useRef<HTMLDivElement>(null)

    const handleOtherMenuOpened = useCallback((e: Event) => {
        const source = (e as CustomEvent).detail?.source as Node
        if (!source) {
            return
        }
        if (node.current?.contains(source)) {
            return
        }
        if (portalRef.current?.contains(source)) {
            return
        }
        close()
    }, [close])

    useEffect(() => {
        if (open) {
            document.addEventListener('menuItemClicked', close, true)
            document.addEventListener('click', closeOnBlur, true)
            document.addEventListener('keyup', keyboardClose, true)
            document.addEventListener('menuWrapperOpened', handleOtherMenuOpened)
        }
        return () => {
            document.removeEventListener('menuItemClicked', close, true)
            document.removeEventListener('click', closeOnBlur, true)
            document.removeEventListener('keyup', keyboardClose, true)
            document.removeEventListener('menuWrapperOpened', handleOtherMenuOpened)
        }
    }, [open, close, closeOnBlur, keyboardClose, handleOtherMenuOpened])

    useLayoutEffect(() => {
        if (!props.usePortal || !open || !node.current || !menu) {
            setPosition(null)
            return
        }
        const rect = node.current.getBoundingClientRect()
        const pos = props.menuPosition || 'left'
        if (pos === 'left') {
            setPosition({top: rect.top, right: window.innerWidth - rect.left})
        } else if (pos === 'right') {
            setPosition({top: rect.top, left: rect.right})
        } else if (pos === 'top') {
            setPosition({bottom: window.innerHeight - rect.top, left: rect.left})
        } else {
            setPosition({top: rect.bottom, left: rect.left})
        }
    }, [open, props.usePortal, props.menuPosition, menu])

    useLayoutEffect(() => {
        if (!open || !props.usePortal || !position || !portalRef.current) {
            return
        }
        const menuEl = portalRef.current.querySelector('.Menu.noselect') as HTMLElement
        if (!menuEl) {
            return
        }
        const menuRect = menuEl.getBoundingClientRect()
        const overflow = menuRect.right - window.innerWidth + 8
        if (overflow > 0) {
            menuEl.style.transform = `translateX(-${overflow}px)`
        } else {
            menuEl.style.transform = ''
        }
    }, [open, props.usePortal, position])

    let className = 'MenuWrapper'
    if (props.disabled) {
        className += ' disabled'
    }
    if (open) {
        className += ' override menuOpened'
    }
    if (props.className) {
        className += ' ' + props.className
    }

    const renderMenu = () => {
        if (!open || props.disabled || !menu) {
            return null
        }
        if (props.usePortal) {
            if (!position) {
                return null
            }
            return (
                <RootPortal>
                    <div
                        ref={portalRef}
                        className='MenuWrapper-portal'
                        style={{
                            position: 'fixed',
                            top: position.top,
                            right: position.right,
                            left: position.left,
                            bottom: position.bottom,
                            zIndex: 1000,
                        }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                        {menu}
                    </div>
                </RootPortal>
            )
        }
        return menu
    }

    return (
        <div
            role='button'
            aria-label={props.label || 'menuwrapper'}
            className={className}
            onClick={toggle}
            ref={node}
        >
            {trigger}
            {renderMenu()}
        </div>
    )
}

export default React.memo(MenuWrapper)
