// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, MutableRefObject} from 'react'

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {
    COMMAND_PRIORITY_LOW,
    KEY_ENTER_COMMAND,
    KEY_ESCAPE_COMMAND,
    $getRoot,
    LexicalEditor,
} from 'lexical'

type Props = {
    saveOnEnter?: boolean
    onSave?: (text: string) => void
    onCancel?: () => void
    editorRef?: MutableRefObject<LexicalEditor | null>
}

export function KeyboardPlugin({saveOnEnter, onSave, onCancel, editorRef}: Props): null {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (editorRef) {
            editorRef.current = editor
        }
    }, [editor, editorRef])

    useEffect(() => {
        const unregisterEnter = editor.registerCommand(
            KEY_ENTER_COMMAND,
            (event: KeyboardEvent | null) => {
                if (!saveOnEnter || !onSave) {
                    return false
                }

                if (event?.shiftKey) {
                    return false
                }

                event?.preventDefault()
                editor.getEditorState().read(() => {
                    const text = $getRoot().getTextContent()
                    onSave(text)
                })
                return true
            },
            COMMAND_PRIORITY_LOW,
        )

        const unregisterEscape = editor.registerCommand(
            KEY_ESCAPE_COMMAND,
            () => {
                if (onCancel) {
                    const text = $getRoot().getTextContent()
                    if (text.length === 0) {
                        onCancel()
                        return true
                    }
                }
                editor.blur()
                return true
            },
            COMMAND_PRIORITY_LOW,
        )

        return () => {
            unregisterEnter()
            unregisterEscape()
        }
    }, [editor, saveOnEnter, onSave, onCancel])

    return null
}

export default KeyboardPlugin
