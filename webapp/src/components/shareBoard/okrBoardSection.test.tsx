// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import configureStore from 'redux-mock-store'

import {wrapIntl} from '../../testUtils'
import {Board} from '../../blocks/board'
import mutator from '../../mutator'

import OkrBoardSection from './okrBoardSection'

jest.mock('../../mutator')
const mockedMutator = jest.mocked(mutator)

// The switch says whether this board is an OKR board. What it turns on is the
// filling; the property and the values a card already carries are not its to
// take away (FR-011).
describe('components/shareBoard/okrBoardSection', () => {
    const mockStore = configureStore([])

    const renderSection = (
        properties: Board['properties'] = {},
        membership: Record<string, unknown> = {userId: 'user-1', schemeAdmin: true},
    ) => {
        const board = {
            id: 'board-1',
            teamId: 'team-1',
            cardProperties: [],
            properties,
        } as unknown as Board

        // The section sits behind a board permission gate, which reads the
        // current team and the viewer's membership.
        const state = {
            teams: {current: {id: 'team-1'}},
            boards: {
                current: board.id,
                boards: {[board.id]: board},
                myBoardMemberships: {[board.id]: membership},
            },
            users: {me: {id: 'user-1'}},
        }

        const result = render(wrapIntl(
            <ReduxProvider store={mockStore(state)}>
                <OkrBoardSection board={board}/>
            </ReduxProvider>,
        ))
        return {board, ...result}
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('shows the switch off on a board that was never switched on', () => {
        const {container} = renderSection()

        expect(screen.getByText(/OKR Board/)).toBeDefined()
        expect(container.querySelector('.Switch.on')).toBeNull()
    })

    test('shows the switch on when the board carries settings', () => {
        const {container} = renderSection({okrBoard: {propertyId: 'p-type', levels: ['a', 'b', 'c']}})

        expect(container.querySelector('.Switch.on')).not.toBeNull()
    })

    test('turning it on prepares the board', async () => {
        const {board, container} = renderSection()

        await userEvent.click(container.querySelector('.Switch')!)

        expect(mockedMutator.enableOkrBoard).toHaveBeenCalledWith(board)
        expect(mockedMutator.disableOkrBoard).not.toHaveBeenCalled()
    })

    test('turning it off only stops the filling', async () => {
        const {board, container} = renderSection({okrBoard: {propertyId: 'p-type', levels: ['a', 'b', 'c']}})

        await userEvent.click(container.querySelector('.Switch')!)

        expect(mockedMutator.disableOkrBoard).toHaveBeenCalledWith(board)
        expect(mockedMutator.enableOkrBoard).not.toHaveBeenCalled()
    })

    test('a malformed stored value reads as off rather than breaking the dialog', () => {
        const {container} = renderSection({okrBoard: 'on'})

        expect(container.querySelector('.Switch.on')).toBeNull()
    })

    // What kind of board this is belongs to whoever runs the board. An editor
    // seeing the switch would be shown a control the server refuses, and the one
    // that matters — switching a live OKR board off — takes the ladder away from
    // everybody at once.
    test('an editor is not shown the switch at all', () => {
        const {container} = renderSection(
            {okrBoard: {propertyId: 'p-type', levels: ['a', 'b', 'c']}},
            {userId: 'user-1', schemeEditor: true},
        )

        expect(screen.queryByText(/OKR Board/)).toBeNull()
        expect(container.querySelector('.Switch')).toBeNull()
    })

    test('a board admin is still shown the switch', () => {
        const {container} = renderSection(
            {okrBoard: {propertyId: 'p-type', levels: ['a', 'b', 'c']}},
            {userId: 'user-1', schemeAdmin: true},
        )

        expect(screen.getByText(/OKR Board/)).toBeDefined()
        expect(container.querySelector('.Switch.on')).not.toBeNull()
    })
})
