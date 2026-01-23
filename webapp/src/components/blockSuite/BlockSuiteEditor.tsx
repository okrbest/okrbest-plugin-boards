// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef} from 'react'
import {useIntl} from 'react-intl'

import {AffineSchemas} from '@blocksuite/blocks'
import {Schema, DocCollection} from '@blocksuite/store'
import {PageEditor} from '@blocksuite/presets'

import {effects as presetsEffects} from '@blocksuite/presets/effects'

import {effects as blocksEffects} from '@blocksuite/blocks/effects'

import {Block} from '../../blocks/block'
import {Card} from '../../blocks/card'

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
}

function BlockSuiteEditor(props: Props): JSX.Element {
    const {card, contents, readonly} = props
    const intl = useIntl()

    const containerRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<PageEditor | null>(null)
    const collectionRef = useRef<DocCollection | null>(null)

    const {doc, loading, error, saving} = useBlockSuiteEditor({
        card,
        contents,
        readonly,
    })

    useEffect(() => {
        if (!containerRef.current || !doc) {
            return
        }

        if (editorRef.current) {
            editorRef.current.remove()
            editorRef.current = null
        }

        try {
            const schema = new Schema().register(AffineSchemas)
            const blobSource = createFocalboardBlobSource(card.boardId)
            const collection = new DocCollection({
                schema,
                blobSources: {
                    main: blobSource,
                },
            })
            collection.meta.initialize()

            const editorDoc = collection.createDoc()

            editorDoc.load(() => {
                const yBlocks = doc.getMap('blocks')
                const yMeta = doc.getMap('meta')

                const rootId = editorDoc.addBlock('affine:page', {
                    title: new editorDoc.Text(yMeta.get('cardTitle') as string || ''),
                })

                editorDoc.addBlock('affine:surface', {}, rootId)
                const noteId = editorDoc.addBlock('affine:note', {}, rootId)

                const blockOrder = (yMeta.get('blockOrder') as string[]) || []

                blockOrder.forEach((blockId: string) => {
                    const yBlock = yBlocks.get(blockId) as Map<string, unknown> | undefined
                    if (!yBlock) {
                        return
                    }

                    const blockType = yBlock.get('type') as string
                    const blockProps = yBlock.get('props') as Record<string, unknown> || {}
                    const blockText = yBlock.get('text') as string || ''

                    switch (blockType) {
                    case 'affine:paragraph': {
                        const paragraphType = (blockProps.type as string) || 'text'
                        editorDoc.addBlock('affine:paragraph', {
                            type: paragraphType as 'text' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote',
                            text: new editorDoc.Text(blockText),
                        }, noteId)
                        break
                    }
                    case 'affine:list': {
                        const listType = (blockProps.type as string) || 'bulleted'
                        editorDoc.addBlock('affine:list', {
                            type: listType as 'bulleted' | 'numbered' | 'todo' | 'toggle',
                            text: new editorDoc.Text(blockText),
                            checked: (blockProps.checked as boolean) || false,
                        }, noteId)
                        break
                    }
                    case 'affine:divider': {
                        editorDoc.addBlock('affine:divider', {}, noteId)
                        break
                    }
                    case 'affine:image': {
                        editorDoc.addBlock('affine:image', {
                            sourceId: (blockProps.sourceId as string) || '',
                        }, noteId)
                        break
                    }
                    default: {
                        editorDoc.addBlock('affine:paragraph', {
                            type: 'text' as const,
                            text: new editorDoc.Text(blockText),
                        }, noteId)
                    }
                    }
                })

                if (blockOrder.length === 0) {
                    editorDoc.addBlock('affine:paragraph', {
                        type: 'text' as const,
                        text: new editorDoc.Text(''),
                    }, noteId)
                }
            })

            const editor = new PageEditor()
            editor.doc = editorDoc

            if (readonly) {
                editor.setAttribute('readonly', 'true')
            }

            containerRef.current.innerHTML = ''
            containerRef.current.appendChild(editor)

            editorRef.current = editor
            collectionRef.current = collection
        } catch (err) {
            console.error('BlockSuite editor initialization error:', err)
        }

        return () => {
            if (editorRef.current) {
                editorRef.current.remove()
                editorRef.current = null
            }
        }
    }, [doc, readonly])

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

    return (
        <div className='BlockSuiteEditor'>
            {saving && (
                <div className='BlockSuiteEditor__saving'>
                    {intl.formatMessage({
                        id: 'BlockSuiteEditor.saving',
                        defaultMessage: 'Saving...',
                    })}
                </div>
            )}
            <div
                ref={containerRef}
                className='BlockSuiteEditor__container'
            />
        </div>
    )
}

export default React.memo(BlockSuiteEditor)
