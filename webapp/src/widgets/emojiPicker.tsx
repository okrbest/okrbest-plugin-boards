// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {FC, useState, useEffect, useCallback} from 'react'

import data from '@emoji-mart/data'
import {init as initEmojiMart} from 'emoji-mart'

import './emojiPicker.scss'

type Props = {
    onSelect: (emoji: string) => void
}

type EmojiSelectData = {
    native: string
    id: string
    name: string
    unified: string
    shortcodes: string
}

// Picker 컴포넌트 타입
type PickerComponent = React.ComponentType<{
    data: typeof data
    onEmojiSelect: (emoji: EmojiSelectData) => void
}>

const EmojiPicker: FC<React.PropsWithChildren<Props>> = (props: Props): React.JSX.Element => {
    const [Picker, setPicker] = useState<PickerComponent | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let isMounted = true

        const loadPicker = async () => {
            // emoji-mart 초기화 보장
            initEmojiMart({data})

            // Picker 컴포넌트 동적 로드
            const module = await import('@emoji-mart/react')
            if (isMounted) {
                setPicker(() => module.default as PickerComponent)
                setIsLoading(false)
            }
        }

        loadPicker()

        return () => {
            isMounted = false
        }
    }, [])

    const handleEmojiSelect = useCallback((emoji: EmojiSelectData) => {
        props.onSelect(emoji.native)
    }, [props.onSelect])

    if (isLoading || !Picker) {
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
            className='EmojiPicker'
            onClick={(e) => e.stopPropagation()}
        >
            <Picker
                data={data}
                onEmojiSelect={handleEmojiSelect}
            />
        </div>
    )
}

export default EmojiPicker
