// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, useCallback, useState} from 'react'
import {useIntl} from 'react-intl'
import {useNavigate} from 'react-router-dom'

import {AffineSchemas, PageEditorBlockSpecs} from '@blocksuite/blocks'
import {DocModeExtension, type DocModeProvider} from '@blocksuite/affine-shared/services'
import {Schema, DocCollection, Job, type Doc} from '@blocksuite/store'
import {PageEditor} from '@blocksuite/presets'

import {effects as presetsEffects} from '@blocksuite/presets/effects'
import {effects as blocksEffects} from '@blocksuite/blocks/effects'

import {Block} from '../../blocks/block'

declare global {
    interface Window {
        __BLOCKSUITE_EFFECTS_INITIALIZED__?: boolean
    }
}
import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import {Utils} from '../../utils'
import {checkSnapshotHasContent} from '../../utils/blockSuiteUtils'
import {useAppSelector, useAppDispatch} from '../../store/hooks'
import {getSortedCards, updateCards} from '../../store/cards'
import {getBoards, getMySortedBoards} from '../../store/boards'
import {getViews, updateViews} from '../../store/views'
import {BoardView} from '../../blocks/boardView'
import octoClient from '../../octoClient'

import {useBlockSuiteEditor} from './useBlockSuiteEditor'
import {createFocalboardBlobSource} from './focalboardBlobSource'
import {createLinkedCardExtension} from './linkedCardConfig'
import {patchImageDragOption, createImageDraggableObserver} from './imageDragPatch'

import './blockSuiteTheme.css'
import './blockSuite.scss'

if (!window.__BLOCKSUITE_EFFECTS_INITIALIZED__) {
    presetsEffects()
    blocksEffects()
    window.__BLOCKSUITE_EFFECTS_INITIALIZED__ = true
}

type Props = {
    card: Card
    contents: Block[]
    readonly: boolean
    teamId: string
    viewId: string
}

