// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import configureStore from 'redux-mock-store'

import {Provider as ReduxProvider} from 'react-redux'
import {MemoryRouter} from 'react-router-dom'

import {fireEvent, render, waitFor, screen} from '@testing-library/react'

import {thunk} from 'redux-thunk'

import {mocked} from 'jest-mock'

import userEvent from '@testing-library/user-event'

import {mockMatchMedia, wrapIntl} from '../../testUtils'
import {Utils} from '../../utils'

import {TestBlockFactory} from '../../test/testBlockFactory'
import octoClient from '../../../../webapp/src/octoClient'

import Sidebar from './sidebar'

jest.mock('../../../../webapp/src/octoClient')
const mockedOctoClient = mocked(octoClient, true)

beforeAll(() => {
    mockMatchMedia({matches: true})
})

describe('components/sidebarSidebar', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    const mockStore = configureStore([thunk])

    const board = TestBlockFactory.createBoard()
    board.id = 'board1'

    const categoryAttribute1 = TestBlockFactory.createCategoryBoards()
    categoryAttribute1.id = 'category1'
    categoryAttribute1.name = 'Category 1'
    categoryAttribute1.boardMetadata = [{boardID: board.id, hidden: false}]

    const defaultCategory = TestBlockFactory.createCategoryBoards()
    defaultCategory.id = 'default_category'
    defaultCategory.name = 'Boards'
    defaultCategory.boardMetadata = []

    test('sidebar hidden', () => {
        const store = mockStore({
            teams: {
                current: {id: 'team-id'},
            },
            boards: {
                current: board.id,
                boards: {
                    [board.id]: board,
                },
                myBoardMemberships: {
                    [board.id]: board,
                },
            },
            cards: {
                cards: {
                    card_id_1: {title: 'Card'},
                },
                current: 'card_id_1',
            },
            views: {
                views: [],
            },
            users: {
                me: {
                    id: 'user_id_1',
                    props: {},
                },
            },
            sidebar: {
                categoryAttributes: [
                    categoryAttribute1,
                ],
                hiddenBoardIDs: [],
            },
        })

        const onBoardTemplateSelectorOpen = jest.fn()

        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <Sidebar onBoardTemplateSelectorOpen={onBoardTemplateSelectorOpen}/>
                </MemoryRouter>
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        const hideSidebar = container.querySelector('button > .HideSidebarIcon')
        expect(hideSidebar).toBeDefined()

        userEvent.click(hideSidebar as Element)
        expect(container).toMatchSnapshot()

        const showSidebar = container.querySelector('button > .ShowSidebarIcon')
        expect(showSidebar).toBeDefined()
    })

    test('sidebar expect hidden', () => {
        const customGlobal = global as any

        customGlobal.innerWidth = 500

        const localCategoryAttribute = TestBlockFactory.createCategoryBoards()
        localCategoryAttribute.id = 'category1'
        localCategoryAttribute.name = 'Category 1'
        categoryAttribute1.boardMetadata = [{boardID: board.id, hidden: false}]

        const store = mockStore({
            teams: {
                current: {id: 'team-id'},
            },
            boards: {
                current: board.id,
                boards: {
                    [board.id]: board,
                },
                myBoardMemberships: {
                    [board.id]: board,
                },
            },
            cards: {
                cards: {
                    card_id_1: {title: 'Card'},
                },
                current: 'card_id_1',
            },
            views: {
                views: [],
            },
            users: {
                me: {
                    id: 'user_id_1',
                    props: {},
                },
            },
            sidebar: {
                categoryAttributes: [
                    categoryAttribute1,
                ],
                hiddenBoardIDs: [],
            },
        })

        const onBoardTemplateSelectorOpen = jest.fn()

        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <Sidebar onBoardTemplateSelectorOpen={onBoardTemplateSelectorOpen}/>
                </MemoryRouter>
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        const hideSidebar = container.querySelector('button > .HideSidebarIcon')
        expect(hideSidebar).toBeNull()

        const showSidebar = container.querySelector('button > .ShowSidebarIcon')
        expect(showSidebar).toBeDefined()

        customGlobal.innerWidth = 1024
    })

    test('dont show hidden boards', async () => {
        const localCategoryAttribute = TestBlockFactory.createCategoryBoards()
        localCategoryAttribute.id = 'category1'
        localCategoryAttribute.name = 'Category 1'
        localCategoryAttribute.boardMetadata = [{boardID: board.id, hidden: true}]

        const store = mockStore({
            teams: {
                current: {id: 'team-id'},
            },
            boards: {
                current: board.id,
                boards: {
                    [board.id]: board,
                },
                myBoardMemberships: {
                    [board.id]: board,
                },
            },
            cards: {
                cards: {
                    card_id_1: {title: 'Card'},
                },
                current: 'card_id_1',
            },
            views: {
                views: [],
            },
            users: {
                me: {
                    id: 'user_id_1',
                },
                myConfig: {
                    hiddenBoardIDs: {value: {
                        [board.id]: true,
                    }},
                },
            },
            sidebar: {
                categoryAttributes: [
                    localCategoryAttribute,
                ],
                hiddenBoardIDs: [board.id],
            },
        })

        const onBoardTemplateSelectorOpen = jest.fn()

        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <Sidebar onBoardTemplateSelectorOpen={onBoardTemplateSelectorOpen}/>
                </MemoryRouter>
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        const sidebarBoards = container.getElementsByClassName('SidebarBoardItem')

        // The only board in redux store is hidden, so there should
        // be no boards visible in sidebar
        expect(sidebarBoards.length).toBe(0)

        // 016: 숨긴 보드가 있으면 "No boards inside" 대신 숨긴 보드 행이 보인다 (U-06)
        expect(screen.queryByText('No boards inside')).toBeNull()
        expect(container.querySelector('.HiddenBoardsRow')?.textContent).toContain('1 hidden board')
    })

    test('some categories hidden', () => {
        const collapsedCategory = TestBlockFactory.createCategoryBoards()
        collapsedCategory.id = 'categoryCollapsed'
        collapsedCategory.name = 'Category 2'
        collapsedCategory.collapsed = true
        collapsedCategory.boardMetadata = []

        const store = mockStore({
            teams: {
                current: {id: 'team-id'},
            },
            boards: {
                current: board.id,
                boards: {
                    [board.id]: board,
                },
                myBoardMemberships: {
                    [board.id]: board,
                },
            },
            cards: {
                cards: {
                    card_id_1: {title: 'Card'},
                },
                current: 'card_id_1',
            },
            views: {
                views: [],
            },
            users: {
                me: {
                    id: 'user_id_1',
                    props: {},
                },
            },
            sidebar: {
                categoryAttributes: [
                    categoryAttribute1,
                    collapsedCategory,
                ],
                hiddenBoardIDs: [],
            },
        })

        const onBoardTemplateSelectorOpen = jest.fn()

        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <Sidebar onBoardTemplateSelectorOpen={onBoardTemplateSelectorOpen}/>
                </MemoryRouter>
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        const sidebarCollapsedCategory = container.querySelectorAll('.octo-sidebar-item.category.collapsed')
        expect(sidebarCollapsedCategory.length).toBe(1)
    })

    test('should assign default category if current board doesnt have a category', async () => {
        const board2 = TestBlockFactory.createBoard()
        board2.id = 'board2'

        const store = mockStore({
            teams: {
                current: {id: 'team-id'},
            },
            boards: {
                current: board2.id,
                boards: {
                    [board2.id]: board2,
                },
                myBoardMemberships: {
                    [board2.id]: board2,
                },
            },
            cards: {
                cards: {
                    card_id_1: {title: 'Card'},
                },
                current: 'card_id_1',
            },
            views: {
                views: [],
            },
            users: {
                me: {
                    id: 'user_id_1',
                    props: {},
                },
            },
            sidebar: {
                categoryAttributes: [
                    categoryAttribute1,
                    defaultCategory,
                ],
                hiddenBoardIDs: [],
            },
        })

        const onBoardTemplateSelectorOpen = jest.fn()

        mockedOctoClient.moveBoardToCategory.mockResolvedValueOnce({} as Response)

        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <Sidebar onBoardTemplateSelectorOpen={onBoardTemplateSelectorOpen}/>
                </MemoryRouter>
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        await waitFor(() => 
            expect(mockedOctoClient.moveBoardToCategory).toBeCalledWith('team-id', 'board2', 'default_category', '')
        )
    })

    test('shouldnt do any category assignment is board is in a category', () => {
        const board2 = TestBlockFactory.createBoard()
        board2.id = 'board2'

        const categoryAttribute2 = TestBlockFactory.createCategoryBoards()
        categoryAttribute2.id = 'category2'
        categoryAttribute2.name = 'Category 2'
        categoryAttribute2.boardMetadata = [{boardID: board2.id, hidden: false}]

        const store = mockStore({
            teams: {
                current: {id: 'team-id'},
            },
            boards: {
                current: board2.id,
                boards: {
                    [board2.id]: board2,
                },
                myBoardMemberships: {
                    [board2.id]: board2,
                },
            },
            cards: {
                cards: {
                    card_id_1: {title: 'Card'},
                },
                current: 'card_id_1',
            },
            views: {
                views: [],
            },
            users: {
                me: {
                    id: 'user_id_1',
                    props: {},
                },
            },
            sidebar: {
                categoryAttributes: [
                    categoryAttribute1,
                    categoryAttribute2,
                    defaultCategory,
                ],
            },
        })

        const onBoardTemplateSelectorOpen = jest.fn()

        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <Sidebar onBoardTemplateSelectorOpen={onBoardTemplateSelectorOpen}/>
                </MemoryRouter>
            </ReduxProvider>,
        )
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        expect(mockedOctoClient.moveBoardToCategory).toBeCalledTimes(0)
    })

})

