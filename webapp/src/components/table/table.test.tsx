// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {render, screen, fireEvent} from '@testing-library/react'
import configureStore from 'redux-mock-store'
import '@testing-library/jest-dom'
import userEvents from '@testing-library/user-event'

import 'isomorphic-fetch'
import {mocked} from 'jest-mock'

import {TestBlockFactory} from '../../test/testBlockFactory'
import {FetchMock} from '../../test/fetchMock'
import {BoardView} from '../../blocks/boardView'

import {IUser} from '../../user'

import {Utils, IDType} from '../../utils'
import {Constants} from '../../constants'
import {IPropertyTemplate} from '../../blocks/board'

import {wrapDNDIntl} from '../../testUtils'

import Mutator from '../../mutator'

import Table from './table'

global.fetch = FetchMock.fn

beforeEach(() => {
    FetchMock.fn.mockReset()
})

jest.mock('../../mutator')
jest.mock('../../utils')
jest.mock('../../telemetry/telemetryClient')
const mockedMutator = mocked(Mutator, true)

describe('components/table/Table', () => {
    const board = TestBlockFactory.createBoard()
    const view = TestBlockFactory.createBoardView(board)
    view.fields.viewType = 'table'
    view.fields.groupById = undefined
    view.fields.visiblePropertyIds = ['property1', 'property2']

    const view2 = TestBlockFactory.createBoardView(board)
    view2.fields.sortOptions = []

    const card = TestBlockFactory.createCard(board)
    const cardTemplate = TestBlockFactory.createCard(board)
    cardTemplate.fields.isTemplate = true

    const state = {
        users: {
            boardUsers: {
                'user-id-1': {username: 'username_1'} as IUser,
                'user-id-2': {username: 'username_2'} as IUser,
                'user-id-3': {username: 'username_3'} as IUser,
                'user-id-4': {username: 'username_4'} as IUser,
            },
        },
        comments: {
            comments: {},
            commentsByCard: {},
        },
        contents: {
            contents: {},
            contentsByCard: {},
        },
        cards: {
            cards: {
                [card.id]: card,
            },
        },
        teams: {
            current: {id: 'team-id'},
        },
        boards: {
            current: board.id,
            boards: {
                [board.id]: board,
            },
            myBoardMemberships: {
                [board.id]: {userId: 'user_id_1', schemeAdmin: true},
            },
        },
    }

    test('should match snapshot', async () => {
        const callback = jest.fn()
        const addCard = jest.fn()

        const mockStore = configureStore([])
        const store = mockStore(state)

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card]}
                    views={[view, view2]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot without permissions', async () => {
        const callback = jest.fn()
        const addCard = jest.fn()

        const mockStore = configureStore([])
        const store = mockStore({...state, teams: {current: undefined}})

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card]}
                    views={[view, view2]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot, read-only', async () => {
        const callback = jest.fn()
        const addCard = jest.fn()

        const mockStore = configureStore([])
        const store = mockStore(state)

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card]}
                    views={[view, view2]}
                    selectedCardIds={[]}
                    readonly={true}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )

        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot with GroupBy', async () => {
        const callback = jest.fn()
        const addCard = jest.fn()

        const mockStore = configureStore([])
        const store = mockStore(state)

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={{...view, fields: {...view.fields, groupById: 'property1'}} as BoardView}
                    visibleGroups={[{option: {id: '', value: 'test', color: ''}, cards: []}]}
                    groupByProperty={{
                        id: '',
                        name: 'Property 1',
                        type: 'text',
                        options: [{id: 'property1', value: 'Property 1', color: ''}],
                    }}
                    cards={[card]}
                    views={[view, view2]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    // FR-005 and FR-006. The grouped view gained an add row per group; the two
    // entry points that existed before must be untouched by that.
    test('the ungrouped view keeps exactly the add row it always had', async () => {
        const mockStore = configureStore([])
        const store = mockStore(state)

        const {container} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card]}
                    views={[view, view2]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={jest.fn()}
                    addCard={jest.fn()}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        ))

        // One footer, the one this view has always had. The grouped view's new
        // per-group row must not leak into the ungrouped one.
        expect(container.querySelectorAll('.octo-table-footer')).toHaveLength(1)
        expect(container.textContent).not.toContain('+ New card')
        expect(container.querySelector('.octo-table-footer--indented')).toBeNull()
    })

    test('does not render group rows when group is collapsed', async () => {
        const callback = jest.fn()
        const addCard = jest.fn()
        const groupedCard = TestBlockFactory.createCard(board)
        groupedCard.title = 'collapsed-row-card'
        groupedCard.fields.properties.property1 = 'value1'

        const groupedView = {
            ...view,
            fields: {
                ...view.fields,
                groupById: 'property1',
                collapsedOptionIds: ['value1'],
            },
        } as BoardView

        const mockStore = configureStore([])
        const store = mockStore({
            ...state,
            cards: {
                cards: {
                    [groupedCard.id]: groupedCard,
                },
            },
        })

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={groupedView}
                    visibleGroups={[{option: {id: 'value1', value: 'Value 1', color: ''}, cards: [groupedCard]}]}
                    groupByProperty={{
                        id: 'property1',
                        name: 'Property 1',
                        type: 'text',
                        options: [{id: 'value1', value: 'Value 1', color: ''}],
                    }}
                    cards={[groupedCard]}
                    views={[view, view2]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )
        render(component)

        expect(screen.queryByText('collapsed-row-card')).not.toBeInTheDocument()
    })

    test('limited card in table view', async () => {
        const callback = jest.fn()
        const addCard = jest.fn()
        const boardTest = TestBlockFactory.createBoard()
        const card1 = TestBlockFactory.createCard(boardTest)
        const card2 = TestBlockFactory.createCard(boardTest)
        const mockStore = configureStore([])

        const stateTest = {
            // 021: Table이 개인 뷰 상태 키 계산에 현재 사용자를 읽는다
            users: {
                me: {id: 'user_id_1'} as IUser,
                boardUsers: {},
            },
            comments: {
                comments: {},
            },
            contents: {
                contents: {},
            },
            cards: {
                cards: {
                    [card1.id]: card1,
                    [card2.id]: card2,
                },
            },
            teams: {
                current: {id: 'team-id'},
            },
            boards: {
                current: boardTest.id,
                boards: {
                    [boardTest.id]: boardTest,
                },
                myBoardMemberships: {
                    [boardTest.id]: {userId: 'user_id_1', schemeAdmin: true},
                },
            },
        }

        const storeTest = mockStore(stateTest)
        card.limited = true

        const component = wrapDNDIntl(
            <ReduxProvider store={storeTest}>
                <Table
                    board={boardTest}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card1, card2]}
                    views={[view, view2]}
                    selectedCardIds={[]}
                    readonly={true}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                   addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={2}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )
        const {container} = render(component)
        const hiddenCardElement = await screen.findByTitle('hidden-card-count')
        expect(hiddenCardElement).toHaveTextContent('2')
        expect(container).toMatchSnapshot()
    })
})

