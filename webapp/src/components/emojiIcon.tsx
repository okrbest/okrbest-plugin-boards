// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'

import {getMattermostStore} from '../mmStore'
import {isEmojiShortcode} from '../utils/emojiUtils'

type Props = {
    icon: string
    size?: 'small' | 'medium' | 'large' | number
}

// window.Components에서 RenderEmoji 가져오기
type RenderEmojiProps = {
    emojiName: string
    size?: number
}

const getRenderEmoji = (): React.ComponentType<RenderEmojiProps> | null => {
    const windowAny = window as any
    return windowAny.Components?.RenderEmoji || null
}

// 크기 매핑
const sizeMap: Record<string, number> = {
    small: 16,
    medium: 20,
    large: 24,
}

const EmojiIcon: React.FC<Props> = ({icon, size = 'medium'}) => {
    const mmStore = getMattermostStore()
    const RenderEmoji = getRenderEmoji()

    if (!icon) {
        return null
    }

    const pixelSize = typeof size === 'number' ? size : sizeMap[size] || 20

    // RenderEmoji 사용 가능하고, shortcode 형식이면 RenderEmoji로 렌더링
    const useRenderEmoji = RenderEmoji && mmStore && isEmojiShortcode(icon)

    if (useRenderEmoji) {
        return (
            <ReduxProvider store={mmStore}>
                <RenderEmoji
                    emojiName={icon}
                    size={pixelSize}
                />
            </ReduxProvider>
        )
    }

    // 기존 방식: 유니코드 이모지 문자로 표시
    // 크기는 부모 요소의 CSS에서 처리
    return <>{icon}</>
}

export default React.memo(EmojiIcon)
