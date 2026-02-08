// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getEmojiDataFromNative} from 'emoji-mart'

export type EmojiData = {
    id: string
    name: string
    native: string
    unified: string
    keywords: string[]
    shortcodes: string
    skin?: number
}

let emojiCache: Map<string, EmojiData | null> = new Map()

export function getValidEmojiData(native: string): EmojiData | null {
    if (emojiCache.has(native)) {
        return emojiCache.get(native) || null
    }

    getEmojiDataFromNative(native).then((data: EmojiData | null) => {
        emojiCache.set(native, data)
    }).catch(() => {
        emojiCache.set(native, null)
    })

    return null
}