describe('components/table/Table extended', () => {
    const state = {
        users: {
            boardUsers: {
                'user-id-1': {username: 'username_1'} as IUser,
                'user-id-2': {username: 'username_2'} as IUser,
                'user-id-3': {username: 'username_3'} as IUser,
                'user-id-4': {username: 'username_4'} as IUser,
            },
        },
        comments: {
            comments: {},
            commentsByCard: {},
        },
        contents: {
            contents: {},
            contentsByCard: {},
        },
        cards: {
            cards: {},
        },
        teams: {
            current: {id: 'team-id'},
        },
        boards: {
            current: 'board_id',
            boards: {
                board_id: {id: 'board_id'},
            },
            myBoardMemberships: {
                board_id: {userId: 'user_id_1', schemeAdmin: true},
            },
        },
        clientConfig: {
            value: {
                teammateNameDisplay: 'username',
            },
        },
    }

    test('should match snapshot with CreatedAt', async () => {
        const board = TestBlockFactory.createBoard()

        const dateCreatedId = Utils.createGuid(IDType.User)
        board.cardProperties.push({
            id: dateCreatedId,
            name: 'Date Created',
            type: 'createdTime',
            options: [],
        })

        const card1 = TestBlockFactory.createCard(board)
        card1.createAt = Date.parse('15 Jun 2021 16:22:00')

        const card2 = TestBlockFactory.createCard(board)
        card2.createAt = Date.parse('15 Jun 2021 16:22:00')

        const view = TestBlockFactory.createBoardView(board)
        view.fields.viewType = 'table'
        view.fields.groupById = undefined
        view.fields.visiblePropertyIds = ['property1', 'property2', dateCreatedId]

        const callback = jest.fn()
        const addCard = jest.fn()

        const mockStore = configureStore([])
        const store = mockStore({
            ...state,
            cards: {
                cards: {
                    [card1.id]: card1,
                    [card2.id]: card2,
                },
            },
            teams: {
                current: {id: 'team-id'},
            },
            boards: {
                current: board.id,
                boards: {
                    [board.id]: board,
                },
                myBoardMemberships: {
                    [board.id]: {userId: 'user_id_1', schemeAdmin: true},
                },
            },
        })

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card1, card2]}
                    views={[view]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot with UpdatedAt', async () => {
        const board = TestBlockFactory.createBoard()
        const dateUpdatedId = Utils.createGuid(IDType.User)
        board.cardProperties.push({
            id: dateUpdatedId,
            name: 'Date Updated',
            type: 'updatedTime',
            options: [],
        })

        const card1 = TestBlockFactory.createCard(board)
        card1.updateAt = Date.parse('20 Jun 2021 12:22:00')

        const card2 = TestBlockFactory.createCard(board)
        card2.updateAt = Date.parse('20 Jun 2021 12:22:00')

        const card2Comment = TestBlockFactory.createCard(board)
        card2Comment.parentId = card2.id
        card2Comment.type = 'comment'
        card2Comment.updateAt = Date.parse('21 Jun 2021 15:23:00')

        const card2Text = TestBlockFactory.createCard(board)
        card2Text.parentId = card2.id
        card2Text.type = 'text'
        card2Text.updateAt = Date.parse('22 Jun 2021 11:23:00')

        card2.fields.contentOrder = [card2Text.id]

        const view = TestBlockFactory.createBoardView(board)
        view.fields.viewType = 'table'
        view.fields.groupById = undefined
        view.fields.visiblePropertyIds = ['property1', 'property2', dateUpdatedId]

        const callback = jest.fn()
        const addCard = jest.fn()

        const mockStore = configureStore([])
        const store = mockStore({
            ...state,
            comments: {
                comments: {
                    [card2Comment.id]: card2Comment,
                },
                commentsByCard: {
                    [card2.id]: [card2Comment],
                },
            },
            contents: {
                contents: {
                    [card2Text.id]: card2Text,
                },
                contentsByCard: {
                    [card2.id]: [card2Text],
                },
            },
            cards: {
                cards: {
                    [card1.id]: card1,
                    [card2.id]: card2,
                },
            },
        })

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card1, card2]}
                    views={[view]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot with CreatedBy', async () => {
        const board = TestBlockFactory.createBoard()

        const createdById = Utils.createGuid(IDType.User)
        board.cardProperties.push({
            id: createdById,
            name: 'Created By',
            type: 'createdBy',
            options: [],
        })

        const card1 = TestBlockFactory.createCard(board)
        card1.createdBy = 'user-id-1'

        const card2 = TestBlockFactory.createCard(board)
        card2.createdBy = 'user-id-2'

        const view = TestBlockFactory.createBoardView(board)
        view.fields.viewType = 'table'
        view.fields.groupById = undefined
        view.fields.visiblePropertyIds = ['property1', 'property2', createdById]

        const callback = jest.fn()
        const addCard = jest.fn()

        const mockStore = configureStore([])
        const store = mockStore({
            ...state,
            cards: {
                cards: {
                    [card1.id]: card1,
                    [card2.id]: card2,
                },
            },
        })

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card1, card2]}
                    views={[view]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )

        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot with UpdatedBy', async () => {
        const board = TestBlockFactory.createBoard()

        const modifiedById = Utils.createGuid(IDType.User)
        board.cardProperties.push({
            id: modifiedById,
            name: 'Last Modified By',
            type: 'updatedBy',
            options: [],
        })

        const card1 = TestBlockFactory.createCard(board)
        card1.modifiedBy = 'user-id-1'
        card1.updateAt = Date.parse('15 Jun 2021 16:22:00')

        const card1Text = TestBlockFactory.createCard(board)
        card1Text.parentId = card1.id
        card1Text.type = 'text'
        card1Text.modifiedBy = 'user-id-4'
        card1Text.updateAt = Date.parse('16 Jun 2021 16:22:00')

        card1.fields.contentOrder = [card1Text.id]

        const card2 = TestBlockFactory.createCard(board)
        card2.modifiedBy = 'user-id-2'
        card2.updateAt = Date.parse('15 Jun 2021 16:22:00')

        const card2Comment = TestBlockFactory.createCard(board)
        card2Comment.parentId = card2.id
        card2Comment.type = 'comment'
        card2Comment.modifiedBy = 'user-id-3'
        card2.updateAt = Date.parse('16 Jun 2021 16:22:00')

        const view = TestBlockFactory.createBoardView(board)
        view.fields.viewType = 'table'
        view.fields.groupById = undefined
        view.fields.visiblePropertyIds = ['property1', 'property2', modifiedById]

        const callback = jest.fn()
        const addCard = jest.fn()

        const mockStore = configureStore([])
        const store = mockStore({
            ...state,
            comments: {
                comments: {
                    [card2Comment.id]: card2Comment,
                },
                commentsByCard: {
                    [card2.id]: [card2Comment],
                },
            },
            contents: {
                contents: {
                    [card1Text.id]: card1Text,
                },
                contentsByCard: {
                    [card1.id]: [card1Text],
                },
            },
            cards: {
                cards: {
                    [card1.id]: card1,
                    [card2.id]: card2,
                },
            },
        })

        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={view}
                    visibleGroups={[]}
                    cards={[card1, card2]}
                    views={[view]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={callback}
                    addCard={addCard}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        )

        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

     test('should delete snapshot', async () => {
         const board = TestBlockFactory.createBoard()

         const modifiedById = Utils.createGuid(IDType.User)
         board.cardProperties.push({
             id: modifiedById,
             name: 'Last Modified By',
             type: 'updatedBy',
             options: [],
         })
         const card1 = TestBlockFactory.createCard(board)
         card1.title = 'card1'
         const card2 = TestBlockFactory.createCard(board)
         card2.title = 'card2'
         const view = TestBlockFactory.createBoardView(board)
         view.fields.viewType = 'table'
         view.fields.groupById = undefined
         view.fields.visiblePropertyIds = ['property1', 'property2', modifiedById]
         const mockStore = configureStore([])
         const store = mockStore({
             ...state,
             cards: {
                 cards: {
                     [card1.id]: card1,
                     [card2.id]: card2,
                 },
             },
         })

         const component = wrapDNDIntl(
             <ReduxProvider store={store}>
                 <Table
                     board={board}
                     activeView={view}
                     visibleGroups={[]}
                     cards={[card1, card2]}
                     views={[view]}
                     selectedCardIds={[]}
                     readonly={false}
                     cardIdToFocusOnRender=''
                     showCard={jest.fn()}
                     addCard={jest.fn()}
                    addSubCard={jest.fn()}
                     onCardClicked={jest.fn()}
                     hiddenCardsCount={0}
                     showHiddenCardCountNotification={jest.fn()}
                 />
             </ReduxProvider>,
         )

         render(component)
         const card1Name = await screen.findByTitle(card1.title)
         await userEvents.hover(card1Name)
         const menuBtn = await screen.findAllByTitle('MenuBtn')
         await userEvents.click(menuBtn[0])
         const deleteBtn = await screen.findByRole('button', {name: 'Delete'})
         await userEvents.click(deleteBtn)
         const dailogDeleteBtn = await screen.findByRole('button', {name: 'Delete'})
         await userEvents.click(dailogDeleteBtn)
         expect(mockedMutator.deleteBlock).toBeCalledTimes(1)
     })

     test('should have Duplicate Button', async () => {
         const board = TestBlockFactory.createBoard()

         const modifiedById = Utils.createGuid(IDType.User)
         board.cardProperties.push({
             id: modifiedById,
             name: 'Last Modified By',
             type: 'updatedBy',
             options: [],
         })
         const card1 = TestBlockFactory.createCard(board)
         card1.title = 'card1'
         const card2 = TestBlockFactory.createCard(board)
         card2.title = 'card2'
         const view = TestBlockFactory.createBoardView(board)
         view.fields.viewType = 'table'
         view.fields.groupById = undefined
         view.fields.visiblePropertyIds = ['property1', 'property2', modifiedById]
         const mockStore = configureStore([])
         const store = mockStore({
             ...state,
             cards: {
                 cards: {
                     [card1.id]: card1,
                     [card2.id]: card2,
                 },
             },
         })

         const component = wrapDNDIntl(
             <ReduxProvider store={store}>
                 <Table
                     board={board}
                     activeView={view}
                     visibleGroups={[]}
                     cards={[card1, card2]}
                     views={[view]}
                     selectedCardIds={[]}
                     readonly={false}
                     cardIdToFocusOnRender=''
                     showCard={jest.fn()}
                     addCard={jest.fn()}
                    addSubCard={jest.fn()}
                     onCardClicked={jest.fn()}
                     hiddenCardsCount={0}
                     showHiddenCardCountNotification={jest.fn()}
                 />
             </ReduxProvider>,
         )

         const {container} = render(component)
         const card1Name = await screen.findByTitle(card1.title)
         await userEvents.hover(card1Name)
         const menuBtn = await screen.findAllByTitle('MenuBtn')
         await userEvents.click(menuBtn[0])
         const duplicateBtn = await screen.findByRole('button', {name: 'Duplicate'})
         expect(duplicateBtn).not.toBe(null)
         await userEvents.click(duplicateBtn)
         expect(mockedMutator.duplicateCard).toBeCalledTimes(1)
         expect(container).toMatchSnapshot()
     })
})

