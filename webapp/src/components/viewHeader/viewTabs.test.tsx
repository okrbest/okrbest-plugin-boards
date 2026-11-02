// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import '@testing-library/jest-dom'

import {TestBlockFactory} from '../../test/testBlockFactory'
import {wrapIntl, mockStateStore} from '../../testUtils'

import mutator from '../../mutator'

import ViewTabs from './viewTabs'

jest.mock('../../mutator')
const mockedMutator = jest.mocked(mutator)

const board = TestBlockFactory.createBoard()
const view1 = TestBlockFactory.createBoardView(board)
view1.title = 'Board View'
view1.fields.viewType = 'board'
const view2 = TestBlockFactory.createBoardView(board)
view2.title = 'Table View'
view2.fields.viewType = 'table'

jest.mock('react-router-dom', () => {
    const originalModule = jest.requireActual('react-router-dom')
    return {
        ...originalModule,
        useParams: jest.fn(() => ({boardId: board.id, viewId: view1.id})),
        useNavigate: jest.fn(() => jest.fn()),
        useLocation: jest.fn(() => ({pathname: '/board/view', search: ''})),
    }
})

describe('components/viewHeader/viewTabs', () => {
    const state = {
        users: {me: {id: 'user-id-1', username: 'username_1', props: {}}},
        teams: {current: {id: 'team-id'}},
        boards: {
            current: board.id,
            boards: {[board.id]: board},
            templates: [],
            myBoardMemberships: {[board.id]: {userId: 'user_id_1', schemeAdmin: true}},
        },
    }
    const store = mockStateStore([], state)

    test('renders all view tabs', () => {
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewTabs
                        board={board}
                        activeView={view1}
                        views={[view1, view2]}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )
        expect(screen.getByText('Board View')).toBeInTheDocument()
        expect(screen.getByText('Table View')).toBeInTheDocument()
    })

    test('renders add button when not readonly', () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewTabs
                        board={board}
                        activeView={view1}
                        views={[view1, view2]}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container.querySelector('.ViewTabs__addButton')).toBeInTheDocument()
    })

    test('hides add button when readonly', () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewTabs
                        board={board}
                        activeView={view1}
                        views={[view1, view2]}
                        readonly={true}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container.querySelector('.ViewTabs__addButton')).not.toBeInTheDocument()
    })

    test('shows active tab correctly', () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewTabs
                        board={board}
                        activeView={view1}
                        views={[view1, view2]}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container.querySelector('.ViewTab--active')).toBeInTheDocument()
    })
})

// 022 — the tab menu follows the view's access mode
// (contracts/ui-surfaces.md U-05~U-07, W-10 · W-11 · W-12).
describe('components/viewHeader/viewTabs access modes', () => {
    const me = 'user-id-1'

    const viewWith = (id: string, title: string, createdBy: string, mode?: 'everyone' | 'admin' | 'private') => {
        const view = TestBlockFactory.createBoardView(board)
        view.id = id
        view.title = title
        view.createdBy = createdBy
        if (mode) {
            view.fields.accessMode = mode
        }
        return view
    }

    const storeAs = (membership: Record<string, unknown>) => mockStateStore([], {
        users: {me: {id: me, username: 'username_1', props: {}}},
        teams: {current: {id: 'team-id'}},
        boards: {
            current: board.id,
            boards: {[board.id]: board},
            templates: [],
            myBoardMemberships: {[board.id]: {userId: me, ...membership}},
        },
    })

    const renderTabs = (membership: Record<string, unknown>, views: ReturnType<typeof viewWith>[], active: ReturnType<typeof viewWith>) => render(
        wrapIntl(
            <ReduxProvider store={storeAs(membership)}>
                <ViewTabs
                    board={board}
                    activeView={active}
                    views={views}
                    readonly={false}
                />
            </ReduxProvider>,
        ),
    )

    beforeEach(() => {
        jest.clearAllMocks()
    })

    // US2 safety nets — proven by flipping viewAccessMode's default to 'admin'
    // and watching them fail (T013).
    test('a view that never chose a mode offers rename, duplicate and delete', async () => {
        const first = viewWith('first', 'First', 'someone-else')
        const second = viewWith('second', 'Second', 'someone-else')
        renderTabs({schemeEditor: true}, [first, second], first)

        await userEvent.click(screen.getByText('First'))

        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.getByText('Duplicate view')).toBeInTheDocument()
        expect(screen.getByText('Delete view')).toBeInTheDocument()
    })

    test('a new view carries no access mode', async () => {
        const first = viewWith('first', 'First', 'someone-else')
        const {container} = renderTabs({schemeEditor: true}, [first], first)

        await userEvent.click(container.querySelector('.ViewTabs__addButton') as HTMLElement)
        await userEvent.click(screen.getByText('Table'))

        expect(mockedMutator.insertBlock).toHaveBeenCalledTimes(1)
        const created = mockedMutator.insertBlock.mock.calls[0][1] as {fields: {accessMode?: string}}
        expect(created.fields.accessMode).toBeUndefined()
    })

    test('W-10 an editor on an admin-only view may only duplicate', async () => {
        const locked = viewWith('locked', 'Locked', 'someone-else', 'admin')
        const other = viewWith('other', 'Other', 'someone-else')
        renderTabs({schemeEditor: true}, [locked, other], locked)

        await userEvent.click(screen.getByText('Locked'))

        expect(screen.queryByText('Rename')).not.toBeInTheDocument()
        expect(screen.queryByText('Delete view')).not.toBeInTheDocument()
        expect(screen.getByText('Duplicate view')).toBeInTheDocument()
    })

    test('W-11 the last shared view cannot be deleted even when a private view remains', async () => {
        const shared = viewWith('shared', 'Shared', 'someone-else')
        const mine = viewWith('mine', 'Mine', me, 'private')
        renderTabs({schemeEditor: true}, [shared, mine], shared)

        await userEvent.click(screen.getByText('Shared'))

        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.queryByText('Delete view')).not.toBeInTheDocument()
    })

    test('W-11 a private view is deletable regardless of the shared count', async () => {
        const shared = viewWith('shared', 'Shared', 'someone-else')
        const mine = viewWith('mine', 'Mine', me, 'private')
        renderTabs({schemeEditor: true}, [shared, mine], mine)

        await userEvent.click(screen.getByText('Mine'))

        expect(screen.getByText('Delete view')).toBeInTheDocument()
    })

    test('W-12 a duplicate starts as everyone\'s view', async () => {
        const locked = viewWith('locked', 'Locked', 'someone-else', 'admin')
        const other = viewWith('other', 'Other', 'someone-else')
        renderTabs({schemeEditor: true}, [locked, other], locked)

        await userEvent.click(screen.getByText('Locked'))
        await userEvent.click(screen.getByText('Duplicate view'))

        expect(mockedMutator.insertBlock).toHaveBeenCalledTimes(1)
        const copy = mockedMutator.insertBlock.mock.calls[0][1] as {fields: {accessMode?: string}}
        expect(copy.fields.accessMode).toBeUndefined()
    })
})