// 018: 숨기기/보이기 토글 보존 계약 (contracts/ui-surfaces.md U-01~U-07)
describe('components/sidebarSidebar — 018 toggle persistence', () => {
    const mockStore = configureStore([thunk])

    const board = TestBlockFactory.createBoard()
    board.id = 'board1'

    const categoryAttribute1 = TestBlockFactory.createCategoryBoards()
    categoryAttribute1.id = 'category1'
    categoryAttribute1.name = 'Category 1'
    categoryAttribute1.boardMetadata = [{boardID: board.id, hidden: false}]

    const makeStore = () => mockStore({
        teams: {
            current: {id: 'team-id'},
        },
        boards: {
            current: board.id,
            boards: {
                [board.id]: board,
            },
            myBoardMemberships: {
                [board.id]: board,
            },
        },
        cards: {
            cards: {
                card_id_1: {title: 'Card'},
            },
            current: 'card_id_1',
        },
        views: {
            views: [],
        },
        users: {
            me: {
                id: 'user_id_1',
                props: {},
            },
        },
        sidebar: {
            categoryAttributes: [
                categoryAttribute1,
            ],
            hiddenBoardIDs: [],
        },
    })

    const renderSidebar = () => {
        const component = wrapIntl(
            <ReduxProvider store={makeStore()}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <Sidebar onBoardTemplateSelectorOpen={jest.fn()}/>
                </MemoryRouter>
            </ReduxProvider>,
        )
        return render(component)
    }

    beforeEach(() => {
        jest.clearAllMocks()
        jest.restoreAllMocks()
        localStorage.clear()
        const customGlobal = global as any
        customGlobal.innerWidth = 1024
    })

    test('U-01: 플러그인 모드 데스크톱에서 접근 가능한 이름이 있는 숨기기 버튼을 그린다', () => {
        jest.spyOn(Utils, 'isFocalboardPlugin').mockReturnValue(true)

        renderSidebar()

        expect(screen.getByRole('button', {name: 'Hide sidebar'})).toBeDefined()
    })

    test('U-01b: 플러그인 모드에서 토글은 보드 찾기 행 안에 + 버튼과 나란히 있다', () => {
        jest.spyOn(Utils, 'isFocalboardPlugin').mockReturnValue(true)

        const {container} = renderSidebar()

        const toggle = screen.getByRole('button', {name: 'Hide sidebar'})
        const switcherRow = container.querySelector('.BoardsSwitcherWrapper')
        expect(switcherRow).not.toBeNull()
        expect(switcherRow!.contains(toggle)).toBe(true)
    })

    test('U-02: 숨기기 클릭이 사용자별 키로 저장된다', async () => {
        renderSidebar()

        await userEvent.click(screen.getByRole('button', {name: 'Hide sidebar'}))

        expect(localStorage.getItem('sidebarHidden_user_id_1')).toBe('true')
    })

    test('U-03: 보이기 클릭이 복원하고 저장 키를 지운다', async () => {
        const {container} = renderSidebar()

        await userEvent.click(screen.getByRole('button', {name: 'Hide sidebar'}))
        expect(container.querySelector('.Sidebar.hidden')).not.toBeNull()

        await userEvent.click(screen.getByRole('button', {name: 'Show sidebar'}))

        expect(container.querySelector('.Sidebar.hidden')).toBeNull()
        expect(localStorage.getItem('sidebarHidden_user_id_1')).toBeNull()
    })

    test('U-04: 저장값이 true면 처음부터 숨김으로 마운트된다', () => {
        localStorage.setItem('sidebarHidden_user_id_1', 'true')

        const {container} = renderSidebar()

        expect(container.querySelector('.Sidebar.hidden')).not.toBeNull()
    })

    test('U-06: 저장된 숨김은 창 폭이 바뀌어도 유지된다', () => {
        localStorage.setItem('sidebarHidden_user_id_1', 'true')
        const customGlobal = global as any

        const {container} = renderSidebar()

        customGlobal.innerWidth = 500
        fireEvent(window, new Event('resize'))
        customGlobal.innerWidth = 1024
        fireEvent(window, new Event('resize'))

        expect(container.querySelector('.Sidebar.hidden')).not.toBeNull()
    })

    test('U-07: 좁은 폭 자동 숨김은 저장 키를 만들지 않는다', () => {
        const customGlobal = global as any
        customGlobal.innerWidth = 500

        const {container} = renderSidebar()
        fireEvent(window, new Event('resize'))

        expect(container.querySelector('.Sidebar.hidden')).not.toBeNull()
        expect(localStorage.getItem('sidebarHidden_user_id_1')).toBeNull()
    })
})