// specs/021-per-user-view-state — 그룹 접기·열 너비는 개인 화면 제어다.
// 공유 뷰 블록을 저장하지 않고(mutator 미호출), 개인 상태가 있으면 그것이
// 뷰 저장값보다 우선한다.
describe('components/table/Table - 개인 화면 제어 (021)', () => {
    // Utils가 모킹되어 createGuid가 비므로 id를 직접 박는다 — 비어 있으면
    // boards.current가 ''가 되어 권한 훅이 전부 false(=readonly)로 떨어진다
    const board = TestBlockFactory.createBoard()
    board.id = 'board-021'
    const view = TestBlockFactory.createBoardView(board)
    view.id = 'view-021'
    view.boardId = board.id
    view.fields.viewType = 'table'
    view.fields.visiblePropertyIds = ['property1']

    const groupedCard = TestBlockFactory.createCard(board)
    groupedCard.id = 'card-021'
    groupedCard.boardId = board.id
    groupedCard.title = 'grouped-row-card'
    groupedCard.fields.properties.property1 = 'value1'

    const groupByProperty: IPropertyTemplate = {
        id: 'property1',
        name: 'Property 1',
        type: 'text',
        options: [{id: 'value1', value: 'Value 1', color: ''}],
    }

    const makeState = (byKey: Record<string, {collapsedOptionIds?: string[], columnWidths?: Record<string, number>}>) => ({
        users: {
            me: {id: 'user-id-1'} as IUser,
            boardUsers: {'user-id-1': {username: 'username_1'} as IUser},
        },
        comments: {comments: {}, commentsByCard: {}},
        contents: {contents: {}, contentsByCard: {}},
        cards: {cards: {[groupedCard.id]: groupedCard}},
        teams: {current: {id: 'team-id'}},
        boards: {
            current: board.id,
            boards: {[board.id]: board},
            myBoardMemberships: {[board.id]: {userId: 'user-id-1', schemeAdmin: true}},
        },
        viewLocalState: {byKey},
    })

    const renderTable = (activeView: BoardView, byKey: Record<string, {collapsedOptionIds?: string[], columnWidths?: Record<string, number>}>) => {
        const mockStore = configureStore([])
        const store = mockStore(makeState(byKey))
        const utils = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={activeView}
                    visibleGroups={[{option: {id: 'value1', value: 'Value 1', color: ''}, cards: [groupedCard]}]}
                    groupByProperty={groupByProperty}
                    cards={[groupedCard]}
                    views={[view]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={jest.fn()}
                    addCard={jest.fn()}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        ))
        return {store, ...utils}
    }

    const groupedView = (collapsedOptionIds: string[]): BoardView => ({
        ...view,
        fields: {...view.fields, groupById: 'property1', collapsedOptionIds},
    } as BoardView)

    test('그룹 접기 토글이 공유 뷰를 저장하지 않는다 (FR-001·FR-003)', async () => {
        const {store, container} = renderTable(groupedView([]), {})

        // Utils가 모킹되어 generateClassName이 비므로, 평문 클래스로 좁혀
        // 그룹 헤더의 첫 버튼(= 펼치기 토글)을 집는다
        const toggle = container.querySelector('.octo-group-header-cell button')
        expect(toggle).not.toBeNull()
        await userEvents.click(toggle!)

        expect(mockedMutator.updateBlock).not.toHaveBeenCalled()
        expect(mockedMutator.performAsUndoGroup).not.toHaveBeenCalled()

        const toggleActions = store.getActions().filter((a: {type: string}) => a.type === 'viewLocalState/toggleCollapsedOption')
        expect(toggleActions).toHaveLength(1)
        expect(toggleActions[0].payload).toEqual({
            key: `user-id-1:${view.id}`,
            optionId: 'value1',
            seed: [],
        })
    })

    test('개인 상태가 없으면 뷰 저장값이 시드로 쓰인다 (FR-005)', () => {
        const {container} = renderTable(groupedView(['value1']), {})

        expect(container.querySelectorAll('.TableRow.octo-table-row')).toHaveLength(0)
    })

    test('개인 상태가 있으면 뷰 저장값보다 우선한다 (FR-001)', () => {
        const {container} = renderTable(groupedView(['value1']), {
            [`user-id-1:${view.id}`]: {collapsedOptionIds: []},
        })

        expect(container.querySelectorAll('.TableRow.octo-table-row')).toHaveLength(1)
    })
})

