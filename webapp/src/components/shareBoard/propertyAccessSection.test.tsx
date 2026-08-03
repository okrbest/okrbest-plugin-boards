// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import {thunk} from 'redux-thunk'

import React from 'react'
import {mocked} from 'jest-mock'

import {Board, PropertyAccessSettings} from '../../blocks/board'
import {TestBlockFactory} from '../../test/testBlockFactory'
import {mockStateStore, wrapDNDIntl} from '../../testUtils'
import mutator from '../../mutator'
import octoClient from '../../octoClient'

import PropertyAccessSection from './propertyAccessSection'

jest.mock('../../mutator')
jest.mock('../../octoClient')

const mockedMutator = mocked(mutator, true)
const mockedOctoClient = mocked(octoClient, true)

const buildBoard = (properties: Board['properties'] = {}): Board => {
    const board = TestBlockFactory.createBoard()
    board.id = 'board-1'
    board.teamId = 'team-id'
    board.cardProperties = [
        {
            id: 'prop-clevel',
            name: 'C-Level',
            type: 'select',
            options: [{id: 'opt-strategy', value: '전략', color: 'propColorBrown'}],
        },
    ]
    board.properties = properties
    return board
}

const buildState = (board: Board, schemeAdmin: boolean) => ({
    teams: {
        current: {id: 'team-id', title: 'Test Team'},
    },
    users: {
        me: {id: 'user-1', username: 'user1', props: {}, roles: 'system_user'},
        boardUsers: {'user-1': {id: 'user-1', username: 'user1'}},
        blockSubscriptions: [],
    },
    boards: {
        current: board.id,
        boards: {[board.id]: board},
        myBoardMemberships: {
            [board.id]: {userId: 'user-1', boardId: board.id, schemeAdmin, schemeEditor: !schemeAdmin},
        },
    },
    orgMaster: {
        orgUnitsByTeamId: {},
        dutiesByTeamId: {},
        loadedTeamIds: [],
    },
    clientConfig: {
        value: {teammateNameDisplay: 'username'},
    },
})

const renderSection = async (board: Board, schemeAdmin = true) => {
    const store = mockStateStore([thunk], buildState(board, schemeAdmin))
    let container: Element | undefined
    await act(async () => {
        const result = render(
            wrapDNDIntl(
                <ReduxProvider store={store}>
                    <PropertyAccessSection board={board}/>
                </ReduxProvider>),
        )
        container = result.container
    })
    return {container: container!, store}
}

