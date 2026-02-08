// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect} from 'react'

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {COMMAND_PRIORITY_LOW, FOCUS_COMMAND, BLUR_COMMAND} from 'lexical'

type Props = {
    onFocus?: () => void
    onBlur?: (text: string) => void
}

export function FocusPlugin({onFocus, onBlur}: Props): null {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        const unregisterFocus = editor.registerCommand(
            FOCUS_COMMAND,
            () => {
                onFocus?.()
                return false
            },
            COMMAND_PRIORITY_LOW,
        )

        const unregisterBlur = editor.registerCommand(
            BLUR_COMMAND,
            () => {
                editor.getEditorState().read(() => {
                    const text = editor.getRootElement()?.textContent || ''
                    onBlur?.(text)
                })
                return false
            },
            COMMAND_PRIORITY_LOW,
        )

        return () => {
            unregisterFocus()
            unregisterBlur()
        }
    }, [editor, onFocus, onBlur])

    return null
}

export default FocusPlugin
