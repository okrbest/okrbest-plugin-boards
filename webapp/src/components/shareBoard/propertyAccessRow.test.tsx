// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import {thunk} from 'redux-thunk'

import React from 'react'

import {PropertyAccessRule} from '../../blocks/board'
import {TestBlockFactory} from '../../test/testBlockFactory'
import {mockStateStore, wrapDNDIntl} from '../../testUtils'

import PropertyAccessRow from './propertyAccessRow'

const board = TestBlockFactory.createBoard()
board.id = 'board-1'
board.teamId = 'team-id'
board.cardProperties = [
    {
        id: 'prop-clevel',
        name: 'C-Level',
        type: 'select',
        options: [
            {id: 'opt-strategy', value: '전략', color: 'propColorBrown'},
            {id: 'opt-production', value: '생산', color: 'propColorBlue'},
        ],
    },
]

const state = {
    teams: {
        current: {id: 'team-id', title: 'Test Team'},
    },
    boards: {
        current: board.id,
        boards: {[board.id]: board},
        myBoardMemberships: {[board.id]: {userId: 'user-1', schemeAdmin: true}},
    },
    orgMaster: {
        orgUnitsByTeamId: {
            'team-id': [
                {id: 'div-strategy', name: '전략본부', type: 'division', parentId: ''},
                {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
                {id: 'dep-planning', name: '경영개선팀', type: 'department', parentId: 'div-strategy'},
                {id: 'dep-factory', name: '생산1팀', type: 'department', parentId: 'div-production'},
            ],
        },
        dutiesByTeamId: {
            'team-id': [
                {id: 'duty-head', code: 'duty-2', name: '본부장', rank: 2, fullVisibility: true},
                {id: 'duty-lead', code: 'duty-3', name: '팀장', rank: 3, fullVisibility: false},
            ],
        },
        loadedTeamIds: ['team-id'],
    },
}

const emptyRule: PropertyAccessRule = {
    id: 'r1',
    propertyId: '',
    propertyValueId: '',
    divisionId: '',
    departmentId: '',
    dutyId: '',
    permission: 'viewer',
}

const renderRow = async (rule: PropertyAccessRule, onChange = jest.fn(), onDelete = jest.fn()) => {
    const store = mockStateStore([thunk], state)
    let container: Element | undefined
    await act(async () => {
        const result = render(
            wrapDNDIntl(
                <ReduxProvider store={store}>
                    <PropertyAccessRow
                        board={board}
                        rule={rule}
                        onChange={onChange}
                        onDelete={onDelete}
                    />
                </ReduxProvider>),
        )
        container = result.container
    })
    return {container: container!, onChange, onDelete}
}

// Open the nth selector button of the row and return its menu options.
const openSelector = async (container: Element, index: number) => {
    const buttons = container.querySelectorAll('.user-item__button')
    expect(buttons.length).toBe(6)
    await userEvent.click(buttons[index])
}

describe('src/components/shareBoard/propertyAccessRow', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('reuses the member row controls rather than introducing new ones', async () => {
        const {container} = await renderRow(emptyRule)

        expect(container.querySelector('.user-item')).not.toBeNull()
        expect(container.querySelectorAll('.user-item__button').length).toBe(6)
    })

    test('property values are chained to the chosen property', async () => {
        const {container} = await renderRow(emptyRule)

        await openSelector(container, 1)
        expect(screen.queryByText('전략')).toBeNull()
    })

    test('choosing a property offers that property\'s options', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel'}
        const {container} = await renderRow(rule)

        await openSelector(container, 1)
        expect(screen.queryByText('전략')).not.toBeNull()
        expect(screen.queryByText('생산')).not.toBeNull()
    })

    test('departments are chained to the chosen division', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: 'div-strategy'}
        const {container} = await renderRow(rule)

        await openSelector(container, 3)
        expect(screen.queryByText('경영개선팀')).not.toBeNull()
        expect(screen.queryByText('생산1팀')).toBeNull()
    })

    test('a selection is reported as an id, not a name', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel'}
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 1)
        await userEvent.click(screen.getByText('전략'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({propertyValueId: 'opt-strategy'}))
    })

    test('changing the division clears a department that no longer belongs to it', async () => {
        const rule = {
            ...emptyRule,
            propertyId: 'prop-clevel',
            propertyValueId: 'opt-strategy',
            divisionId: 'div-strategy',
            departmentId: 'dep-planning',
        }
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 2)
        await userEvent.click(screen.getByText('생산본부'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            divisionId: 'div-production',
            departmentId: '',
        }))
    })

    test('an incomplete row is marked invalid', async () => {
        const {container} = await renderRow(emptyRule)

        expect(container.querySelector('.PropertyAccessRow--invalid')).not.toBeNull()
    })

    test('a row with a card condition but no subject condition is invalid', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'}
        const {container} = await renderRow(rule)

        expect(container.querySelector('.PropertyAccessRow--invalid')).not.toBeNull()
    })

    test('a row with a card condition and one subject axis is valid', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', dutyId: 'duty-lead'}
        const {container} = await renderRow(rule)

        expect(container.querySelector('.PropertyAccessRow--invalid')).toBeNull()
    })

    test('a reference that no longer exists is flagged', async () => {
        const rule = {...emptyRule, propertyId: 'prop-gone', propertyValueId: 'opt-gone', dutyId: 'duty-gone'}
        const {container} = await renderRow(rule)

        expect(container.querySelectorAll('.PropertyAccessRow__broken').length).toBeGreaterThan(0)
    })

    test('the delete button reports the row', async () => {
        const {container, onDelete} = await renderRow(emptyRule)

        const remove = container.querySelector('.PropertyAccessRow__delete')
        expect(remove).not.toBeNull()
        await userEvent.click(remove!)

        expect(onDelete).toHaveBeenCalledWith('r1')
    })
})