describe('src/components/shareBoard/propertyAccessSection', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockedOctoClient.getOrgUnits.mockResolvedValue([])
        mockedOctoClient.getDuties.mockResolvedValue([])
    })

    test('is hidden from a user who cannot manage board roles', async () => {
        const {container} = await renderSection(buildBoard(), false)

        expect(container.querySelector('.PropertyAccessSection')).toBeNull()
    })

    test('is shown to a board admin', async () => {
        const {container} = await renderSection(buildBoard())

        expect(container.querySelector('.PropertyAccessSection')).not.toBeNull()
    })

    test('the switch is off on a board that has never had rules', async () => {
        const {container} = await renderSection(buildBoard())

        const toggle = container.querySelector('.Switch')
        expect(toggle).not.toBeNull()
        expect(toggle!.className).not.toContain(' on')
    })

    test('the switch reflects a saved rule set', async () => {
        const board = buildBoard({
            propertyAccess: {enabled: true, updatedBy: '', updatedAt: 0, rules: []},
        })
        const {container} = await renderSection(board)

        expect(container.querySelector('.Switch')!.className).toContain(' on')
    })

    test('a header names each column once rules exist', async () => {
        const board = buildBoard({
            propertyAccess: {
                enabled: true,
                updatedBy: '',
                updatedAt: 0,
                rules: [
                    {id: 'r1', propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: 'div-strategy', departmentId: '', dutyId: '', permission: 'viewer'},
                ],
            },
        })
        const {container} = await renderSection(board)

        const header = container.querySelector('.PropertyAccessSection__header')
        expect(header).not.toBeNull()
        expect(header!.querySelectorAll('.PropertyAccessSection__column').length).toBe(6)
    })

    test('an empty rule list shows no header', async () => {
        const {container} = await renderSection(buildBoard())

        expect(container.querySelector('.PropertyAccessSection__header')).toBeNull()
    })

    test('existing rules are listed', async () => {
        const board = buildBoard({
            propertyAccess: {
                enabled: true,
                updatedBy: '',
                updatedAt: 0,
                rules: [
                    {id: 'r1', propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: 'div-strategy', departmentId: '', dutyId: '', permission: 'viewer'},
                    {id: 'r2', propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: '', departmentId: '', dutyId: 'duty-head', permission: 'editor'},
                ],
            },
        })
        const {container} = await renderSection(board)

        expect(container.querySelectorAll('.PropertyAccessRow').length).toBe(2)
    })

    // US5-1 and US5-2.
    test('a board that never saved rules shows no change record', async () => {
        const {container} = await renderSection(buildBoard())

        expect(container.querySelector('.PropertyAccessSection__updated')).toBeNull()
    })

    test('a saved rule set names who changed it and when', async () => {
        const board = buildBoard({
            propertyAccess: {enabled: true, updatedBy: 'user-1', updatedAt: 1767225600000, rules: []},
        })
        const {container} = await renderSection(board)

        const updated = container.querySelector('.PropertyAccessSection__updated')
        expect(updated).not.toBeNull()
        expect(updated!.textContent).toContain('user1')
    })

    test('an unknown last editor does not blank the record', async () => {
        const board = buildBoard({
            propertyAccess: {enabled: true, updatedBy: 'someone-who-left', updatedAt: 1767225600000, rules: []},
        })
        const {container} = await renderSection(board)

        const updated = container.querySelector('.PropertyAccessSection__updated')
        expect(updated).not.toBeNull()
        expect(updated!.textContent).not.toBe('')
    })

    test('the organisation master is fetched for the board team', async () => {
        await renderSection(buildBoard())

        expect(mockedOctoClient.getOrgUnits).toHaveBeenCalledWith('team-id')
        expect(mockedOctoClient.getDuties).toHaveBeenCalledWith('team-id')
    })

    test('adding a row does not save until the row is complete', async () => {
        const {container} = await renderSection(buildBoard())

        await userEvent.click(container.querySelector('.PropertyAccessSection__add')!)

        expect(container.querySelectorAll('.PropertyAccessRow').length).toBe(1)
        expect(mockedMutator.updateBoard).not.toHaveBeenCalled()
    })

    test('toggling the switch saves the board', async () => {
        const {container} = await renderSection(buildBoard())

        await act(async () => {
            await userEvent.click(container.querySelector('.Switch')!)
        })

        expect(mockedMutator.updateBoard).toHaveBeenCalled()
        const [newBoard] = mockedMutator.updateBoard.mock.calls[0]
        expect((newBoard.properties.propertyAccess as PropertyAccessSettings).enabled).toBe(true)
    })

    test('incomplete rows are dropped from what is saved', async () => {
        const board = buildBoard({
            propertyAccess: {
                enabled: false,
                updatedBy: '',
                updatedAt: 0,
                rules: [
                    {id: 'r1', propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: 'div-strategy', departmentId: '', dutyId: '', permission: 'viewer'},
                    {id: 'r2', propertyId: '', propertyValueId: '', divisionId: '', departmentId: '', dutyId: '', permission: 'viewer'},
                ],
            },
        })
        const {container} = await renderSection(board)

        await act(async () => {
            await userEvent.click(container.querySelector('.Switch')!)
        })

        const [newBoard] = mockedMutator.updateBoard.mock.calls[0]
        const saved = newBoard.properties.propertyAccess as PropertyAccessSettings
        expect(saved.rules).toHaveLength(1)
    })
})
