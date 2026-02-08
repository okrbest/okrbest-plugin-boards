// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect} from 'react'

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {$getRoot} from 'lexical'

type Props = {
    onChange?: (text: string) => void
}

export function OnChangePlugin({onChange}: Props): null {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!onChange) {
            return
        }

        return editor.registerUpdateListener(({editorState}) => {
            editorState.read(() => {
                const root = $getRoot()
                const text = root.getTextContent()
                onChange(text)
            })
        })
    }, [editor, onChange])

    return null
}

export default OnChangePlugin
