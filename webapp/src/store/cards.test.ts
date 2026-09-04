// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TestBlockFactory} from '../test/testBlockFactory'

import {
    getCurrentViewCardsSortedFilteredAndGroupedWithoutLimit,
    getCurrentBoardViewCardsSortedFilteredAndGroupedWithoutLimit,
    getCurrentBoardSubCardsByParent,
    getCurrentViewCardsWithSubCards,
    flattenWithSubCards,
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

    // FR-020, FR-021. 하위 카드는 뷰가 가진 카드 순서를 따라야 한다. 스토어에
    // 담긴 순서로 그리면 순서를 바꿔도 새로고침하면 되돌아간다.
    test('sub cards follow the view card order', () => {
        const {state, parentCard} = setupState()

        const first = {...state.cards.cards['sub-card'], id: 'sub-a', title: 'Sub A'}
        const second = {...state.cards.cards['sub-card'], id: 'sub-b', title: 'Sub B'}

        const view = state.views.views[state.views.current]
        const orderedView = {
            ...view,
            fields: {...view.fields, cardOrder: [parentCard.id, 'sub-b', 'sub-a']},
        }

        // 스토어에는 a, b 순으로 담고 뷰 순서는 b, a 로 둔다.
        const ordered = {
            ...state,
            cards: {cards: {[parentCard.id]: parentCard, 'sub-a': first, 'sub-b': second}},
            views: {...state.views, views: {[orderedView.id]: orderedView}},
        }

        const byParent = getCurrentBoardSubCardsByParent(ordered as unknown as RootState)

        expect(byParent[parentCard.id].map((card) => card.id)).toEqual(['sub-b', 'sub-a'])
    })

    // CSV 내보내기가 최상위 카드만 받아서 OKR 보드의 Key Result와 Task가 통째로
    // 빠졌다. 표는 하위 카드를 부모 밑에 따로 그리는데(별도 셀렉터), 내보내기는
    // 그 갈래를 갖고 있지 않았다.
    describe('하위 카드까지 펼친 목록', () => {
        // 3단계 트리를 만든다 — Objective → Key Result → Task.
        const setupLadder = () => {
            const {state, parentCard} = setupState()

            const keyResult = {
                ...state.cards.cards['sub-card'],
                id: 'key-result',
                title: 'Key result',
                fields: {...state.cards.cards['sub-card'].fields, parentCardId: parentCard.id},
            }
            const task = {
                ...state.cards.cards['sub-card'],
                id: 'task',
                title: 'Task',
                fields: {...state.cards.cards['sub-card'].fields, parentCardId: 'key-result'},
            }

            const withLadder = {
                ...state,
                cards: {cards: {[parentCard.id]: parentCard, 'key-result': keyResult, task}},
            }

            return {state: withLadder, parentCard}
        }

        test('여러 단계 하위 카드가 부모 바로 뒤에 깊이 우선으로 붙는다', () => {
            const {state, parentCard} = setupLadder()

            const result = getCurrentViewCardsWithSubCards(state as unknown as RootState)

            expect(result.map((card) => card.id)).toEqual([parentCard.id, 'key-result', 'task'])
        })

        test('형제는 뷰의 카드 순서를 따른다', () => {
            const {state, parentCard} = setupLadder()

            const second = {...state.cards.cards['key-result'], id: 'key-result-2', title: 'Key result 2'}
            const view = state.views.views[state.views.current]
            const ordered = {
                ...state,
                cards: {cards: {...state.cards.cards, 'key-result-2': second}},
                views: {
                    ...state.views,
                    views: {
                        [view.id]: {
                            ...view,
                            fields: {...view.fields, cardOrder: [parentCard.id, 'key-result-2', 'key-result']},
                        },
                    },
                },
            }

            const result = getCurrentViewCardsWithSubCards(ordered as unknown as RootState)

            expect(result.map((card) => card.id)).toEqual([parentCard.id, 'key-result-2', 'key-result', 'task'])
        })

        // 표도 부모 행이 없으면 그 밑을 그리지 않는다. 내보내기는 "표를 전부 펼친
        // 모습"이어야 하므로 같은 규칙을 따른다.
        test('검색에 걸러진 부모의 하위 카드는 함께 빠진다', () => {
            const {state} = setupLadder()
            const searched = {...state, searchText: {value: 'no such card'}}

            const result = getCurrentViewCardsWithSubCards(searched as unknown as RootState)

            expect(result).toEqual([])
        })

        // 부모를 거슬러 올라가면 자기 자신이 나오는 자료는 셀렉터가 만들지 않지만,
        // 손상된 데이터가 그런 지도를 넘겨도 내보내기가 멈춰서는 안 된다.
        test('부모 관계가 순환해도 카드를 한 번씩만 낸다', () => {
            const a = {id: 'a', fields: {}} as never
            const b = {id: 'b', fields: {}} as never

            const result = flattenWithSubCards([a], {a: [b], b: [a]})

            expect(result.map((card) => (card as {id: string}).id)).toEqual(['a', 'b'])
        })
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
