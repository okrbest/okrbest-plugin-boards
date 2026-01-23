// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, useCallback, useState} from 'react'
import {useIntl} from 'react-intl'

import {AffineSchemas} from '@blocksuite/blocks'
import {Schema, DocCollection, Job, type Doc} from '@blocksuite/store'
import {PageEditor} from '@blocksuite/presets'

import {effects as presetsEffects} from '@blocksuite/presets/effects'
import {effects as blocksEffects} from '@blocksuite/blocks/effects'

import {Block} from '../../blocks/block'
import {Card} from '../../blocks/card'
import {Utils} from '../../utils'

import {useBlockSuiteEditor} from './useBlockSuiteEditor'
import {createFocalboardBlobSource} from './focalboardBlobSource'

import './blockSuiteTheme.css'
import './blockSuite.scss'

presetsEffects()
blocksEffects()

type Props = {
    card: Card
    contents: Block[]
    readonly: boolean
    teamId: string
}

function BlockSuiteEditor(props: Props): JSX.Element {
    const {card, contents, readonly, teamId} = props
    const intl = useIntl()

    const [containerMounted, setContainerMounted] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<PageEditor | null>(null)
    const collectionRef = useRef<DocCollection | null>(null)
    const jobRef = useRef<Job | null>(null)
    const editorDocRef = useRef<Doc | null>(null)

    const {snapshot, loading, error, saveStatus, scheduleSave} = useBlockSuiteEditor({
        card,
        contents,
        readonly,
    })

    const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
        containerRef.current = node
        setContainerMounted(!!node)
    }, [])

    const handleDocUpdate = useCallback(async () => {
        if (readonly || !editorDocRef.current || !jobRef.current) {
            return
        }

        try {
            const docSnapshot = await jobRef.current.docToSnapshot(editorDocRef.current)
            if (docSnapshot) {
                scheduleSave(docSnapshot)
            }
        } catch (err) {
            Utils.logError(`Failed to create snapshot: ${err}`)
        }
    }, [readonly, scheduleSave])

    useEffect(() => {
        Utils.log(`BlockSuiteEditor useEffect: containerMounted=${containerMounted}, snapshot=${!!snapshot}`)

        if (!containerMounted || !containerRef.current || !snapshot) {
            return
        }

        if (editorRef.current) {
            editorRef.current.remove()
            editorRef.current = null
        }

        async function initEditor() {
            if (!containerRef.current || !snapshot) {
                return
            }

            try {
                Utils.log('BlockSuiteEditor: Starting initialization...')
                Utils.log(`BlockSuiteEditor: Snapshot type=${snapshot.type}, blocks flavour=${snapshot.blocks?.flavour}`)

                const schema = new Schema().register(AffineSchemas)
                const blobSource = createFocalboardBlobSource(card.boardId, teamId)
                const collection = new DocCollection({
                    schema,
                    blobSources: {
                        main: blobSource,
                    },
                })
                collection.meta.initialize()

                const job = new Job({collection})

                Utils.log('BlockSuiteEditor: Calling snapshotToDoc...')
                const editorDoc = await job.snapshotToDoc(snapshot)
                if (!editorDoc) {
                    throw new Error('Failed to load document from snapshot')
                }
                Utils.log(`BlockSuiteEditor: snapshotToDoc returned doc id=${editorDoc.id}`)

                editorDoc.load()
                Utils.log('BlockSuiteEditor: Doc loaded')

                const editor = new PageEditor()
                editor.doc = editorDoc

                if (readonly) {
                    editor.setAttribute('readonly', 'true')
                }

                containerRef.current.innerHTML = ''
                containerRef.current.appendChild(editor)

                editorRef.current = editor
                collectionRef.current = collection
                jobRef.current = job
                editorDocRef.current = editorDoc

                if (!readonly && editorDoc.spaceDoc) {
                    editorDoc.spaceDoc.on('update', handleDocUpdate)
                }

                Utils.log('BlockSuiteEditor: Initialization complete')
            } catch (err) {
                Utils.logError(`BlockSuite editor initialization error: ${err}`)
                console.error('BlockSuite init error details:', err)
            }
        }

        initEditor()

        return () => {
            if (editorDocRef.current?.spaceDoc) {
                editorDocRef.current.spaceDoc.off('update', handleDocUpdate)
            }
            if (editorRef.current) {
                editorRef.current.remove()
                editorRef.current = null
            }
            editorDocRef.current = null
            jobRef.current = null
        }
    }, [containerMounted, snapshot, readonly, card.boardId, teamId, handleDocUpdate])

    if (loading) {
        return (
            <div className='BlockSuiteEditor BlockSuiteEditor--loading'>
                <div className='BlockSuiteEditor__spinner'/>
                <span>
                    {intl.formatMessage({
                        id: 'BlockSuiteEditor.loading',
                        defaultMessage: 'Loading editor...',
                    })}
                </span>
            </div>
        )
    }

    if (error) {
        return (
            <div className='BlockSuiteEditor BlockSuiteEditor--error'>
                <span>
                    {intl.formatMessage({
                        id: 'BlockSuiteEditor.error',
                        defaultMessage: 'Failed to load editor',
                    })}
                </span>
                <p>{error.message}</p>
            </div>
        )
    }

    const getSaveStatusMessage = () => {
        switch (saveStatus) {
        case 'pending':
            return intl.formatMessage({
                id: 'BlockSuiteEditor.pending',
                defaultMessage: 'Unsaved changes...',
            })
        case 'saving':
            return intl.formatMessage({
                id: 'BlockSuiteEditor.saving',
                defaultMessage: 'Saving...',
            })
        case 'saved':
            return intl.formatMessage({
                id: 'BlockSuiteEditor.saved',
                defaultMessage: 'Saved',
            })
        case 'error':
            return intl.formatMessage({
                id: 'BlockSuiteEditor.saveError',
                defaultMessage: 'Save failed',
            })
        default:
            return null
        }
    }

    const statusMessage = getSaveStatusMessage()

    return (
        <div className='BlockSuiteEditor'>
            {statusMessage && (
                <div className={`BlockSuiteEditor__saving BlockSuiteEditor__saving--${saveStatus}`}>
                    {statusMessage}
                </div>
            )}
            <div
                ref={containerCallbackRef}
                className='BlockSuiteEditor__container'
            />
        </div>
    )
}

export default React.memo(BlockSuiteEditor)
