// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'

import '@testing-library/jest-dom'

import {TestBlockFactory} from '../../test/testBlockFactory'

import {wrapIntl, mockStateStore} from '../../testUtils'

import ViewHeader from './viewHeader'

const board = TestBlockFactory.createBoard()
const activeView = TestBlockFactory.createBoardView(board)
const card = TestBlockFactory.createCard(board)
const card2 = TestBlockFactory.createCard(board)

jest.mock('react-router-dom', () => {
    const originalModule = jest.requireActual('react-router-dom')

    return {
        ...originalModule,
        useParams: jest.fn(() => ({
            boardId: 'board-id',
            viewId: 'view-id',
        })),
        useNavigate: jest.fn(() => jest.fn()),
        useLocation: jest.fn(() => ({pathname: '/board/view', search: ''})),
    }
})

describe('components/viewHeader/viewHeader', () => {
    const state = {
        users: {
            me: {
                id: 'user-id-1',
                username: 'username_1',
                props: {},
            },
        },
        searchText: {
        },
        teams: {
            current: {id: 'team-id'},
        },
        boards: {
            current: board.id,
            boards: {
                [board.id]: board,
            },
            templates: [],
            myBoardMemberships: {
                [board.id]: {userId: 'user_id_1', schemeAdmin: true},
            },
        },
        cards: {
            templates: [card],
            cards: {
                [card2.id]: card2,
            },
            current: card2.id,
        },
        views: {
            views: {
                boardView: activeView,
            },
            current: 'boardView',
        },
        limits: {
            limits: {
                views: 0,
            },
        },
    }
    const store = mockStateStore([], state)
    test('return viewHeader', () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeader
                        board={board}
                        activeView={activeView}
                        views={[activeView]}
                        cards={[card]}
                        groupByProperty={board.cardProperties[0]}
                        addCard={jest.fn()}
                        addCardFromTemplate={jest.fn()}
                        addCardTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container).toMatchSnapshot()
    })
    test('renders the access menu after the sort menu (022 FR-019)', () => {
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeader
                        board={board}
                        activeView={activeView}
                        views={[activeView]}
                        cards={[card]}
                        groupByProperty={board.cardProperties[0]}
                        addCard={jest.fn()}
                        addCardFromTemplate={jest.fn()}
                        addCardTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )
        // Each menu is a wrapper (role button) around a Button, so the same
        // label appears twice; the last 'Sort' is the sort Button itself and
        // the access wrapper must come right after it.
        const buttons = screen.getAllByRole('button').map((b) => b.textContent)
        const sortIndex = buttons.lastIndexOf('Sort')
        const accessIndex = buttons.indexOf('Everyone')
        expect(sortIndex).toBeGreaterThan(-1)
        expect(accessIndex).toBe(sortIndex + 1)
    })
    test('return viewHeader without permissions', () => {
        const localStore = mockStateStore([], {...state, teams: {current: undefined}})
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={localStore}>
                    <ViewHeader
                        board={board}
                        activeView={activeView}
                        views={[activeView]}
                        cards={[card]}
                        groupByProperty={board.cardProperties[0]}
                        addCard={jest.fn()}
                        addCardFromTemplate={jest.fn()}
                        addCardTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container).toMatchSnapshot()
    })
    test('return viewHeader readonly', () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeader
                        board={board}
                        activeView={activeView}
                        views={[activeView]}
                        cards={[card]}
                        groupByProperty={board.cardProperties[0]}
                        addCard={jest.fn()}
                        addCardFromTemplate={jest.fn()}
                        addCardTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                        readonly={true}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container).toMatchSnapshot()
    })
})

// 022 — an admin-only view locks its configuration menus for everyone but a
// board admin (contracts/ui-surfaces.md U-01, W-08 · W-09).
describe('components/viewHeader/viewHeader admin-only view', () => {
    const lockedView = TestBlockFactory.createBoardView(board)
    lockedView.id = 'locked-view'
    lockedView.createdBy = 'someone-else'
    lockedView.fields.accessMode = 'admin'

    const renderAs = (membership: Record<string, unknown>) => {
        const store = mockStateStore([], {
            users: {me: {id: 'user-id-1', username: 'username_1', props: {}}},
            searchText: {},
            teams: {current: {id: 'team-id'}},
            boards: {
                current: board.id,
                boards: {[board.id]: board},
                templates: [],
                myBoardMemberships: {[board.id]: {userId: 'user-id-1', ...membership}},
            },
            cards: {templates: [card], cards: {[card2.id]: card2}, current: card2.id},
            views: {views: {[lockedView.id]: lockedView}, current: lockedView.id},
            limits: {limits: {views: 0}},
        })
        return render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeader
                        board={board}
                        activeView={lockedView}
                        views={[lockedView]}
                        cards={[card]}
                        groupByProperty={board.cardProperties[0]}
                        addCard={jest.fn()}
                        addCardFromTemplate={jest.fn()}
                        addCardTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )
    }

    const lastButton = (name: string) => screen.getAllByRole('button', {name}).pop() as HTMLElement

    // US2 safety net — proven by flipping viewAccessMode's default to 'admin'
    // and watching this fail (T013).
    test('a view that never chose a mode keeps every menu open for an editor', () => {
        const plainView = TestBlockFactory.createBoardView(board)
        plainView.id = 'plain-view'
        plainView.createdBy = 'someone-else'
        const store = mockStateStore([], {
            users: {me: {id: 'user-id-1', username: 'username_1', props: {}}},
            searchText: {},
            teams: {current: {id: 'team-id'}},
            boards: {
                current: board.id,
                boards: {[board.id]: board},
                templates: [],
                myBoardMemberships: {[board.id]: {userId: 'user-id-1', schemeEditor: true}},
            },
            cards: {templates: [card], cards: {[card2.id]: card2}, current: card2.id},
            views: {views: {[plainView.id]: plainView}, current: plainView.id},
            limits: {limits: {views: 0}},
        })
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeader
                        board={board}
                        activeView={plainView}
                        views={[plainView]}
                        cards={[card]}
                        groupByProperty={board.cardProperties[0]}
                        addCard={jest.fn()}
                        addCardFromTemplate={jest.fn()}
                        addCardTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )

        expect(screen.getByRole('button', {name: 'Filter'})).toBeEnabled()
        expect(lastButton('Sort')).toBeEnabled()
        expect(lastButton('Properties')).toBeEnabled()
        expect(screen.getByRole('button', {name: 'Everyone'})).toBeInTheDocument()
    })

    test('W-08 an editor sees the configuration menus disabled with the admin-only notice', () => {
        renderAs({schemeEditor: true})

        const filter = screen.getByRole('button', {name: 'Filter'})
        expect(filter).toBeDisabled()
        expect(filter).toHaveAttribute('title', 'Only board admins can change this view.')
        expect(lastButton('Sort')).toBeDisabled()
        expect(lastButton('Properties')).toBeDisabled()
    })

    test('W-09 a board admin keeps every menu', () => {
        renderAs({schemeAdmin: true})

        expect(screen.getByRole('button', {name: 'Filter'})).toBeEnabled()
        expect(lastButton('Sort')).toBeEnabled()
        expect(lastButton('Properties')).toBeEnabled()
    })
})
