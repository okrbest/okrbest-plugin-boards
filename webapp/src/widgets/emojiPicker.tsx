// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {FC} from 'react'

import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

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

const EmojiPicker: FC<React.PropsWithChildren<Props>> = (props: Props): React.JSX.Element => (
    <div
        className='EmojiPicker'
        onClick={(e) => e.stopPropagation()}
    >
        <Picker
            data={data}
            onEmojiSelect={(emoji: EmojiSelectData) => props.onSelect(emoji.native)}
        />
    </div>
)

export default EmojiPicker
