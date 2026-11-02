// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'

import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'

import {mocked} from 'jest-mock'

import {wrapIntl, mockStateStore} from '../../testUtils'

import {TestBlockFactory} from '../../test/testBlockFactory'

import mutator from '../../mutator'

import EmptyCardButton from './emptyCardButton'

const board = TestBlockFactory.createBoard()
const activeView = TestBlockFactory.createBoardView(board)

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)
describe('components/viewHeader/emptyCardButton', () => {
    const state = {
        users: {
            me: {
                id: 'user-id-1',
                username: 'username_1'},
        },
        teams: {current: {id: 'team-id'}},
        boards: {
            current: board.id,
            boards: {
                [board.id]: board,
            },
        },
        views: {
            current: 0,
            views: [activeView],
        },
    }

    const store = mockStateStore([], state)
    const mockFunction = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })
    test('return EmptyCardButton', () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <EmptyCardButton
                        addCard={mockFunction}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container).toMatchSnapshot()
    })
    test('return EmptyCardButton and addCard', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <EmptyCardButton
                        addCard={mockFunction}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container).toMatchSnapshot()
        const buttonEmpty = screen.getByRole('button', {name: 'Empty card'})
        await userEvent.click(buttonEmpty)
        expect(mockFunction).toBeCalledTimes(1)
    })
    test('return EmptyCardButton and Set Template', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <EmptyCardButton
                        addCard={mockFunction}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = screen.getByRole('button', {name: 'menuwrapper'})
        await userEvent.click(buttonElement)
        expect(container).toMatchSnapshot()
        const buttonDefault = screen.getByRole('button', {name: 'Set as default'})
        await userEvent.click(buttonDefault)
        expect(mockedMutator.clearDefaultTemplate).toBeCalledTimes(1)
    })
})

// 022 U-08 — the default template is view configuration, so an admin-only view
// takes "Set as default" away from everyone but a board admin.
describe('components/viewHeader/emptyCardButton admin-only view', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    const lockedView = TestBlockFactory.createBoardView(board)
    lockedView.id = 'locked-view'
    lockedView.createdBy = 'someone-else'
    lockedView.fields.accessMode = 'admin'

    const renderAs = (membership: Record<string, unknown>) => render(
        wrapIntl(
            <ReduxProvider store={mockStateStore([], {
                users: {me: {id: 'user-id-1', username: 'username_1', props: {}}},
                teams: {current: {id: 'team-id'}},
                boards: {
                    current: board.id,
                    boards: {[board.id]: board},
                    myBoardMemberships: {[board.id]: {userId: 'user-id-1', ...membership}},
                },
                views: {current: lockedView.id, views: {[lockedView.id]: lockedView}},
            })}
            >
                <EmptyCardButton addCard={jest.fn()}/>
            </ReduxProvider>,
        ),
    )

    test('an editor sees the item disabled and cannot trigger it', async () => {
        renderAs({schemeEditor: true})
        await userEvent.click(screen.getByRole('button', {name: 'menuwrapper'}))

        const item = screen.getByRole('button', {name: 'Set as default'})
        expect(item).toHaveClass('menu-option--disabled')
        await userEvent.click(item)
        expect(mockedMutator.clearDefaultTemplate).not.toHaveBeenCalled()
    })

    test('a board admin keeps it', async () => {
        renderAs({schemeAdmin: true})
        await userEvent.click(screen.getByRole('button', {name: 'menuwrapper'}))

        expect(screen.getByRole('button', {name: 'Set as default'})).not.toHaveClass('menu-option--disabled')
    })
})
