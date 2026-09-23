// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {MemoryRouter} from 'react-router-dom'

import {render} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {Provider as ReduxProvider} from 'react-redux'

import configureStore from 'redux-mock-store'

import {TestBlockFactory} from '../../test/testBlockFactory'

import {wrapIntl, wrapRBDNDDroppable} from '../../testUtils'

import SidebarCategory from './sidebarCategory'

describe('components/sidebarCategory', () => {
    const board = TestBlockFactory.createBoard()
    board.id = 'board_id'

    const view = TestBlockFactory.createBoardView(board)
    view.fields.sortOptions = []

    const board1 = TestBlockFactory.createBoard()
    board1.id = 'board_1_id'

    const board2 = TestBlockFactory.createBoard()
    board2.id = 'board_2_id'

    const boards = [board1, board2]
    const categoryBoards1 = TestBlockFactory.createCategoryBoards()
    categoryBoards1.id = 'category_1_id'
    categoryBoards1.name = 'Category 1'
    categoryBoards1.boardMetadata = [{boardID: board1.id, hidden: false}, {boardID: board2.id, hidden: false}]

    const categoryBoards2 = TestBlockFactory.createCategoryBoards()
    categoryBoards2.id = 'category_2_id'
    categoryBoards2.name = 'Category 2'

    const categoryBoards3 = TestBlockFactory.createCategoryBoards()
    categoryBoards3.id = 'category_id_3'
    categoryBoards3.name = 'Category 3'

    const allCategoryBoards = [
        categoryBoards1,
        categoryBoards2,
        categoryBoards3,
    ]

    const state = {
        users: {
            me: {
                id: 'user_id_1',
                props: {},
            },
        },
        boards: {
            current: board.id,
            boards: {
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
            current: view.id,
            views: {
                [view.id]: view,
            },
        },
        teams: {
            current: {
                id: 'team-id',
            },
        },
    }

    test('sidebar call hideSidebar', async () => {
        const mockStore = configureStore([])
        const store = mockStore(state)

        const component = wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <SidebarCategory
                        hideSidebar={() => {}}
                        categoryBoards={categoryBoards1}
                        boards={boards}
                        allCategories={allCategoryBoards}
                        index={0}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        // testing collapsed state of category
        const subItems = container.querySelectorAll('.category')
        expect(subItems).toBeDefined()
        await userEvent.click(subItems[0] as Element)
        expect(container).toMatchSnapshot()
    })

    test('sidebar collapsed without active board', async () => {
        const mockStore = configureStore([])
        const store = mockStore(state)

        const component = wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <SidebarCategory
                        hideSidebar={() => {}}
                        categoryBoards={categoryBoards1}
                        boards={boards}
                        allCategories={allCategoryBoards}
                        index={0}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))
        const {container} = render(component)

        const subItems = container.querySelectorAll('.category-title')
        expect(subItems).toBeDefined()
        await userEvent.click(subItems[0] as Element)
        expect(container).toMatchSnapshot()
    })

    test('sidebar collapsed with active board in it', async () => {
        const mockStore = configureStore([])
        const store = mockStore(state)

        const component = wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <SidebarCategory
                        hideSidebar={() => {}}
                        activeBoardID={board1.id}
                        categoryBoards={categoryBoards1}
                        boards={boards}
                        allCategories={allCategoryBoards}
                        index={0}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))
        const {container} = render(component)

        const subItems = container.querySelectorAll('.category-title')
        expect(subItems).toBeDefined()
        await userEvent.click(subItems[0] as Element)
        expect(container).toMatchSnapshot()
    })

    test('sidebar template close self', async () => {
        const mockStore = configureStore([])
        const store = mockStore(state)

        const mockTemplateClose = jest.fn()

        const component = wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <SidebarCategory
                        activeBoardID={board1.id}
                        hideSidebar={() => {}}
                        categoryBoards={categoryBoards1}
                        boards={boards}
                        allCategories={allCategoryBoards}
                        index={0}
                        onBoardTemplateSelectorClose={mockTemplateClose}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        const subItems = container.querySelectorAll('.subitem')
        expect(subItems).toBeDefined()
        await userEvent.click(subItems[0] as Element)
        expect(mockTemplateClose).toBeCalled()
    })

    test('sidebar template close other', async () => {
        const mockStore = configureStore([])
        const store = mockStore(state)

        const mockTemplateClose = jest.fn()

        const component = wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <SidebarCategory
                        activeBoardID={board2.id}
                        hideSidebar={() => {}}
                        categoryBoards={categoryBoards1}
                        boards={boards}
                        allCategories={allCategoryBoards}
                        index={0}
                        onBoardTemplateSelectorClose={mockTemplateClose}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))
        const {container} = render(component)
        expect(container).toMatchSnapshot()

        const subItems = container.querySelectorAll('.category-title')
        expect(subItems).toBeDefined()
        await userEvent.click(subItems[0] as Element)
        expect(mockTemplateClose).not.toBeCalled()
    })
    // --- 016: 숨긴 보드 행 (contracts/ui-surfaces.md U-01b) ---
    test('U-01b: hidden boards row sits under the expanded list and disappears when collapsed or dragged', async () => {
        const categoryWithHidden = TestBlockFactory.createCategoryBoards()
        categoryWithHidden.id = 'category_hidden_id'
        categoryWithHidden.name = 'Category Hidden'
        categoryWithHidden.boardMetadata = [{boardID: board1.id, hidden: false}, {boardID: board2.id, hidden: true}]

        const mockStore = configureStore([])
        const store = mockStore(state)

        const renderCategory = (extraProps: {forceCollapse?: boolean, draggedItemID?: string} = {}) => wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id']}>
                    <SidebarCategory
                        hideSidebar={() => {}}
                        categoryBoards={categoryWithHidden}
                        boards={boards}
                        allCategories={allCategoryBoards}
                        index={0}
                        {...extraProps}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))

        const {container, unmount} = render(renderCategory())
        const row = container.querySelector('.HiddenBoardsRow')
        expect(row).not.toBeNull()
        expect(row?.textContent).toContain('1 hidden board')

        // 행은 보드 목록(Droppable) 바깥, 그 바로 뒤에 있다
        const droppable = container.querySelector('.categoryBoardsDroppableArea')
        expect(droppable?.contains(row)).toBe(false)
        expect(droppable?.nextElementSibling).toBe(row)

        // 카테고리를 접으면 사라진다
        await userEvent.click(container.querySelector('.category-title') as Element)
        expect(container.querySelector('.HiddenBoardsRow')).toBeNull()
        unmount()

        const forced = render(renderCategory({forceCollapse: true}))
        expect(forced.container.querySelector('.HiddenBoardsRow')).toBeNull()
        forced.unmount()

        const dragged = render(renderCategory({draggedItemID: categoryWithHidden.id}))
        expect(dragged.container.querySelector('.HiddenBoardsRow')).toBeNull()
        dragged.unmount()
    })
    // --- 016: 전부 숨긴 카테고리의 문구 (contracts/ui-surfaces.md U-06) ---
    describe('U-06: empty-category message', () => {
        const renderWith = (categoryBoards: typeof categoryBoards1) => {
            const mockStore = configureStore([])
            const store = mockStore(state)
            return render(wrapRBDNDDroppable(wrapIntl(
                <ReduxProvider store={store}>
                    <MemoryRouter initialEntries={['/team/team-id']}>
                        <SidebarCategory
                            hideSidebar={() => {}}
                            categoryBoards={categoryBoards}
                            boards={boards}
                            allCategories={allCategoryBoards}
                            index={0}
                        />
                    </MemoryRouter>
                </ReduxProvider>,
            )))
        }

        test('all boards hidden: shows the hidden row instead of "No boards inside"', () => {
            const allHidden = TestBlockFactory.createCategoryBoards()
            allHidden.id = 'category_all_hidden'
            allHidden.name = 'All hidden'
            allHidden.isNew = false
            allHidden.boardMetadata = [{boardID: board1.id, hidden: true}]

            const {container} = renderWith(allHidden)

            expect(container.textContent).not.toContain('No boards inside')
            expect(container.querySelector('.HiddenBoardsRow')?.textContent).toContain('1 hidden board')
        })

        test('truly empty: still says "No boards inside"', () => {
            const empty = TestBlockFactory.createCategoryBoards()
            empty.id = 'category_empty'
            empty.name = 'Empty'
            empty.isNew = false
            empty.boardMetadata = []

            const {container} = renderWith(empty)

            expect(container.textContent).toContain('No boards inside')
            expect(container.querySelector('.HiddenBoardsRow')).toBeNull()
        })

        test('new category: keeps the drag-here area', () => {
            const fresh = TestBlockFactory.createCategoryBoards()
            fresh.id = 'category_fresh'
            fresh.name = 'Fresh'
            fresh.isNew = true
            fresh.boardMetadata = []

            const {container} = renderWith(fresh)

            expect(container.querySelector('.newCategoryDragArea')).not.toBeNull()
            expect(container.textContent).not.toContain('No boards inside')
        })
    })
})
