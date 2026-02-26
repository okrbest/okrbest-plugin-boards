// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'

import {BlockIcons} from '../blockIcons'
import {Board} from '../blocks/board'
import mutator from '../mutator'

import EmojiIcon from './emojiIcon'
import IconSelector from './iconSelector'

type Props = {
    board: Board
    size?: 's' | 'm' | 'l'
    readonly?: boolean
}

const BoardIconSelector = React.memo((props: Props) => {
    const {board, size} = props

    const onSelectEmoji = useCallback((emoji: string) => {
        mutator.changeBoardIcon(board.id, board.icon, emoji)
        document.body.click()
    }, [board.id, board.icon])
    const onAddRandomIcon = useCallback(() => mutator.changeBoardIcon(board.id, board.icon, BlockIcons.shared.randomIcon()), [board.id, board.icon])
    const onRemoveIcon = useCallback(async () => {
        await mutator.changeBoardIcon(board.id, board.icon, '', 'remove board icon')
        document.body.focus()
    }, [board.id, board.icon])

    if (!board.icon) {
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
            <EmojiIcon icon={board.icon} size={iconSize}/>
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
})

BoardIconSelector.displayName = 'BoardIconSelector'

export default BoardIconSelector
