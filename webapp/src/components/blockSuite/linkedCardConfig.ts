// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ConfigExtension} from '@blocksuite/block-std'
import type {EditorHost} from '@blocksuite/block-std'
import type {RootBlockConfig} from '@blocksuite/blocks'
import type {AffineInlineEditor} from '@blocksuite/affine-components/rich-text'
import {LinkedDocIcon, NewDocIcon} from '@blocksuite/affine-components/icons'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Utils} from '../../utils'

type LinkedMenuGroup = {
    name: string
    items: LinkedMenuItem[]
    styles?: string
    maxDisplay?: number
    overflowText?: string
}

type LinkedMenuItem = {
    key: string
    name: string
    icon: typeof LinkedDocIcon
    action: () => Promise<void> | void
}

type GetCardsFunction = () => Card[]
type GetBoardsFunction = () => {[key: string]: Board}
type GetViewsFunction = () => {[key: string]: BoardView}
type GetCurrentCardIdFunction = () => string | undefined
type OnCardSelectFunction = (cardId: string) => void

/**
 * Insert a hyperlink at the current cursor position.
 * This is different from insertLinkedNode which creates a BlockSuite doc reference.
 */
function insertHyperlink(
    inlineEditor: AffineInlineEditor,
    text: string,
    url: string,
): void {
    if (!inlineEditor) return
    const inlineRange = inlineEditor.getInlineRange()
    if (!inlineRange) return

    // Insert text with link attribute
    inlineEditor.insertText(inlineRange, text, {link: url})

    // Set cursor after the inserted text
    inlineEditor.setInlineRange({
        index: inlineRange.index + text.length,
        length: 0,
    })
}

function createCardMenuItems(
    cards: Card[],
    boards: {[key: string]: Board},
    views: {[key: string]: BoardView},
    query: string,
    currentCardId: string | undefined,
    teamId: string,
    viewId: string,
    currentBoardId: string,
    inlineEditor: AffineInlineEditor,
    abort: () => void,
    onCardSelect?: OnCardSelectFunction,
): LinkedMenuItem[] {
    const filteredCards = cards.filter((card) => {
        if (card.id === currentCardId) return false
        if (!query) return true
        const cardTitle = card.title.toLowerCase()
        const boardName = boards[card.boardId]?.title?.toLowerCase() || ''
        return cardTitle.includes(query.toLowerCase()) || boardName.includes(query.toLowerCase())
    })

    const getDefaultViewId = (boardId: string): string | undefined => {
        const boardViews = Object.values(views).filter((v) => v.boardId === boardId)
        return boardViews[0]?.id
    }

    return filteredCards.map((card) => {
        const board = boards[card.boardId]
        const boardName = board?.title || '알 수 없는 보드'
        const isCurrentBoard = card.boardId === currentBoardId
        const displayName = isCurrentBoard
            ? (card.title || '제목 없음')
            : `${card.title || '제목 없음'} (${boardName})`

        return {
            key: card.id,
            name: displayName,
            icon: LinkedDocIcon,
            action: () => {
                abort()

                const targetViewId = isCurrentBoard ? viewId : (getDefaultViewId(card.boardId) || viewId)
                const cardUrl = `${Utils.getFrontendBaseURL(true)}/team/${teamId}/${card.boardId}/${targetViewId}/${card.id}`
                const linkText = `📄 ${card.title || '제목 없음'}`
                insertHyperlink(inlineEditor, linkText, cardUrl)

                onCardSelect?.(card.id)
            },
        }
    })
}

function createNewCardMenuItem(
    query: string,
    teamId: string,
    viewId: string,
    inlineEditor: AffineInlineEditor,
    abort: () => void,
    onCreateCard?: (title: string) => Promise<Card | undefined>,
): LinkedMenuItem {
    const cardName = query || '새 카드'
    return {
        key: 'new-card',
        name: `"${cardName}" 카드 만들기`,
        icon: NewDocIcon,
        action: async () => {
            if (!onCreateCard) {
                Utils.log('onCreateCard not provided')
                return
            }

            abort()

            const newCard = await onCreateCard(cardName)
            if (newCard) {
                const cardUrl = `${Utils.getFrontendBaseURL(true)}/team/${teamId}/${newCard.boardId}/${viewId}/${newCard.id}`
                const linkText = `📄 ${newCard.title || cardName}`
                insertHyperlink(inlineEditor, linkText, cardUrl)
            }
        },
    }
}

export interface LinkedCardConfigOptions {
    getCards: GetCardsFunction
    getBoards: GetBoardsFunction
    getViews: GetViewsFunction
    getCurrentCardId: GetCurrentCardIdFunction
    teamId: string
    viewId: string
    onCardSelect?: OnCardSelectFunction
    onCreateCard?: (title: string) => Promise<Card | undefined>
    enableNewCard?: boolean
}

export function createLinkedCardConfig(options: LinkedCardConfigOptions): RootBlockConfig['linkedWidget'] {
    const {getCards, getBoards, getViews, getCurrentCardId, teamId, viewId, onCardSelect, onCreateCard, enableNewCard = false} = options

    return {
        triggerKeys: ['@', '[[', '【【'],
        convertTriggerKey: true,
        ignoreBlockTypes: [],
        getMenus: async (
            query: string,
            abort: () => void,
            _editorHost: EditorHost,
            inlineEditor: AffineInlineEditor,
        ): Promise<LinkedMenuGroup[]> => {
            const cards = getCards()
            const boards = getBoards()
            const views = getViews()
            const currentCardId = getCurrentCardId()
            const currentCard = cards.find((c) => c.id === currentCardId)
            const currentBoardId = currentCard?.boardId || ''
            const cardItems = createCardMenuItems(cards, boards, views, query, currentCardId, teamId, viewId, currentBoardId, inlineEditor, abort, onCardSelect)

            const groups: LinkedMenuGroup[] = []

            if (cardItems.length > 0) {
                groups.push({
                    name: '카드 링크',
                    items: cardItems,
                    maxDisplay: 6,
                    overflowText: '더보기',
                })
            }

            if (enableNewCard && onCreateCard) {
                groups.push({
                    name: '새 카드',
                    items: [createNewCardMenuItem(query, teamId, viewId, inlineEditor, abort, onCreateCard)],
                })
            }

            if (groups.length === 0) {
                groups.push({
                    name: '카드 링크',
                    items: [{
                        key: 'no-results',
                        name: query ? `"${query}" 검색 결과 없음` : '링크할 카드가 없습니다',
                        icon: LinkedDocIcon,
                        action: () => {
                            abort()
                        },
                    }],
                })
            }

            return groups
        },
    }
}

export function createLinkedCardExtension(options: LinkedCardConfigOptions) {
    const linkedWidget = createLinkedCardConfig(options)
    return ConfigExtension('affine:page', {linkedWidget})
}
