// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import configureStore from 'redux-mock-store'
import {Provider as ReduxProvider} from 'react-redux'
import {MemoryRouter} from 'react-router-dom'
import {act, render, waitFor} from '@testing-library/react'
import {thunk} from 'redux-thunk'
import {mocked} from 'jest-mock'
import {DropResult} from '@hello-pangea/dnd'

import {mockMatchMedia, wrapIntl} from '../../testUtils'
import {TestBlockFactory} from '../../test/testBlockFactory'
import octoClient from '../../octoClient'
import {CategoryBoards, updateBoardCategories, updateCategoryBoardsOrder} from '../../store/sidebar'

import Sidebar from './sidebar'

// DragDropContext는 실제 구현에 위임하되 onDragEnd만 붙잡아 드롭을 흉내 낸다.
let mockOnDragEnd: ((result: DropResult) => void) | undefined

jest.mock('@hello-pangea/dnd', () => {
    const actual = jest.requireActual('@hello-pangea/dnd')
    const ReactActual = jest.requireActual('react')
    return {
        ...actual,
        DragDropContext: (props: {onDragEnd: (result: DropResult) => void, children?: React.ReactNode}) => {
            mockOnDragEnd = props.onDragEnd
            return ReactActual.createElement(actual.DragDropContext, props)
        },
    }
})

jest.mock('../../octoClient')
const mockedOctoClient = mocked(octoClient, true)

beforeAll(() => {
    mockMatchMedia({matches: true})
})

const dropBoard = (boardID: string, from: {categoryID: string, index: number}, to: {categoryID: string, index: number}): DropResult => ({
    draggableId: boardID,
    type: 'board',
    mode: 'FLUID',
    reason: 'DROP',
    combine: null,
    source: {droppableId: from.categoryID, index: from.index},
    destination: {droppableId: to.categoryID, index: to.index},
} as DropResult)

