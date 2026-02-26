// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {FC, useCallback} from 'react'
import {Provider as ReduxProvider} from 'react-redux'

import {getMattermostStore} from '../mmStore'

import './emojiPicker.scss'

type Props = {
    onSelect: (emoji: string) => void
    onClose?: () => void
}

// Mattermost 채널의 Emoji 타입 (SystemEmoji | CustomEmoji)
type MattermostEmoji = {
    name: string
    short_name?: string // SystemEmoji
    unified?: string // SystemEmoji
    id?: string // CustomEmoji
    category?: string
}

// Mattermost 채널에서 제공하는 EmojiPickerTabs 타입
type EmojiPickerTabsProps = {
    onEmojiClose: () => void
    onEmojiClick: (emoji: MattermostEmoji) => void
    onGifClick?: (gif: string) => void
    onAddCustomEmojiClick?: () => void
    enableGifPicker?: boolean
}

// window.Components에서 EmojiPickerTabs 가져오기
const getEmojiPickerTabs = (): React.ComponentType<EmojiPickerTabsProps> | null => {
    const windowAny = window as any
    return windowAny.Components?.EmojiPickerTabs || null
}

const EmojiPicker: FC<React.PropsWithChildren<Props>> = (props: Props): React.JSX.Element => {
    const EmojiPickerTabs = getEmojiPickerTabs()
    const mmStore = getMattermostStore()

    const handleEmojiClick = useCallback((emoji: MattermostEmoji) => {
        // 이모지 이름(shortcode)으로 저장 - RenderEmoji에서 사용
        // SystemEmoji: short_name 사용
        // CustomEmoji: name 사용
        const emojiName = emoji.short_name || emoji.name
        props.onSelect(emojiName)
    }, [props.onSelect])

    const handleClose = useCallback(() => {
        props.onClose?.()
        // 메뉴를 닫기 위해 body 클릭 이벤트 발생
        document.body.click()
    }, [props.onClose])

    // EmojiPickerTabs 또는 mmStore가 없으면 로딩 표시
    if (!EmojiPickerTabs || !mmStore) {
        return (
            <div
                className='EmojiPicker EmojiPicker--loading'
                onClick={(e) => e.stopPropagation()}
            >
                <div className='EmojiPicker__spinner'/>
            </div>
        )
    }

    return (
        <div
            className='EmojiPicker EmojiPicker--mattermost'
            onClick={(e) => e.stopPropagation()}
        >
            <ReduxProvider store={mmStore}>
                <EmojiPickerTabs
                    onEmojiClose={handleClose}
                    onEmojiClick={handleEmojiClick}
                    enableGifPicker={false}
                />
            </ReduxProvider>
        </div>
    )
}

export default EmojiPicker
