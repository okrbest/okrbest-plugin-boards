// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'

import {BlockIcons} from '../blockIcons'
import {Card} from '../blocks/card'
import mutator from '../mutator'

import EmojiIcon from './emojiIcon'
import IconSelector from './iconSelector'

type Props = {
    block: Card
    size?: 's' | 'm' | 'l'
    readonly?: boolean
}

const BlockIconSelector = (props: Props) => {
    const {block, size} = props

    const onSelectEmoji = useCallback((emoji: string) => {
        mutator.changeBlockIcon(block.boardId, block.id, block.fields.icon, emoji)
        document.body.click()
    }, [block.id, block.fields.icon])
    const onAddRandomIcon = useCallback(() => mutator.changeBlockIcon(block.boardId, block.id, block.fields.icon, BlockIcons.shared.randomIcon()), [block.id, block.fields.icon])
    const onRemoveIcon = useCallback(async () => {
        await mutator.changeBlockIcon(block.boardId, block.id, block.fields.icon, '', 'remove icon')
        window.getSelection()?.removeAllRanges()
    }, [block.id, block.fields.icon])

    if (!block.fields.icon) {
        return null
    }

    // 아이콘 크기 매핑
    const sizeMap = {
        s: 20,
        m: 22,
        l: 64,
    }
    const iconSize = sizeMap[size || 'm']

    let className = `octo-icon size-${size || 'm'}`
    if (props.readonly) {
        className += ' readonly'
    }

    const iconElement = (
        <div className={className}>
            <EmojiIcon icon={block.fields.icon} size={iconSize}/>
        </div>
    )

    return (
        <IconSelector
            readonly={props.readonly}
            iconElement={iconElement}
            onAddRandomIcon={onAddRandomIcon}
            onSelectEmoji={onSelectEmoji}
            onRemoveIcon={onRemoveIcon}
        />
    )
}

export default React.memo(BlockIconSelector)
