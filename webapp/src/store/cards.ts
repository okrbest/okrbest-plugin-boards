// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import {createSlice, PayloadAction, createSelector, createAsyncThunk} from '@reduxjs/toolkit'

import {Card} from '../blocks/card'
import {IUser} from '../user'
import {Board} from '../blocks/board'
import {Block} from '../blocks/block'
import {BoardView} from '../blocks/boardView'
import {CommentBlock} from '../blocks/commentBlock'
import {Utils} from '../utils'
import {Constants} from '../constants'
import {CardFilter} from '../cardFilter'
import {default as client} from '../octoClient'

import {loadBoardData, initialReadOnlyLoad, initialLoad} from './initialLoad'
import {getCurrentBoard} from './boards'
import {getBoardUsers} from './users'
import {getLastCommentByCard} from './comments'
import {getCurrentView} from './views'
import {getSearchText} from './searchText'

import {RootState} from './index'

const EMPTY_CARDS: Card[] = []

type CardsState = {
    current: string
    limitTimestamp: number
    cards: {[key: string]: Card}
    templates: {[key: string]: Card}
    cardHiddenWarning: boolean
    modifiedCardIds: string[]
    subCardsByParent: {[parentCardId: string]: Card[]}
    subCardCountByParent: {[parentCardId: string]: number}
}

export const refreshCards = createAsyncThunk<Block[], number, {state: RootState}>(
    'refreshCards',
    async (cardLimitTimestamp: number, thunkAPI) => {
        const {cards} = thunkAPI.getState().cards
        const blocksPromises = []

        for (const card of Object.values(cards)) {
            if (card.limited && card.updateAt >= cardLimitTimestamp) {
                blocksPromises.push(client.getBlocksWithBlockID(card.id, card.boardId).then((blocks) => blocks.find((b) => b?.type === 'card')))
            }
        }
        const blocks = await Promise.all(blocksPromises)

        return blocks.filter((b: Block|undefined): boolean => Boolean(b)) as Block[]
    },
)

const limitCard = (isBoardTemplate: boolean, limitTimestamp: number, card: Card): Card => {
    if (isBoardTemplate) {
        return card
    }
    if (card.updateAt >= limitTimestamp) {
        return card
    }
    return {
        ...card,
        fields: {
            icon: card.fields.icon,
            properties: {},
            contentOrder: [],
        },
        limited: true,
    }
}

