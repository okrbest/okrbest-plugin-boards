// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useLayoutEffect, useCallback, useState, useContext, CSSProperties, useRef} from 'react'

import CompassIcon from '../../widgets/icons/compassIcon'

import Menu from '.'

import './subMenuOption.scss'

export const HoveringContext = React.createContext(false)

type SubMenuOptionProps = {
    id: string
    name: string
    position?: 'bottom' | 'top' | 'left' | 'left-bottom' | 'auto'
    icon?: React.ReactNode
    children: React.ReactNode
    className?: string
}

function SubMenuOption(props: SubMenuOptionProps): React.JSX.Element {
    const [isOpen, setIsOpen] = useState(false)
    const isHovering = useContext(HoveringContext)
    const ref = useRef<HTMLDivElement>(null)

    const openLeftClass = props.position === 'left' || props.position === 'left-bottom' ? ' open-left' : ''

    useEffect(() => {
        // isHovering이 true이면 항상 열기
        if (isHovering) {
            setIsOpen(true)
            return
        }
        
        // isHovering이 false = 다른 메뉴 항목으로 hover가 이동했거나 hover가 떠남
        // 하지만 검색 입력 필드에 포커스가 있으면 유지 (타이핑 중이므로)
        const activeElement = document.activeElement
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            // SubMenu 내부에 있는지 확인
            const subMenuElement = ref.current?.querySelector('.SubMenu')
            if (subMenuElement && subMenuElement.contains(activeElement)) {
                // 다른 SubMenu가 열려있는지 확인 (다른 메뉴에 hover했는지)
                const otherSubMenuOpen = document.querySelector('.SubMenu:not([data-submenu-id="' + props.id + '"])')
                // 다른 SubMenu가 열려있으면 닫기, 없으면 유지
                if (otherSubMenuOpen) {
                    setIsOpen(false)
                    return
                }
                // 포커스가 SubMenu 내부에 있고 다른 SubMenu가 열려있지 않으면 유지 (검색 입력 필드 등)
                return
            }
        }
        
        // 위 조건에 해당하지 않으면 닫기
        setIsOpen(false)
    }, [isHovering, props.id])

    // 다른 SubMenu가 열릴 때 이 SubMenu를 닫기 위한 이벤트 리스너
    useEffect(() => {
        const handleOtherSubMenuOpen = (e: Event) => {
            const customEvent = e as CustomEvent<{ subMenuId: string }>
            const openedSubMenuId = customEvent.detail?.subMenuId
            if (openedSubMenuId && openedSubMenuId !== props.id && isOpen) {
                // 검색 입력 필드에 포커스가 있으면 유지하지 않고 닫기 (다른 메뉴에 hover했으므로)
                setIsOpen(false)
            }
        }

        window.addEventListener('submenu-opened', handleOtherSubMenuOpen)
        return () => {
            window.removeEventListener('submenu-opened', handleOtherSubMenuOpen)
        }
    }, [isOpen, props.id])

    // isOpen이 true가 될 때 다른 SubMenu에 알림
    useEffect(() => {
        if (isOpen) {
            // 다른 SubMenu 요소 찾기
            const otherSubMenus = document.querySelectorAll('.SubMenu:not([data-submenu-id="' + props.id + '"])')
            if (otherSubMenus.length > 0) {
                // 커스텀 이벤트 발생시켜서 다른 SubMenuOption들이 자신을 닫도록 함
                window.dispatchEvent(new CustomEvent('submenu-opened', { detail: { subMenuId: props.id } }))
            }
        }
    }, [isOpen, props.id])

    const [subMenuStyle, setSubMenuStyle] = useState<CSSProperties>({})
    const subMenuRef = useRef<HTMLDivElement>(null)

    const updateSubMenuStyle = useCallback(() => {
        if (!ref.current) {
            return
        }

        const isMobile = window.innerWidth <= 430
        if (isMobile) {
            setSubMenuStyle({})
            return
        }

        const rect = ref.current.getBoundingClientRect()
        const pos = props.position || 'bottom'
        const newStyle: CSSProperties = {
            position: 'fixed',
            zIndex: 1000,
        }

        if (pos === 'left' || pos === 'left-bottom') {
            const subMenuWidth = subMenuRef.current?.offsetWidth || 180
            if (rect.left >= subMenuWidth) {
                newStyle.right = window.innerWidth - rect.left
                newStyle.left = 'auto'
            } else {
                newStyle.left = rect.right
                newStyle.right = 'auto'
            }
            newStyle.top = rect.top
            newStyle.bottom = 'auto'
        } else if (pos === 'top') {
            newStyle.left = rect.right
            newStyle.bottom = window.innerHeight - rect.bottom
            newStyle.right = 'auto'
            newStyle.top = 'auto'
        } else if (pos === 'auto') {
            newStyle.left = rect.right
            newStyle.right = 'auto'
            const spaceBelow = window.innerHeight - rect.bottom
            const spaceAbove = rect.top
            if (spaceAbove > spaceBelow) {
                newStyle.bottom = window.innerHeight - rect.top
                newStyle.top = 'auto'
            } else {
                newStyle.top = rect.top
                newStyle.bottom = 'auto'
            }
        } else {
            newStyle.left = rect.right
            newStyle.top = rect.top
            newStyle.right = 'auto'
            newStyle.bottom = 'auto'
        }

        setSubMenuStyle(newStyle)
    }, [props.position])

    useLayoutEffect(() => {
        if (isOpen) {
            updateSubMenuStyle()
        } else {
            setSubMenuStyle({})
        }
    }, [isOpen, updateSubMenuStyle])

    useEffect(() => {
        if (!isOpen) {
            return undefined
        }
        window.addEventListener('scroll', updateSubMenuStyle, true)
        window.addEventListener('resize', updateSubMenuStyle)
        return () => {
            window.removeEventListener('scroll', updateSubMenuStyle, true)
            window.removeEventListener('resize', updateSubMenuStyle)
        }
    }, [isOpen, updateSubMenuStyle])

    return (
        <div
            id={props.id}
            className={`MenuOption SubMenuOption menu-option${openLeftClass}${isOpen ? ' menu-option-active' : ''}${props.className ? ' ' + props.className : ''}`}
            onClick={(e: React.MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()
                setIsOpen((open) => !open)
            }}
            ref={ref}
        >
            {props.icon ? <div className='menu-option__icon'>{props.icon}</div> : <div className='noicon'/>}
            <div className='menu-name'>{props.name}</div>
            <CompassIcon icon='chevron-right'/>
            {isOpen &&
                <div
                    ref={subMenuRef}
                    className={'SubMenu Menu noselect'}
                    style={subMenuStyle}
                    data-submenu-id={props.id}
                >
                    <div className='menu-contents'>
                        <div className='menu-options'>
                            {props.children}
                        </div>
                        <div className='menu-spacer hideOnWidescreen'/>

                        <div className='menu-options hideOnWidescreen'>
                            <Menu.Text
                                id='menu-cancel'
                                name={'Cancel'}
                                className='menu-cancel'
                                onClick={() => undefined}
                            />
                        </div>
                    </div>

                </div>
            }
        </div>
    )
}

export default React.memo(SubMenuOption)