// specs/021-per-user-view-state US2 — 열 너비도 개인 화면 제어다.
describe('components/table/Table - 열 너비 개인화 (021 US2)', () => {
    const board = TestBlockFactory.createBoard()
    board.id = 'board-021w'
    const view = TestBlockFactory.createBoardView(board)
    view.id = 'view-021w'
    view.boardId = board.id
    view.fields.viewType = 'table'
    view.fields.visiblePropertyIds = ['property1']

    const card = TestBlockFactory.createCard(board)
    card.id = 'card-021w'
    card.boardId = board.id

    const makeState = (byKey: Record<string, {collapsedOptionIds?: string[], columnWidths?: Record<string, number>}>) => ({
        users: {
            me: {id: 'user-id-1'} as IUser,
            boardUsers: {'user-id-1': {username: 'username_1'} as IUser},
        },
        comments: {comments: {}, commentsByCard: {}},
        contents: {contents: {}, contentsByCard: {}},
        cards: {cards: {[card.id]: card}},
        teams: {current: {id: 'team-id'}},
        boards: {
            current: board.id,
            boards: {[board.id]: board},
            myBoardMemberships: {[board.id]: {userId: 'user-id-1', schemeAdmin: true}},
        },
        viewLocalState: {byKey},
    })

    const renderTable = (activeView: BoardView, byKey: Record<string, {collapsedOptionIds?: string[], columnWidths?: Record<string, number>}>) => {
        const mockStore = configureStore([])
        const store = mockStore(makeState(byKey))
        const utils = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <Table
                    board={board}
                    activeView={activeView}
                    visibleGroups={[]}
                    cards={[card]}
                    views={[view]}
                    selectedCardIds={[]}
                    readonly={false}
                    cardIdToFocusOnRender=''
                    showCard={jest.fn()}
                    addCard={jest.fn()}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    hiddenCardsCount={0}
                    showHiddenCardCountNotification={jest.fn()}
                />
            </ReduxProvider>,
        ))
        return {store, ...utils}
    }

    test('열 너비 드래그가 공유 뷰를 저장하지 않는다 (FR-002·FR-003)', () => {
        const {store, container} = renderTable(view, {})

        const grip = container.querySelector('.HorizontalGrip')
        expect(grip).not.toBeNull()
        fireEvent.mouseDown(grip!, {clientX: 100})
        fireEvent.mouseMove(document, {clientX: 150})
        fireEvent.mouseUp(document)

        expect(mockedMutator.updateBlock).not.toHaveBeenCalled()

        const widthActions = store.getActions().filter((a: {type: string}) => a.type === 'viewLocalState/setColumnWidth')
        expect(widthActions).toHaveLength(1)
        expect(widthActions[0].payload).toEqual({
            key: `user-id-1:${view.id}`,
            columnId: Constants.titleColumnId,
            width: Constants.minColumnWidth + 50,
        })
    })

    test('개인 너비가 있는 열만 개인 값을 쓰고 나머지는 공유 값을 따른다 (FR-005)', () => {
        const viewWithWidths = {
            ...view,
            fields: {...view.fields, columnWidths: {[Constants.titleColumnId]: 300, property1: 150}},
        } as BoardView

        const {container} = renderTable(viewWithWidths, {
            [`user-id-1:${view.id}`]: {columnWidths: {property1: 222}},
        })

        const headers = container.querySelectorAll<HTMLElement>('.header-cell')
        expect(headers).toHaveLength(2)
        expect(headers[0].style.width).toBe('300px')
        expect(headers[1].style.width).toBe('222px')
    })

    test('열 자동 너비(그립 더블클릭)도 공유 뷰를 저장하지 않는다 (FR-002·FR-003)', () => {
        // Utils가 모킹되어 autosize의 글꼴 계산이 undefined로 죽으므로 경로를 살린다
        mocked(Utils.getFontAndPaddingFromCell).mockReturnValue({fontDescriptor: '', padding: 10})
        mocked(Utils.getTextWidth).mockReturnValue(50)

        const {store, container} = renderTable(view, {})

        const grip = container.querySelector('.HorizontalGrip')
        expect(grip).not.toBeNull()
        fireEvent.doubleClick(grip!)

        expect(mockedMutator.updateBlock).not.toHaveBeenCalled()

        const widthActions = store.getActions().filter((a: {type: string}) => a.type === 'viewLocalState/setColumnWidth')
        expect(widthActions).toHaveLength(1)
        expect(widthActions[0].payload.key).toBe(`user-id-1:${view.id}`)
        expect(widthActions[0].payload.columnId).toBe(Constants.titleColumnId)
    })

    test('열 삽입 메뉴는 공유 뷰 기준으로 호출된다 — 개인 값 역류 금지 (FR-003)', async () => {
        // insertPropertyTemplate은 전 필드 diff(createPatchesFromBlocks, 참조 비교)로
        // 뷰를 저장하므로, 병합 사본이 넘어가면 개인 접힘·너비가 공유 뷰로 역류한다
        const viewWithWidths = {
            ...view,
            fields: {...view.fields, columnWidths: {[Constants.titleColumnId]: 300}},
        } as BoardView

        const {container} = renderTable(viewWithWidths, {
            [`user-id-1:${view.id}`]: {collapsedOptionIds: ['value1'], columnWidths: {[Constants.titleColumnId]: 500}},
        })

        const headers = container.querySelectorAll<HTMLElement>('.header-cell')
        const menuLabel = headers[1].querySelector('.Label')
        expect(menuLabel).not.toBeNull()
        await userEvents.click(menuLabel!)
        const insertLeft = await screen.findByText('Insert left')
        await userEvents.click(insertLeft)

        expect(mockedMutator.insertPropertyTemplate).toHaveBeenCalledTimes(1)
        const passedView = mockedMutator.insertPropertyTemplate.mock.calls[0][1] as BoardView
        expect(passedView.fields.collapsedOptionIds).toEqual([])
        expect(passedView.fields.columnWidths).toEqual({[Constants.titleColumnId]: 300})
    })

    test('속성 열 자동 너비가 내용 길이를 반영한다', () => {
        mocked(Utils.getFontAndPaddingFromCell).mockReturnValue({fontDescriptor: '', padding: 10})
        // 첫 호출(헤더 라벨 폭)은 좁게, 이후(셀 내용 폭)는 넓게 측정되게 한다
        mocked(Utils.getTextWidth).mockReturnValueOnce(50).mockReturnValue(400)

        const {store, container} = renderTable(view, {})

        // jsdom은 innerText를 구현하지 않으므로 헤더 폭 측정 경로를 살린다
        const headerCells = container.querySelectorAll<HTMLElement>('.header-cell')
        Object.defineProperty(headerCells[1], 'innerText', {value: 'Property 1', configurable: true})

        const grips = container.querySelectorAll('.HorizontalGrip')
        expect(grips.length).toBeGreaterThan(1)
        fireEvent.doubleClick(grips[1])

        const widthActions = store.getActions().filter((a: {type: string}) => a.type === 'viewLocalState/setColumnWidth')
        expect(widthActions).toHaveLength(1)
        expect(widthActions[0].payload.columnId).toBe('property1')
        // 내용 400 + 패딩 10 = 410. 내용 길이를 버리면 패딩만 남아 최소폭 100으로 떨어진다
        expect(widthActions[0].payload.width).toBe(410)
    })
})