const cardsSlice = createSlice({
    name: 'cards',
    initialState: {
        current: '',
        limitTimestamp: 0,
        cards: {},
        templates: {},
        cardHiddenWarning: false,
        modifiedCardIds: [],
        subCardsByParent: {},
        subCardCountByParent: {},
    } as CardsState,
    reducers: {
        setCurrent: (state, action: PayloadAction<string>) => {
            state.current = action.payload
        },
        setLimitTimestamp: (state, action: PayloadAction<{timestamp: number, templates: {[key: string]: Board}}>) => {
            state.limitTimestamp = action.payload.timestamp
            for (const card of Object.values(state.cards)) {
                state.cards[card.id] = limitCard(Boolean(action.payload.templates[card.id]), state.limitTimestamp, card)
            }
        },
        addCard: (state, action: PayloadAction<Card>) => {
            state.cards[action.payload.id] = action.payload
        },
        showCardHiddenWarning: (state, action: PayloadAction<boolean>) => {
            state.cardHiddenWarning = action.payload
        },
        addTemplate: (state: CardsState, action: PayloadAction<Card>) => {
            state.templates[action.payload.id] = action.payload
        },
        updateCards: (state: CardsState, action: PayloadAction<Card[]>) => {
            for (const card of action.payload) {
                if (card.deleteAt !== 0) {
                    delete state.cards[card.id]
                    delete state.templates[card.id]
                } else if (card.fields.isTemplate) {
                    state.templates[card.id] = card
                } else {
                    state.cards[card.id] = card
                }
            }
        },
        markCardModified: (state, action: PayloadAction<string>) => {
            if (!state.modifiedCardIds.includes(action.payload)) {
                state.modifiedCardIds.push(action.payload)
            }
        },
        clearCardModified: (state, action: PayloadAction<string>) => {
            state.modifiedCardIds = state.modifiedCardIds.filter((id) => id !== action.payload)
        },
        setSubCards: (state, action: PayloadAction<{parentCardId: string, subCards: Card[]}>) => {
            state.subCardsByParent[action.payload.parentCardId] = action.payload.subCards

            // 메인 카드 스토어의 parentCardId도 동기화
            for (const subCard of action.payload.subCards) {
                if (state.cards[subCard.id]) {
                    state.cards[subCard.id] = {
                        ...state.cards[subCard.id],
                        fields: {
                            ...state.cards[subCard.id].fields,
                            parentCardId: action.payload.parentCardId,
                        },
                    }
                }
            }
        },
        addSubCard: (state, action: PayloadAction<{parentCardId: string, subCard: Card}>) => {
            const existing = state.subCardsByParent[action.payload.parentCardId] || []
            state.subCardsByParent[action.payload.parentCardId] = [...existing, action.payload.subCard]
            state.subCardCountByParent[action.payload.parentCardId] = (state.subCardCountByParent[action.payload.parentCardId] || 0) + 1

            // 메인 카드 스토어의 parentCardId도 동기화
            const subCard = action.payload.subCard
            if (state.cards[subCard.id]) {
                state.cards[subCard.id] = {
                    ...state.cards[subCard.id],
                    fields: {
                        ...state.cards[subCard.id].fields,
                        parentCardId: action.payload.parentCardId,
                    },
                }
            }
        },
        setSubCardCount: (state, action: PayloadAction<{parentCardId: string, count: number}>) => {
            state.subCardCountByParent[action.payload.parentCardId] = action.payload.count
        },
        clearSubCards: (state, action: PayloadAction<string>) => {
            delete state.subCardsByParent[action.payload]
            delete state.subCardCountByParent[action.payload]
        },
        removeSubCard: (state, action: PayloadAction<{parentCardId: string, cardId: string}>) => {
            const existing = state.subCardsByParent[action.payload.parentCardId] || []
            state.subCardsByParent[action.payload.parentCardId] = existing.filter((card) => card.id !== action.payload.cardId)
            const currentCount = state.subCardCountByParent[action.payload.parentCardId] || 0
            if (currentCount > 0) {
                state.subCardCountByParent[action.payload.parentCardId] = currentCount - 1
            }

            // 메인 카드 스토어의 parentCardId 제거
            if (state.cards[action.payload.cardId]) {
                state.cards[action.payload.cardId] = {
                    ...state.cards[action.payload.cardId],
                    fields: {
                        ...state.cards[action.payload.cardId].fields,
                        parentCardId: '',
                    },
                }
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(refreshCards.fulfilled, (state, action) => {
            for (const block of action.payload) {
                state.cards[block.id] = block as Card
            }
        })
        builder.addCase(initialReadOnlyLoad.fulfilled, (state, action) => {
            state.cards = {}
            state.templates = {}
            for (const block of action.payload.blocks) {
                if (block.type === 'card' && block.fields.isTemplate) {
                    state.templates[block.id] = block as Card
                } else if (block.type === 'card' && !block.fields.isTemplate) {
                    state.cards[block.id] = block as Card
                }
            }
        })
        builder.addCase(initialLoad.fulfilled, (state, action) => {
            state.limitTimestamp = action.payload.limits?.card_limit_timestamp || 0
        })
        builder.addCase(loadBoardData.fulfilled, (state, action) => {
            state.cards = {}
            state.templates = {}
            for (const block of action.payload.blocks) {
                if (block.type === 'card' && block.fields.isTemplate) {
                    state.templates[block.id] = block as Card
                } else if (block.type === 'card' && !block.fields.isTemplate) {
                    state.cards[block.id] = block as Card
                }
            }
        })
    },
})

export const {updateCards, addCard, addTemplate, setCurrent, setLimitTimestamp, showCardHiddenWarning, markCardModified, clearCardModified, setSubCards, addSubCard, setSubCardCount, clearSubCards, removeSubCard} = cardsSlice.actions
export const {reducer} = cardsSlice

export const getCards = (state: RootState): {[key: string]: Card} => state.cards.cards

export const getCardIsDirty = (cardId: string) => (state: RootState): boolean => state.cards.modifiedCardIds.includes(cardId)

export const getSortedCards = createSelector(
    getCards,
    (cards) => {
        return Object.values(cards).sort((a, b) => a.title.localeCompare(b.title)) as Card[]
    },
)

export const getTemplates = (state: RootState): {[key: string]: Card} => state.cards.templates

export const getSortedTemplates = createSelector(
    getTemplates,
    (templates) => {
        return Object.values(templates).sort((a, b) => a.title.localeCompare(b.title)) as Card[]
    },
)

export function getCard(cardId: string): (state: RootState) => Card|undefined {
    return (state: RootState): Card|undefined => {
        return getCards(state)[cardId] || getTemplates(state)[cardId]
    }
}

// boards 슬라이스가 없는 상태에서도 안전하게 읽는다. 카드 목록만 필요한 화면의
// 테스트 스토어는 보드를 담지 않을 수 있다.
const getCurrentBoardIdSafe = (state: RootState): string | undefined => state.boards?.current

export const getCurrentBoardCards = createSelector(
    getCurrentBoardIdSafe,
    getCards,
    (boardId, cards) => {
        return Object.values(cards).filter((c) => c.boardId === boardId) as Card[]
    },
)

export const getCurrentBoardParentCards = createSelector(
    getCurrentBoardCards,
    (cards) => {
        // fields.parentCardId가 없는 카드만 최상위 카드
        // parentId !== boardId 체크는 사용하지 않음 (템플릿에서 복제된 카드의 parentId가 boardId와 다를 수 있음)
        //
        // 부모를 찾을 수 없는 카드(고아)도 최상위로 본다. 부모가 삭제되면 자식은
        // parentCardId가 남은 채로 살아남는데, 최상위에서 빼면 부모 행이 없어
        // 하위 행으로도 못 그려져 표 뷰에서 통째로 사라진다.
        const ids = new Set(cards.map((c) => c.id))
        return cards.filter((c) => !c.fields.parentCardId || !ids.has(c.fields.parentCardId))
    },
)

// 뷰 슬라이스가 없는 상태에서도 안전하게 카드 순서만 꺼낸다. 이 셀렉터는
// 카드 목록만 필요한 화면(하위 카드 목록 등)에서도 쓰이고, 그런 곳의 스토어는
// 뷰를 담지 않을 수 있다.
const getCurrentViewCardOrder = (state: RootState): readonly string[] | undefined => {
    if (!state.views) {
        return undefined
    }
    return getCurrentView(state)?.fields.cardOrder
}

export const getCurrentBoardSubCardsByParent = createSelector(
    getCurrentBoardCards,
    getCurrentViewCardOrder,
    (cards, cardOrder) => {
        const map: {[parentCardId: string]: Card[]} = {}
        for (const card of cards) {
            // fields.parentCardId가 있는 카드만 하위 카드로 판단
            const parentCardId = card.fields.parentCardId
            if (parentCardId) {
                if (!map[parentCardId]) {
                    map[parentCardId] = []
                }
                map[parentCardId].push(card)
            }
        }

        // 하위 카드도 뷰의 카드 순서를 따른다. 스토어에 담긴 순서로 그리면 순서를
        // 바꿔도 저장된 순서와 어긋나 새로고침하면 되돌아간다 (FR-020, FR-021).
        if (cardOrder?.length) {
            const rank = new Map(cardOrder.map((id, index) => [id, index]))

            // 순서 목록에 없는 카드는 뒤로 보내되 서로의 상대 순서는 유지한다.
            const rankOf = (card: Card) => rank.get(card.id) ?? Number.MAX_SAFE_INTEGER
            for (const siblings of Object.values(map)) {
                siblings.sort((a, b) => rankOf(a) - rankOf(b))
            }
        }

        return map
    },
)

export const getCurrentBoardSubCardCountByParent = createSelector(
    getCurrentBoardSubCardsByParent,
    (subCardsByParent) => {
        const map: {[parentCardId: string]: number} = {}
        for (const [parentId, subCards] of Object.entries(subCardsByParent)) {
            map[parentId] = subCards.length
        }
        return map
    },
)

export const getCurrentBoardTemplates = createSelector(
    (state: RootState) => state.boards.current,
    getTemplates,
    (boardId, templates) => {
        return Object.values(templates).filter((c) => c.boardId === boardId) as Card[]
    },
)

function titleOrCreatedOrder(cardA: Card, cardB: Card) {
    const aValue = cardA.title
    const bValue = cardB.title

    if (aValue && bValue) {
        return aValue.localeCompare(bValue)
    }

    // Always put untitled cards at the bottom
    if (aValue && !bValue) {
        return -1
    }
    if (bValue && !aValue) {
        return 1
    }

    // If both cards are untitled, use the create date
    return cardA.createAt - cardB.createAt
}

function manualOrder(activeView: BoardView, cardA: Card, cardB: Card) {
    const indexA = activeView.fields.cardOrder.indexOf(cardA.id)
    const indexB = activeView.fields.cardOrder.indexOf(cardB.id)

    if (indexA < 0 && indexB < 0) {
        return titleOrCreatedOrder(cardA, cardB)
    } else if (indexA < 0 && indexB >= 0) {
        // If cardA's order is not defined, put it at the end
        return 1
    }
    return indexA - indexB
}

function sortCards(cards: Card[], lastCommentByCard: {[key: string]: CommentBlock}, board: Board, activeView: BoardView, usersById: {[key: string]: IUser}): Card[] {
    if (!activeView) {
        return cards
    }
    const {sortOptions} = activeView.fields

    if (sortOptions.length < 1) {
        Utils.log('Manual sort')
        return cards.sort((a, b) => manualOrder(activeView, a, b))
    }

    let sortedCards = cards
    for (const sortOption of sortOptions) {
        if (sortOption.propertyId === Constants.titleColumnId) {
            Utils.log('Sort by title')
            sortedCards = sortedCards.sort((a, b) => {
                const result = titleOrCreatedOrder(a, b)
                return sortOption.reversed ? -result : result
            })
        } else {
            const sortPropertyId = sortOption.propertyId
            const template = board.cardProperties.find((o) => o.id === sortPropertyId)
            if (!template) {
                Utils.logError(`Missing template for property id: ${sortPropertyId}, skipping this sort option`)
                continue
            }
            Utils.log(`Sort by property: ${template?.name}`)
            sortedCards = sortedCards.sort((a, b) => {
                // Always put cards with no titles at the bottom, regardless of sort
                let aValue = a.fields.properties[sortPropertyId] || ''
                let bValue = b.fields.properties[sortPropertyId] || ''

                if (template.type === 'createdBy') {
                    aValue = usersById[a.createdBy]?.username || ''
                    bValue = usersById[b.createdBy]?.username || ''
                } else if (template.type === 'updatedBy') {
                    aValue = usersById[a.modifiedBy]?.username || ''
                    bValue = usersById[b.modifiedBy]?.username || ''
                } else if (template.type === 'date') {
                    aValue = (aValue === '') ? '' : JSON.parse(aValue as string).from
                    bValue = (bValue === '') ? '' : JSON.parse(bValue as string).from
                }

                let result = 0
                if (template.type === 'number' || template.type === 'date') {
                    // Always put empty values at the bottom
                    if (aValue && !bValue) {
                        return -1
                    }
                    if (bValue && !aValue) {
                        return 1
                    }
                    if (!aValue && !bValue) {
                        return titleOrCreatedOrder(a, b)
                    }

                    result = Number(aValue) - Number(bValue)
                } else if (template.type === 'createdTime') {
                    result = a.createAt - b.createAt
                } else if (template.type === 'updatedTime') {
                    const aUpdateAt = Math.max(a.updateAt, lastCommentByCard[a.id]?.updateAt || 0)
                    const bUpdateAt = Math.max(b.updateAt, lastCommentByCard[b.id]?.updateAt || 0)
                    result = aUpdateAt - bUpdateAt
                } else {
                    // Text-based sort

                    if (aValue.length > 0 && bValue.length <= 0) {
                        return -1
                    }
                    if (bValue.length > 0 && aValue.length <= 0) {
                        return 1
                    }
                    if (aValue.length <= 0 && bValue.length <= 0) {
                        return titleOrCreatedOrder(a, b)
                    }

                    if (template.type === 'select' || template.type === 'multiSelect') {
                        aValue = template.options.find((o) => o.id === (Array.isArray(aValue) ? aValue[0] : aValue))?.value || ''
                        bValue = template.options.find((o) => o.id === (Array.isArray(bValue) ? bValue[0] : bValue))?.value || ''
                    }

                    // card 타입: JSON 문자열에서 카드 제목 추출하여 정렬
                    if (template.type === 'card') {
                        const extractCardTitles = (value: string | string[]): string => {
                            if (typeof value !== 'string') {
                                return ''
                            }
                            try {
                                if (value.startsWith('{')) {
                                    const parsed = JSON.parse(value)
                                    return (parsed.cards || []).map((c: {title?: string}) => c.title || '').join(', ')
                                }
                            } catch {
                                // JSON 파싱 실패 시 빈 문자열 반환
                            }
                            return ''
                        }
                        aValue = extractCardTitles(aValue)
                        bValue = extractCardTitles(bValue)
                    }

                    if (template.type === 'multiPerson') {
                        if (Array.isArray(aValue)) {
                            if (aValue.length !== 0 && Object.keys(usersById).length > 0) {
                                aValue = aValue.map((id) => usersById[id]?.username || '').toString()
                            } else {
                                // usersById가 비어있으면 user ID로 정렬 (이전 동작 유지)
                                aValue = aValue.toString()
                            }
                        }

                        if (Array.isArray(bValue)) {
                            if (bValue.length !== 0 && Object.keys(usersById).length > 0) {
                                bValue = bValue.map((id) => usersById[id]?.username || '').toString()
                            } else {
                                // usersById가 비어있으면 user ID로 정렬 (이전 동작 유지)
                                bValue = bValue.toString()
                            }
                        }
                    }

                    // 배열이 남아있을 경우 문자열로 변환 (안전 처리)
                    if (Array.isArray(aValue)) {
                        aValue = aValue.toString()
                    }
                    if (Array.isArray(bValue)) {
                        bValue = bValue.toString()
                    }

                    result = (aValue as string).localeCompare(bValue as string)
                }

                if (result === 0) {
                    // In case of "ties", use the title order
                    result = titleOrCreatedOrder(a, b)
                }

                return sortOption.reversed ? -result : result
            })
        }
    }

    return sortedCards
}

function searchFilterCards(cards: Card[], board: Board, searchTextRaw: string): Card[] {
    const searchText = searchTextRaw.toLocaleLowerCase()
    if (!searchText) {
        return cards.slice()
    }

    return cards.filter((card: Card) => {
        const searchTextInCardTitle: boolean = card.title?.toLocaleLowerCase().includes(searchText)
        if (searchTextInCardTitle) {
            return true
        }

        for (const [propertyId, propertyValue] of Object.entries(card.fields.properties)) {
            // Note: Property display value logic - consider extracting to a shared utility function
            // See: properties/*/property.tsx for property-specific displayValue implementations
            const propertyTemplate = board.cardProperties.find((o) => o.id === propertyId)
            if (propertyTemplate && propertyValue) {
                if (propertyTemplate.type === 'select') {
                    // Look up the value of the select option
                    const option = propertyTemplate.options.find((o) => o.id === propertyValue)
                    if (option?.value.toLowerCase().includes(searchText)) {
                        return true
                    }
                } else if (propertyTemplate.type === 'multiSelect') {
                    // Look up the value of the select option
                    const options = (Array.isArray(propertyValue) ? propertyValue : [propertyValue]).map((value) => propertyTemplate.options.find((o) => o.id === value)?.value.toLowerCase())
                    if (options.some((v) => v?.includes(searchText))) {
                        return true
                    }
                } else if (propertyTemplate.type === 'card') {
                    // card 타입: JSON에서 연결된 카드 제목 추출하여 검색
                    if (typeof propertyValue === 'string' && propertyValue.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(propertyValue)
                            const cardTitles = (parsed.cards || []).map((c: {title?: string}) => c.title || '').join(' ')
                            if (cardTitles.toLowerCase().includes(searchText)) {
                                return true
                            }
                        } catch {
                            // JSON 파싱 실패 시 기본 문자열 검색
                            if (propertyValue.toLowerCase().includes(searchText)) {
                                return true
                            }
                        }
                    } else if (typeof propertyValue === 'string' && propertyValue.toLowerCase().includes(searchText)) {
                        return true
                    }
                } else if (propertyTemplate.type !== 'date' && (propertyValue.toString()).toLowerCase().includes(searchText)) {
                    return true
                }
            }
        }

        return false
    })
}

function applyViewCardFilterSearchAndSort(cards: Card[], lastCommentByCard: {[key: string]: CommentBlock}, board: Board, view: BoardView, searchText: string, users: {[key: string]: IUser}): Card[] {
    let result = cards.filter((c) => !c.limited)
    if (view.fields.filter) {
        result = CardFilter.applyFilterGroup(view.fields.filter, board.cardProperties, result)
    }

    if (searchText) {
        result = searchFilterCards(result, board, searchText)
    }
    return sortCards(result, lastCommentByCard, board, view, users)
}

export const getCurrentViewCardsSortedFilteredAndGroupedWithoutLimit = createSelector(
    getCurrentBoardParentCards,
    getLastCommentByCard,
    getCurrentBoard,
    getCurrentView,
    getSearchText,
    getBoardUsers,
    (cards, lastCommentByCard, board, view, searchText, users) => {
        if (!view || !board || !users || !cards) {
            return EMPTY_CARDS
        }
        // 보드 전환 중 board와 view가 일치하지 않는 경우 방어
        if (view.boardId !== board.id) {
            return EMPTY_CARDS
        }
        return applyViewCardFilterSearchAndSort(cards, lastCommentByCard, board, view, searchText, users)
    },
)

export const getCurrentBoardViewCardsSortedFilteredAndGroupedWithoutLimit = createSelector(
    getCurrentBoardCards,
    getLastCommentByCard,
    getCurrentBoard,
    getCurrentView,
    getSearchText,
    getBoardUsers,
    (cards, lastCommentByCard, board, view, searchText, users) => {
        if (!view || !board || !users || !cards) {
            return EMPTY_CARDS
        }
        // 보드 전환 중 board와 view가 일치하지 않는 경우 방어
        if (view.boardId !== board.id) {
            return EMPTY_CARDS
        }
        return applyViewCardFilterSearchAndSort(cards, lastCommentByCard, board, view, searchText, users)
    },
)

export const getCurrentViewCardsSortedFilteredAndGrouped = createSelector(
    getCurrentViewCardsSortedFilteredAndGroupedWithoutLimit,
    (cards) => cards.filter((c) => !c.limited),
)

export const getCurrentBoardViewCardsSortedFilteredAndGrouped = createSelector(
    getCurrentBoardViewCardsSortedFilteredAndGroupedWithoutLimit,
    (cards) => cards.filter((c) => !c.limited),
)

// flattenWithSubCards walks a list of top level cards into the order the table
// nests them: each card followed by its descendants, depth first.
//
// seen guards against a parent chain that loops back on itself. The selectors
// cannot build one — a card in the sub-card map always has a parentCardId, and a
// top level card never does — but damaged data must not turn an export into a
// hang.
export function flattenWithSubCards(cards: Card[], subCardsByParent: {[parentCardId: string]: Card[]}): Card[] {
    const seen = new Set<string>()
    const flattened: Card[] = []

    const visit = (card: Card) => {
        if (seen.has(card.id)) {
            return
        }
        seen.add(card.id)
        flattened.push(card)

        for (const subCard of subCardsByParent[card.id] || []) {
            visit(subCard)
        }
    }

    cards.forEach(visit)
    return flattened
}

// getCurrentViewCardsWithSubCards is the view's cards including everything
// hanging under them — the table fully expanded, as one list.
//
// The table draws sub-cards as their own rows from a separate selector, so the
// list of top level cards is the whole of what CSV export used to see: every Key
// Result and Task of an OKR board was missing from the file, and only the
// Objectives came out.
//
// Sub-cards are not put through the view's filter or search. The table does not
// filter them either — a row is shown because its parent is — so following the
// same rule is what makes the export match what the screen shows.
export const getCurrentViewCardsWithSubCards = createSelector(
    getCurrentViewCardsSortedFilteredAndGrouped,
    getCurrentBoardSubCardsByParent,
    (cards, subCardsByParent) => flattenWithSubCards(cards, subCardsByParent),
)

export const getCurrentBoardHiddenCardsCount = createSelector(
    getCurrentBoardCards,
    (cards) => Object.values(cards).filter((c) => c.limited).length,
)

export const getCurrentCard = createSelector(
    (state: RootState) => state.cards.current,
    getCards,
    (current, cards) => cards[current],
)

export const getCardLimitTimestamp = (state: RootState): number => state.cards.limitTimestamp
export const getCardHiddenWarning = (state: RootState): boolean => state.cards.cardHiddenWarning

export const getSubCards = (parentCardId: string) => (state: RootState): Card[] =>
    state.cards.subCardsByParent[parentCardId] || EMPTY_CARDS

export const getSubCardCount = (parentCardId: string) => (state: RootState): number =>
    state.cards.subCardCountByParent[parentCardId] || 0
