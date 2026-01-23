// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useState, useEffect, useRef, useCallback, useMemo} from 'react'
import * as Y from 'yjs'

import {Block} from '../../blocks/block'
import {Card} from '../../blocks/card'
import {Utils} from '../../utils'

import blockSuiteApi from './blockSuiteApi'
import {convertLegacyBlocksToYjsDoc, createEmptyYjsDoc} from './legacyConverter'

const AUTO_SAVE_DELAY_MS = 2000
const ENABLE_API_SYNC = false

interface UseBlockSuiteEditorProps {
    card: Card
    contents: Block[]
    readonly: boolean
}

interface UseBlockSuiteEditorReturn {
    doc: Y.Doc | null
    loading: boolean
    error: Error | null
    saving: boolean
    save: () => Promise<void>
}

function debounce<T extends (...args: Parameters<T>) => void>(
    func: T,
    wait: number,
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(() => {
            func(...args)
            timeoutId = null
        }, wait)
    }
}

export function useBlockSuiteEditor(props: UseBlockSuiteEditorProps): UseBlockSuiteEditorReturn {
    const {card, contents, readonly} = props
    const cardId = card.id

    const [doc, setDoc] = useState<Y.Doc | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)
    const [saving, setSaving] = useState(false)

    const docRef = useRef<Y.Doc | null>(null)
    const initializedRef = useRef(false)

    const saveToServer = useCallback(async () => {
        if (!docRef.current || readonly || !ENABLE_API_SYNC) {
            return
        }

        setSaving(true)
        try {
            const snapshot = Y.encodeStateAsUpdate(docRef.current)
            await blockSuiteApi.saveDocContent(cardId, snapshot)
            Utils.log(`BlockSuite doc saved: ${snapshot.byteLength} bytes`)
        } catch (err) {
            Utils.logError(`BlockSuite save error: ${err}`)
        } finally {
            setSaving(false)
        }
    }, [cardId, readonly])

    const debouncedSave = useMemo(
        () => debounce(saveToServer, AUTO_SAVE_DELAY_MS),
        [saveToServer],
    )

    useEffect(() => {
        if (initializedRef.current) {
            return
        }
        initializedRef.current = true

        async function initializeDoc() {
            setLoading(true)
            setError(null)

            try {
                let yDoc: Y.Doc

                if (ENABLE_API_SYNC) {
                    const docInfo = await blockSuiteApi.getDocInfo(cardId)

                    if (docInfo) {
                        const snapshot = await blockSuiteApi.getDocContent(cardId)
                        yDoc = new Y.Doc()

                        if (snapshot && snapshot.byteLength > 0) {
                            Y.applyUpdate(yDoc, snapshot)
                        }

                        Utils.log(`BlockSuite doc loaded: ${snapshot?.byteLength || 0} bytes`)
                    } else if (contents.length > 0) {
                        yDoc = convertLegacyBlocksToYjsDoc(contents, card)
                        Utils.log(`Converted ${contents.length} legacy blocks to Yjs`)

                        if (!readonly) {
                            const snapshot = Y.encodeStateAsUpdate(yDoc)
                            await blockSuiteApi.saveDocContent(cardId, snapshot)
                            Utils.log(`Initial migration saved: ${snapshot.byteLength} bytes`)
                        }
                    } else {
                        yDoc = createEmptyYjsDoc(card)
                        Utils.log('Created empty Yjs doc')
                    }
                } else {
                    if (contents.length > 0) {
                        yDoc = convertLegacyBlocksToYjsDoc(contents, card)
                        Utils.log(`Converted ${contents.length} legacy blocks to Yjs`)
                    } else {
                        yDoc = createEmptyYjsDoc(card)
                        Utils.log('Created empty Yjs doc')
                    }
                }

                docRef.current = yDoc
                setDoc(yDoc)

                if (!readonly && ENABLE_API_SYNC) {
                    yDoc.on('update', () => {
                        debouncedSave()
                    })
                }
            } catch (err) {
                Utils.logError(`BlockSuite init error: ${err}`)
                setError(err instanceof Error ? err : new Error(String(err)))
            } finally {
                setLoading(false)
            }
        }

        initializeDoc()

        return () => {
            if (docRef.current) {
                docRef.current.destroy()
                docRef.current = null
            }
        }
    }, [cardId, card, contents, readonly, debouncedSave])

    return {
        doc,
        loading,
        error,
        saving,
        save: saveToServer,
    }
}

export default useBlockSuiteEditor