describe('components/sidebar/Sidebar board drag and drop', () => {
    const mockStore = configureStore([thunk])

    const alpha = TestBlockFactory.createBoard()
    alpha.id = 'board_alpha'
    alpha.title = 'Alpha'
    const beta = TestBlockFactory.createBoard()
    beta.id = 'board_beta'
    beta.title = 'Beta'
    const gamma = TestBlockFactory.createBoard()
    gamma.id = 'board_gamma'
    gamma.title = 'Gamma'

    const buildStore = (categoryAttributes: CategoryBoards[]) => mockStore({
        teams: {
            current: {id: 'team-id'},
        },
        boards: {
            current: '',
            boards: {
                [alpha.id]: alpha,
                [beta.id]: beta,
                [gamma.id]: gamma,
            },
            templates: {},
            myBoardMemberships: {},
        },
        cards: {cards: {}, current: ''},
        views: {views: []},
        users: {
            me: {id: 'user_id_1', props: {}},
            myConfig: {},
        },
        sidebar: {
            categoryAttributes,
            hiddenBoardIDs: [],
        },
    })

    const renderSidebar = (store: ReturnType<typeof mockStore>) => {
        mockOnDragEnd = undefined
        render(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <Sidebar onBoardTemplateSelectorOpen={jest.fn()}/>
                </MemoryRouter>
            </ReduxProvider>,
        ))
        expect(mockOnDragEnd).toBeDefined()
    }

    const boardsOrderActions = (store: ReturnType<typeof mockStore>) => store.getActions().filter((action: {type: string}) => action.type === updateCategoryBoardsOrder.type)

    beforeEach(() => {
        jest.clearAllMocks()
        mockedOctoClient.moveBoardToCategory.mockResolvedValue({ok: true} as Response)
    })

    test('reorders boards that are shown in Boards but belong to no category yet', async () => {
        // 비관리자 화면: 서버 카테고리는 비어 있고, 볼 수 있는 보드는 화면에서만 복구되어 Boards 아래에 그려진다.
        const boardsCategory = TestBlockFactory.createCategoryBoards()
        boardsCategory.id = 'default_category'
        boardsCategory.name = 'Boards'
        boardsCategory.boardMetadata = []

        mockedOctoClient.reorderSidebarCategoryBoards.mockResolvedValue([beta.id, alpha.id, gamma.id])

        const store = buildStore([boardsCategory])
        renderSidebar(store)

        // 그려진 순서: Alpha(0), Beta(1), Gamma(2). Beta를 맨 위로 옮긴다.
        await act(async () => {
            mockOnDragEnd!(dropBoard(beta.id, {categoryID: 'default_category', index: 1}, {categoryID: 'default_category', index: 0}))
        })

        await waitFor(() => expect(mockedOctoClient.reorderSidebarCategoryBoards).toHaveBeenCalled())

        const orderActions = boardsOrderActions(store)
        expect(orderActions).toHaveLength(1)
        expect(orderActions[0].payload).toEqual({
            categoryID: 'default_category',
            boardsMetadata: [
                {boardID: beta.id, hidden: false},
                {boardID: alpha.id, hidden: false},
                {boardID: gamma.id, hidden: false},
            ],
        })

        // 서버 카테고리에 없던 보드는 먼저 등록한 뒤에 순서를 저장한다.
        expect(mockedOctoClient.moveBoardToCategory.mock.calls).toEqual([
            ['team-id', beta.id, 'default_category', ''],
            ['team-id', alpha.id, 'default_category', ''],
            ['team-id', gamma.id, 'default_category', ''],
        ])
        const lastAdd = Math.max(...mockedOctoClient.moveBoardToCategory.mock.invocationCallOrder)
        expect(mockedOctoClient.reorderSidebarCategoryBoards.mock.invocationCallOrder[0]).toBeGreaterThan(lastAdd)
        expect(mockedOctoClient.reorderSidebarCategoryBoards).toHaveBeenCalledWith('team-id', 'default_category', [beta.id, alpha.id, gamma.id])
    })

    test('drop index follows the visible list when a hidden board sits above', async () => {
        const boardsCategory = TestBlockFactory.createCategoryBoards()
        boardsCategory.id = 'default_category'
        boardsCategory.name = 'Boards'
        boardsCategory.boardMetadata = [
            {boardID: alpha.id, hidden: true},
            {boardID: beta.id, hidden: false},
            {boardID: gamma.id, hidden: false},
        ]

        mockedOctoClient.reorderSidebarCategoryBoards.mockResolvedValue([gamma.id, beta.id, alpha.id])

        const store = buildStore([boardsCategory])
        renderSidebar(store)

        // 그려진 순서: Beta(0), Gamma(1). Gamma를 맨 위로 옮긴다.
        await act(async () => {
            mockOnDragEnd!(dropBoard(gamma.id, {categoryID: 'default_category', index: 1}, {categoryID: 'default_category', index: 0}))
        })

        await waitFor(() => expect(mockedOctoClient.reorderSidebarCategoryBoards).toHaveBeenCalled())

        expect(boardsOrderActions(store)[0].payload.boardsMetadata).toEqual([
            {boardID: gamma.id, hidden: false},
            {boardID: beta.id, hidden: false},
            {boardID: alpha.id, hidden: true},
        ])
        expect(mockedOctoClient.moveBoardToCategory).not.toHaveBeenCalled()
        expect(mockedOctoClient.reorderSidebarCategoryBoards).toHaveBeenCalledWith('team-id', 'default_category', [gamma.id, beta.id, alpha.id])
    })

    test('moves a recovered board from Boards into another category', async () => {
        const boardsCategory = TestBlockFactory.createCategoryBoards()
        boardsCategory.id = 'default_category'
        boardsCategory.name = 'Boards'
        boardsCategory.boardMetadata = []

        const custom = TestBlockFactory.createCategoryBoards()
        custom.id = 'category1'
        custom.name = 'Category 1'
        custom.boardMetadata = [{boardID: gamma.id, hidden: false}]

        mockedOctoClient.reorderSidebarCategoryBoards.mockResolvedValue([beta.id, gamma.id])

        const store = buildStore([custom, boardsCategory])
        renderSidebar(store)

        // Boards에 그려진 Beta(1)를 Category 1의 맨 위로 옮긴다.
        await act(async () => {
            mockOnDragEnd!(dropBoard(beta.id, {categoryID: 'default_category', index: 1}, {categoryID: 'category1', index: 0}))
        })

        await waitFor(() => expect(mockedOctoClient.reorderSidebarCategoryBoards).toHaveBeenCalled())

        expect(boardsOrderActions(store)[0].payload).toEqual({
            categoryID: 'category1',
            boardsMetadata: [
                {boardID: beta.id, hidden: false},
                {boardID: gamma.id, hidden: false},
            ],
        })
        const moveActions = store.getActions().filter((action: {type: string}) => action.type === updateBoardCategories.type)
        expect(moveActions[0].payload).toEqual([{boardID: beta.id, hidden: false, categoryID: 'category1'}])
        expect(mockedOctoClient.moveBoardToCategory).toHaveBeenCalledWith('team-id', beta.id, 'category1', 'default_category')
        expect(mockedOctoClient.reorderSidebarCategoryBoards).toHaveBeenCalledWith('team-id', 'category1', [beta.id, gamma.id])
    })
})
