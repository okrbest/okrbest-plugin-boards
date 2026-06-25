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

    test('parent-card selector keeps subcards excluded', () => {
        const {state, parentCard} = setupState()

        const result = getCurrentViewCardsSortedFilteredAndGroupedWithoutLimit(state as unknown as RootState)

        expect(result.map((card) => card.id)).toEqual([parentCard.id])
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
