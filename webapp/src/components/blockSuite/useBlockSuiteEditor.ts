// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useState, useEffect, useRef, useCallback} from 'react'
import type {DocSnapshot} from '@blocksuite/store'

import {Block} from '../../blocks/block'
import {BlockPatch} from '../../blocks/block'
import {Card} from '../../blocks/card'
import {Utils} from '../../utils'
import {extractTextFromSnapshot, extractBadgesFromSnapshot, formatDiffSummary} from '../../utils/blockSuiteUtils'
import {markCardModified, addCard} from '../../store/cards'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {getCard} from '../../store/cards'
import octoClient from '../../octoClient'

import blockSuiteApi from './blockSuiteApi'
import {createEmptyDocSnapshot} from './emptyDocSnapshot'
import {prepareSnapshotForSave, restoreSnapshotBlobMappings} from './focalboardBlobSource'

const AUTO_SAVE_DELAY_MS = 2000
const ENABLE_API_SYNC = true

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface UseBlockSuiteEditorProps {
    card: Card
    contents: Block[]
    readonly: boolean
}

interface UseBlockSuiteEditorReturn {
    snapshot: DocSnapshot | null
    loading: boolean
    error: Error | null
    saveStatus: SaveStatus
    saveSnapshot: (snapshot: DocSnapshot) => Promise<void>
    scheduleSave: (snapshot: DocSnapshot) => void
}

