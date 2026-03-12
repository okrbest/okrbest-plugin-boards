// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'
import '@testing-library/jest-dom'

import {TestBlockFactory} from '../../test/testBlockFactory'
import {wrapIntl, mockStateStore} from '../../testUtils'

import ViewTabs from './viewTabs'

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
