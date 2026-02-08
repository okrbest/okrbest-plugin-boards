// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties, useState, useRef} from 'react'

import SeparatorOption from './separatorOption'
import SwitchOption from './switchOption'
import TextOption from './textOption'
import ColorOption from './colorOption'
import SubMenuOption, {HoveringContext} from './subMenuOption'
import LabelOption from './labelOption'

import './menu.scss'
import textInputOption from './textInputOption'
import MenuUtil from './menuUtil'

type Props = {
    children: React.ReactNode
    position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
    fixed?: boolean
    parentRef?: React.RefObject<any>
}

const Menu = React.memo((props: Props): React.JSX.Element => {
    const {position, fixed, children, parentRef} = props
    const menuRef = useRef<HTMLDivElement>(null)
    const [hovering, setHovering] = useState<React.ReactNode>(null)

    let style: CSSProperties = {}
    if (parentRef) {
        const forceBottom = position ? ['bottom', 'left', 'right'].includes(position) : false
        style = MenuUtil.openUp(parentRef, forceBottom).style
    }

    const onCancel = () => {
        // No need to do anything, as click bubbled up to MenuWrapper, which closes
    }

    return (
        <div
            className={`Menu noselect ${position || 'bottom'} ${fixed ? ' fixed' : ''}`}
            style={style}
            ref={menuRef}
        >
            <div className='menu-contents'>
                <div className='menu-options'>
                    {React.Children.toArray(children).map((child, index) => (
                        <div
                            key={index}
                            onMouseEnter={() => setHovering(child)}
                        >
                            <HoveringContext.Provider value={child === hovering}>
                                {child}
                            </HoveringContext.Provider>
                        </div>
                    ))}
                </div>

                <div className='menu-spacer hideOnWidescreen'/>

                <div className='menu-options hideOnWidescreen'>
                    <TextOption
                        id='menu-cancel'
                        name={'Cancel'}
                        className='menu-cancel'
                        onClick={onCancel}
                    />
                </div>
            </div>
        </div>
    )
})

// Attach static properties
const MenuWithStatics = Menu as any
MenuWithStatics.displayName = 'Menu'
MenuWithStatics.Color = ColorOption
MenuWithStatics.SubMenu = SubMenuOption
MenuWithStatics.Switch = SwitchOption
MenuWithStatics.Separator = SeparatorOption
MenuWithStatics.Text = TextOption
MenuWithStatics.TextInput = textInputOption
MenuWithStatics.Label = LabelOption

export default MenuWithStatics