function BlockSuiteEditor(props: Props): React.JSX.Element {
    const {card, contents, readonly, teamId, viewId} = props
    const intl = useIntl()
    const navigate = useNavigate()
    const dispatch = useAppDispatch()

    const allCards = useAppSelector(getSortedCards)
    const boards = useAppSelector(getBoards)
    const myBoards = useAppSelector(getMySortedBoards)
    const allCardsRef = useRef<Card[]>(allCards)
    const boardsRef = useRef<{[key: string]: Board}>(boards)
    allCardsRef.current = allCards
    boardsRef.current = boards

    const views = useAppSelector(getViews)
    const viewsRef = useRef<{[key: string]: BoardView}>(views)
    viewsRef.current = views

    useEffect(() => {
        const fetchAllBoardData = async () => {
            const boardIds = myBoards.map((b) => b.id)
            const loadedBoardIds = new Set(allCards.map((c) => c.boardId))

            for (const boardId of boardIds) {
                if (loadedBoardIds.has(boardId)) continue

                try {
                    const blocks = await octoClient.getAllBlocks(boardId)
                    const cards = blocks.filter((b): b is Card => b.type === 'card')
                    const boardViews = blocks.filter((b): b is BoardView => b.type === 'view')

                    if (cards.length > 0) {
                        dispatch(updateCards(cards))
                    }
                    if (boardViews.length > 0) {
                        dispatch(updateViews(boardViews))
                    }
                } catch (err) {
                    Utils.logError(`Failed to fetch data for board ${boardId}: ${err}`)
                }
            }
        }

        fetchAllBoardData()
    }, [myBoards.length])

    const [containerMounted, setContainerMounted] = useState(false)
    const containerRef = useRef<HTMLDivElement | null>(null)
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

    const handleLinkClick = useCallback((e: MouseEvent) => {
        const target = e.target as HTMLElement
        const anchor = target.closest('a')
        if (!anchor) return

        const href = anchor.getAttribute('href')
        if (!href) return

        const frontendBase = Utils.getFrontendBaseURL()
        const escapedBase = frontendBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        const cardLinkWithViewPattern = new RegExp(`^(https?://[^/]+)?/${escapedBase}/team/([^/]+)/([^/]+)/([^/]+)/([^/]+)/?$`)
        const cardLinkWithoutViewPattern = new RegExp(`^(https?://[^/]+)?/${escapedBase}/team/([^/]+)/([^/]+)/([^/]+)/?$`)

        const matchWithView = href.match(cardLinkWithViewPattern)
        if (matchWithView) {
            e.preventDefault()
            e.stopPropagation()
            navigate(`/team/${matchWithView[2]}/${matchWithView[3]}/${matchWithView[4]}/${matchWithView[5]}`)
            return
        }

        const matchWithoutView = href.match(cardLinkWithoutViewPattern)
        if (matchWithoutView) {
            e.preventDefault()
            e.stopPropagation()
            navigate(`/team/${matchWithoutView[2]}/${matchWithoutView[3]}/${matchWithoutView[4]}`)
        }
    }, [navigate])

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
        const container = containerRef.current
        if (!container) return

        container.addEventListener('click', handleLinkClick, true)
        return () => {
            container.removeEventListener('click', handleLinkClick, true)
        }
    }, [containerMounted, handleLinkClick])

    useEffect(() => {
        const container = containerRef.current
        if (!container || !editorRef.current || readonly) return

        const observer = createImageDraggableObserver(container)
        return () => observer.disconnect()
    }, [containerMounted, readonly])

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

                const pageModeProvider: DocModeProvider = {
                    getEditorMode: () => 'page',
                    getPrimaryMode: () => 'page',
                    setPrimaryMode: () => {},
                    togglePrimaryMode: () => 'page',
                    onPrimaryModeChange: () => ({dispose: () => {}}),
                    setEditorMode: () => {},
                }

                const linkedCardExtension = createLinkedCardExtension({
                    getCards: () => allCardsRef.current,
                    getBoards: () => boardsRef.current,
                    getViews: () => viewsRef.current,
                    getCurrentCardId: () => card.id,
                    teamId,
                    viewId,
                })

                const editor = new PageEditor()
                editor.specs = [
                    ...PageEditorBlockSpecs,
                    DocModeExtension(pageModeProvider),
                    linkedCardExtension,
                ]
                editor.doc = editorDoc

                if (readonly) {
                    editor.setAttribute('readonly', 'true')
                }

                containerRef.current.innerHTML = ''
                containerRef.current.appendChild(editor)

                setTimeout(() => {
                    patchImageDragOption(editor)
                }, 100)

                if (!readonly) {
                    try {
                        const hasContent = checkSnapshotHasContent(snapshot)
                        if (!hasContent) {
                            Utils.log('BlockSuiteEditor: Document is empty, attempting to auto-focus first block')
                            
                            const blocks = editorDoc.getBlocks()
                            let targetBlockId = ''

                            const firstParagraph = blocks.find((b) => b.flavour === 'affine:paragraph')
                            if (firstParagraph) {
                                targetBlockId = firstParagraph.id
                            }

                            if (!targetBlockId && blocks.length > 0) {
                                const paragraphs = blocks.filter((b) => b.flavour === 'affine:paragraph')
                                if (paragraphs.length > 0) {
                                    targetBlockId = paragraphs[0].id
                                }
                            }

                            if (targetBlockId && editor.std) {
                                Utils.log(`BlockSuiteEditor: Focusing block ${targetBlockId}`)
                                
                                setTimeout(() => {
                                    try {
                                        const selection = editor.std.selection.create('text', {
                                            from: {
                                                blockId: targetBlockId,
                                                index: 0,
                                                length: 0,
                                            },
                                            to: null,
                                        })
                                        
                                        editor.std.selection.set([selection])
                                        
                                        if (editor.std.event && editor.host) {
                                            editor.host.focus()
                                        }
                                        
                                        if (containerRef.current) {
                                            const editableElement = containerRef.current.querySelector('[contenteditable="true"]') as HTMLElement
                                            if (editableElement) {
                                                editableElement.focus()
                                            }
                                        }
                                    } catch (err) {
                                        Utils.logError(`BlockSuiteEditor: Delayed focus failed: ${err}`)
                                    }
                                }, 100)
                            } else {
                                Utils.log('BlockSuiteEditor: Could not find suitable block to focus')
                            }
                        }
                    } catch (e) {
                        Utils.logError(`BlockSuiteEditor: Auto-focus failed: ${e}`)
                    }
                }

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

    useEffect(() => {
        const handleSelectionChange = () => {
            requestAnimationFrame(() => {
                const selection = document.getSelection()
                if (!selection || selection.rangeCount === 0) {
                    return
                }

                if (!containerRef.current || !containerRef.current.contains(selection.anchorNode)) {
                    return
                }

                const range = selection.getRangeAt(0)
                const rect = range.getBoundingClientRect()

                let scrollParent = containerRef.current.parentElement
                while (scrollParent) {
                    const style = window.getComputedStyle(scrollParent)
                    const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll' || scrollParent.classList.contains('dialog')

                    if (isScrollable) {
                        break
                    }
                    scrollParent = scrollParent.parentElement
                }

                if (scrollParent) {
                    const parentRect = scrollParent.getBoundingClientRect()
                    const bottomPadding = 40

                    if (rect.bottom > parentRect.bottom - bottomPadding) {
                        const diff = rect.bottom - (parentRect.bottom - bottomPadding)
                        scrollParent.scrollTop += diff
                    }
                }
            })
        }

        document.addEventListener('selectionchange', handleSelectionChange)
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange)
        }
    }, [containerMounted])

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
