// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState, useContext, CSSProperties, useRef} from 'react'

import CompassIcon from '../../widgets/icons/compassIcon'

import MenuUtil from './menuUtil'

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

    const styleRef = useRef<CSSProperties>({})

     useEffect(() => {
         const newStyle: CSSProperties = {}
         if (props.position === 'auto' && ref.current) {
             const openUp = MenuUtil.openUp(ref as React.RefObject<HTMLElement>)
            if (openUp.openUp) {
                newStyle.bottom = 0
            } else {
                newStyle.top = 0
            }
        }

        styleRef.current = newStyle
    }, [ref.current])

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
                    className={'SubMenu Menu noselect ' + (props.position || 'bottom')}
                    style={styleRef.current}
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