export function useBlockSuiteEditor(props: UseBlockSuiteEditorProps): UseBlockSuiteEditorReturn {
    const {card, contents, readonly} = props
    const cardId = card.id
    const dispatch = useAppDispatch()
    const currentCard = useAppSelector(getCard(cardId))

    const [snapshot, setSnapshot] = useState<DocSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

    const initializedRef = useRef(false)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingSnapshotRef = useRef<DocSnapshot | null>(null)
    const savingRef = useRef(false)
    const initialTextRef = useRef<string>('')
    const currentCardRef = useRef(currentCard)
    currentCardRef.current = currentCard

    // 배지 정보 업데이트 (Redux + 서버 저장)
    const updateBadges = useCallback((docSnapshot: DocSnapshot, persist: boolean) => {
        try {
            const badges = extractBadgesFromSnapshot(docSnapshot)
            const cardData = currentCardRef.current
            if (!cardData) return

            const existing = cardData.fields.blockSuiteBadges
            const changed = !existing ||
                existing.description !== badges.description ||
                existing.checkboxTotal !== badges.checkboxTotal ||
                existing.checkboxChecked !== badges.checkboxChecked

            if (!changed) return

            // Redux store 업데이트
            dispatch(addCard({
                ...cardData,
                fields: {
                    ...cardData.fields,
                    blockSuiteBadges: badges,
                },
            }))

            // 서버에 카드 필드 저장
            if (persist) {
                const blockPatch: BlockPatch = {
                    updatedFields: {blockSuiteBadges: badges},
                }
                octoClient.patchBlock(cardData.boardId, cardData.id, blockPatch).catch((err) => {
                    Utils.logError(`Failed to persist badge info: ${err}`)
                })
            }
        } catch (err) {
            Utils.logError(`Failed to extract badges: ${err}`)
        }
    }, [dispatch])

    const saveSnapshot = useCallback(async (snapshotToSave: DocSnapshot) => {
        if (readonly || !ENABLE_API_SYNC) {
            return
        }

        if (savingRef.current) {
            pendingSnapshotRef.current = snapshotToSave
            return
        }

        savingRef.current = true
        setSaveStatus('saving')

        try {
            const preparedSnapshot = prepareSnapshotForSave(snapshotToSave, card.boardId)
            const blobMapSize = (preparedSnapshot as {meta?: {blobMap?: Record<string, string>}}).meta?.blobMap
            Utils.log(`BlockSuite saving snapshot, blobMap entries: ${blobMapSize ? Object.keys(blobMapSize).length : 0}`)

            // Extract plain text for search and diff
            const currentText = extractTextFromSnapshot(snapshotToSave)
            const diffSummary = formatDiffSummary(initialTextRef.current, currentText)
            Utils.log(`BlockSuite diff summary: ${diffSummary.substring(0, 100)}...`)

            await blockSuiteApi.saveDocContent(cardId, preparedSnapshot, currentText, diffSummary)
            Utils.log(`BlockSuite snapshot saved for card: ${cardId}`)
            setSaveStatus('saved')

            // 배지 정보 업데이트 (저장 시 서버에도 반영)
            updateBadges(snapshotToSave, true)

            // 저장 후 초기 텍스트 업데이트
            initialTextRef.current = currentText

            setTimeout(() => {
                setSaveStatus((current) => (current === 'saved' ? 'idle' : current))
            }, 3000)

            if (pendingSnapshotRef.current) {
                const pending = pendingSnapshotRef.current
                pendingSnapshotRef.current = null
                setTimeout(() => saveSnapshot(pending), 100)
            }
        } catch (err) {
            Utils.logError(`BlockSuite save error: ${err}`)
            setSaveStatus('error')
        } finally {
            savingRef.current = false
        }
    }, [cardId, card.boardId, readonly, updateBadges])

    const scheduleSave = useCallback((snapshotToSave: DocSnapshot) => {
        if (readonly || !ENABLE_API_SYNC) {
            return
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }

        setSaveStatus('pending')
        dispatch(markCardModified(cardId))
        saveTimeoutRef.current = setTimeout(() => {
            saveSnapshot(snapshotToSave)
            saveTimeoutRef.current = null
        }, AUTO_SAVE_DELAY_MS)
    }, [readonly, saveSnapshot, dispatch, cardId])

    useEffect(() => {
        if (initializedRef.current) {
            return
        }
        initializedRef.current = true

        async function initializeSnapshot() {
            setLoading(true)
            setError(null)

            Utils.log(`useBlockSuiteEditor: Initializing for card ${cardId}, contents=${contents.length}`)

            try {
                let loadedSnapshot: DocSnapshot | null = null

                if (ENABLE_API_SYNC) {
                    Utils.log('useBlockSuiteEditor: Checking for existing doc...')
                    const docInfo = await blockSuiteApi.getDocInfo(cardId)
                    Utils.log(`useBlockSuiteEditor: docInfo=${docInfo ? 'found' : 'not found'}`)

                    if (docInfo) {
                        loadedSnapshot = await blockSuiteApi.getDocContent(cardId)
                        Utils.log(`BlockSuite snapshot loaded for card: ${cardId}`)
                        Utils.log(`useBlockSuiteEditor: Loaded snapshot type=${loadedSnapshot?.type}`)

                        if (loadedSnapshot) {
                            restoreSnapshotBlobMappings(loadedSnapshot, card.boardId)
                            // 초기 텍스트 저장 (diff 계산용)
                            initialTextRef.current = extractTextFromSnapshot(loadedSnapshot)
                        }
                    }
                }

                if (!loadedSnapshot) {
                    if (contents.length > 0) {
                        Utils.logWarn(`Card ${cardId} has ${contents.length} legacy content blocks but no BlockSuite document. Creating empty document.`)
                    }
                    loadedSnapshot = createEmptyDocSnapshot(card)
                    Utils.log('Created empty DocSnapshot')
                    // 빈 문서 텍스트 초기화
                    initialTextRef.current = extractTextFromSnapshot(loadedSnapshot)
                }

                // 스냅샷 로드 시 배지 정보 업데이트 (서버에도 저장하여 칸반 보드에서 표시)
                updateBadges(loadedSnapshot, true)

                Utils.log(`useBlockSuiteEditor: Setting snapshot, type=${loadedSnapshot?.type}`)
                setSnapshot(loadedSnapshot)
            } catch (err) {
                Utils.logError(`BlockSuite init error: ${err}`)
                console.error('useBlockSuiteEditor error details:', err)
                setError(err instanceof Error ? err : new Error(String(err)))
            } finally {
                setLoading(false)
                Utils.log('useBlockSuiteEditor: Loading complete')
            }
        }

        initializeSnapshot()

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [cardId, card, contents, readonly])

    return {
        snapshot,
        loading,
        error,
        saveStatus,
        saveSnapshot,
        scheduleSave,
    }
}

export default useBlockSuiteEditor
