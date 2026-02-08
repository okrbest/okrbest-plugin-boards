// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {EditorThemeClasses} from 'lexical'

const editorTheme: EditorThemeClasses = {
    paragraph: 'lexical-paragraph',
    text: {
        bold: 'lexical-text-bold',
        italic: 'lexical-text-italic',
        underline: 'lexical-text-underline',
        strikethrough: 'lexical-text-strikethrough',
        code: 'lexical-text-code',
    },
    link: 'lexical-link',
    code: 'lexical-code',
    quote: 'lexical-quote',
    heading: {
        h1: 'lexical-heading-h1',
        h2: 'lexical-heading-h2',
        h3: 'lexical-heading-h3',
    },
    list: {
        ul: 'lexical-list-ul',
        ol: 'lexical-list-ol',
        listitem: 'lexical-list-item',
    },
}

// Beautiful mentions theme integration
export const mentionsTheme = {
    '@': 'lexical-mention',
    '@Focused': 'lexical-mention-focused',
}

export const emojiTheme = {
    ':': 'lexical-emoji',
    ':Focused': 'lexical-emoji-focused',
}

export default editorTheme
