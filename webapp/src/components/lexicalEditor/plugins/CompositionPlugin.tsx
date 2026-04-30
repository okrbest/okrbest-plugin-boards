// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useRef} from 'react'

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {KEY_ENTER_COMMAND, LexicalEditor, SKIP_DOM_SELECTION_TAG} from 'lexical'

/**
 * Handles Korean IME composition interactions with Lexical editor:
 *
 * 1. Typeahead during composition:
 *    LexicalTypeaheadMenuPlugin skips typeahead evaluation when
 *    editor.isComposing() returns true. This prevents mention search
 *    from updating while Korean characters are being composed.
 *    We temporarily bypass isComposing() after each compositionupdate
 *    and trigger a synchronous editor update so the typeahead can
 *    re-evaluate with the composed text.
 *
 * 2. Enter key during composition:
 *    When a user presses Enter during Korean IME composition, the browser
 *    consumes the Enter key to finalize the composition. Lexical's
 *    KEY_ENTER_COMMAND is never dispatched, so the typeahead menu cannot
 *    select the highlighted item. We re-dispatch KEY_ENTER_COMMAND after
 *    compositionend so the menu can process the selection.
 */

const HAS_DIRTY_NODES = 1

export function CompositionPlugin(): null {
    const [editor] = useLexicalComposerContext()
    const enterDuringCompositionRef = useRef(false)
    const bypassComposingRef = useRef(false)

    // Override editor.isComposing() so that LexicalTypeaheadMenuPlugin's
    // update listener can run during Korean IME composition when we
    // explicitly set the bypass flag.
    useEffect(() => {
        const originalIsComposing = editor.isComposing

        editor.isComposing = function(this: LexicalEditor) {
            if (bypassComposingRef.current) {
                return false
            }
            return originalIsComposing.call(this)
        }

        return () => {
            editor.isComposing = originalIsComposing
        }
    }, [editor])

    // After each compositionupdate, force the typeahead to re-evaluate
    // by triggering a synchronous editor update with the bypass flag.
    //
    // Key details:
    //   - _dirtyType = HAS_DIRTY_NODES forces Lexical to call
    //     commitPendingUpdates (and thus update listeners), even though
    //     no actual nodes are dirty. The reconciler sees empty dirty sets
    //     and skips all DOM mutations.
    //   - discrete: true makes the commit synchronous so the bypass flag
    //     is still active when update listeners execute.
    //   - SKIP_DOM_SELECTION_TAG prevents DOM selection changes that would
    //     break the active IME composition.
    useEffect(() => {
        const rootElement = editor.getRootElement()
        if (!rootElement) {
            return
        }

        let rafId: number | null = null

        const handleCompositionUpdate = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
            }
            rafId = requestAnimationFrame(() => {
                rafId = null

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((editor as any)._compositionKey == null) {
                    return
                }

                bypassComposingRef.current = true
                try {
                    editor.update(
                        () => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (editor as any)._dirtyType = HAS_DIRTY_NODES
                        },
                        {discrete: true, tag: SKIP_DOM_SELECTION_TAG},
                    )
                } finally {
                    bypassComposingRef.current = false
                }
            })
        }

        rootElement.addEventListener('compositionupdate', handleCompositionUpdate)

        return () => {
            rootElement.removeEventListener('compositionupdate', handleCompositionUpdate)
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
            }
        }
    }, [editor])

    // Handle Korean IME composition + Enter key interaction.
    useEffect(() => {
        const rootElement = editor.getRootElement()
        if (!rootElement) {
            return
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && e.isComposing) {
                enterDuringCompositionRef.current = true
            }
        }

        const handleCompositionEnd = () => {
            if (!enterDuringCompositionRef.current) {
                return
            }
            enterDuringCompositionRef.current = false

            const removeListener = editor.registerUpdateListener(() => {
                removeListener()
                setTimeout(() => {
                    editor.dispatchCommand(KEY_ENTER_COMMAND, null)
                }, 150)
            })
        }

        rootElement.addEventListener('keydown', handleKeyDown, true)
        rootElement.addEventListener('compositionend', handleCompositionEnd)

        return () => {
            rootElement.removeEventListener('keydown', handleKeyDown, true)
            rootElement.removeEventListener('compositionend', handleCompositionEnd)
        }
    }, [editor])

    return null
}

export default CompositionPlugin
