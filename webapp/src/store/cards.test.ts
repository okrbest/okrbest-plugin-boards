// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TestBlockFactory} from '../test/testBlockFactory'

import {
    getCurrentViewCardsSortedFilteredAndGroupedWithoutLimit,
    getCurrentBoardViewCardsSortedFilteredAndGroupedWithoutLimit,
} from './cards'
import {RootState} from './index'

describe('store/cards selectors', () => {
    const setupState = (searchText = '') => {
        const board = TestBlockFactory.createBoard()
        const activeView = TestBlockFactory.createBoardView(board)
        activeView.fields.viewType = 'board'

        const parentCard = TestBlockFactory.createCard(board)
        parentCard.id = 'parent-card'
        parentCard.title = 'Parent card'

        const subCard = TestBlockFactory.createCard(board)
        subCard.id = 'sub-card'
        subCard.title = 'Sub card'
        subCard.fields.parentCardId = parentCard.id

        const state = {
            boards: {
                current: board.id,
                boards: {
                    [board.id]: board,
                },
            },
            cards: {
                cards: {
                    [parentCard.id]: parentCard,
                    [subCard.id]: subCard,
                },
            },
            comments: {
                comments: {},
                commentsByCard: {},
            },
            views: {
                views: {
                    [activeView.id]: activeView,
                },
                current: activeView.id,
            },
            searchText: {
                value: searchText,
            },
            users: {
                boardUsers: {},
            },
        }

        return {state, parentCard, subCard}
    }

    // FR-028. Card search is a client side pass over the cards already in the
    // store; the server drops the ones a rule hides before the client ever sees
    // them. This asserts search never reaches past the store to find one.
    test('search only ever returns cards the store holds', () => {
        const {state, parentCard} = setupState('Parent')

        const result = getCurrentBoardViewCardsSortedFilteredAndGroupedWithoutLimit(state as unknown as RootState)

        expect(result.map((card) => card.id)).toEqual([parentCard.id])

        const withoutParent = {
            ...state,
            cards: {cards: {[state.cards.cards['sub-card'].id]: state.cards.cards['sub-card']}},
        }

        const filtered = getCurrentBoardViewCardsSortedFilteredAndGroupedWithoutLimit(withoutParent as unknown as RootState)

        expect(filtered.map((card) => card.id)).not.toContain(parentCard.id)
    })

    test('parent-card selector keeps subcards excluded', () => {
        const {state, parentCard} = setupState()

        const result = getCurrentViewCardsSortedFilteredAndGroupedWithoutLimit(state as unknown as RootState)

        expect(result.map((card) => card.id)).toEqual([parentCard.id])
    })

    // 부모가 삭제되면 자식은 parentCardId가 남은 채 고아가 된다. 최상위에서도
    // 빼고 부모 행 밑에도 못 그리면 표 뷰에서 완전히 사라지므로, 부모를 찾을 수
    // 없는 카드는 최상위로 되돌린다.
    test('parent-card selector treats orphans as top level', () => {
        const {state, parentCard, subCard} = setupState()

        const orphan = {
            ...subCard,
            id: 'orphan-card',
            title: 'Orphan card',
            fields: {...subCard.fields, parentCardId: 'deleted-card'},
        }

        const withOrphan = {
            ...state,
            cards: {cards: {...state.cards.cards, [orphan.id]: orphan}},
        }

        const result = getCurrentViewCardsSortedFilteredAndGroupedWithoutLimit(withOrphan as unknown as RootState)

        expect(result.map((card) => card.id).sort()).toEqual([orphan.id, parentCard.id].sort())
        expect(result.map((card) => card.id)).not.toContain(subCard.id)
    })

    test('kanban selector includes subcards and applies search text', () => {
        const {state, parentCard, subCard} = setupState()

        const result = getCurrentBoardViewCardsSortedFilteredAndGroupedWithoutLimit(state as unknown as RootState)
        expect(result.map((card) => card.id).sort()).toEqual([parentCard.id, subCard.id].sort())

        const {state: searchedState} = setupState('Sub card')
        const searchedResult = getCurrentBoardViewCardsSortedFilteredAndGroupedWithoutLimit(searchedState as unknown as RootState)
        expect(searchedResult.map((card) => card.id)).toEqual([subCard.id])
    })
})
