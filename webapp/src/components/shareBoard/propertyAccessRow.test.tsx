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

    test('duties are offered in the order the server sends them', async () => {
        // The server orders by rank, then name; the selector must not reshuffle.
        const {container} = await renderRow({...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'})

        await openSelector(container, 4)

        const options = Array.from(document.querySelectorAll('.MenuOption')).map((node) => node.textContent)
        const head = options.findIndex((text) => text?.includes('본부장'))
        const lead = options.findIndex((text) => text?.includes('팀장'))

        expect(head).toBeGreaterThan(-1)
        expect(lead).toBeGreaterThan(head)
    })

    test('a duty is stored by id, not by name or code', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'}
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 4)
        await userEvent.click(screen.getByText('본부장'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({dutyId: 'duty-head'}))
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

    // ---- 009 US1: 조직을 이름이 아니라 관계로 고른다 ----
    //
    // 조직 칸 하나가 관계와 특정 조직을 함께 담는다. 칸을 늘리지 않는 이유는 하나다 —
    // 둘은 같은 질문에 대한 두 가지 답이라 나란히 두면 어느 쪽이 답인지 화면이 말해주지
    // 못한다.

    test('조직 칸이 관계 다섯을 내놓는다', async () => {
        const {container} = await renderRow({...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'})

        await openSelector(container, 2)

        expect(screen.queryByText('같은 본부')).not.toBeNull()
        expect(screen.queryByText('다른 본부')).not.toBeNull()
        expect(screen.queryByText('같은 부서')).not.toBeNull()
        expect(screen.queryByText('본인')).not.toBeNull()
    })

    test('조직 칸이 특정 조직도 함께 내놓는다', async () => {
        const {container} = await renderRow({...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'})

        await openSelector(container, 2)

        expect(screen.queryByText('전략본부')).not.toBeNull()
    })

    test('관계를 고르면 관계로 저장하고 절대값을 비운다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: 'div-strategy'}
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 2)
        await userEvent.click(screen.getByText('같은 본부'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            relation: 'sameDivision',
            divisionId: '',
            departmentId: '',
        }))
    })

    test('특정 조직을 고르면 관계를 비운다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', relation: 'sameDivision' as const}
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 2)
        await userEvent.click(screen.getByText('전략본부'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            relation: '',
            divisionId: 'div-strategy',
        }))
    })

    test('관계가 빈 옛 규칙은 부서 칸을 그대로 보여준다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: 'div-strategy'}
        const {container} = await renderRow(rule)

        await openSelector(container, 3)

        expect(screen.queryByText('경영개선팀')).not.toBeNull()
    })

    test('본부 관계를 고르면 다음 칸이 볼 속성을 묻는다', async () => {
        const withOrgProperty = {
            ...board,
            cardProperties: [
                ...board.cardProperties,
                {id: 'prop-division', name: '주관 본부', type: 'orgDivision' as const, options: []},
                {id: 'prop-support', name: '협조 본부', type: 'orgDivision' as const, options: []},
            ],
        }
        const store = mockStateStore([thunk], state)
        const onChange = jest.fn()
        let container: Element | undefined
        await act(async () => {
            container = render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <PropertyAccessRow
                        board={withOrgProperty}
                        rule={{...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', relation: 'sameDivision'}}
                        onChange={onChange}
                        onDelete={jest.fn()}
                    />
                </ReduxProvider>)).container
        })

        await openSelector(container!, 3)

        expect(screen.queryByText('주관 본부')).not.toBeNull()
        expect(screen.queryByText('협조 본부')).not.toBeNull()
    })

    test('조직 속성이 하나뿐이면 볼 속성이 자동으로 채워진다', async () => {
        const oneOrgProperty = {
            ...board,
            cardProperties: [
                ...board.cardProperties,
                {id: 'prop-division', name: '본부', type: 'orgDivision' as const, options: []},
            ],
        }
        const store = mockStateStore([thunk], state)
        const onChange = jest.fn()
        await act(async () => {
            render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <PropertyAccessRow
                        board={oneOrgProperty}
                        rule={{...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'}}
                        onChange={onChange}
                        onDelete={jest.fn()}
                    />
                </ReduxProvider>))
        })

        const relationButton = document.querySelectorAll('.user-item__button')[2]
        await userEvent.click(relationButton)
        await userEvent.click(screen.getByText('같은 본부'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            relation: 'sameDivision',
            orgPropertyId: 'prop-division',
        }))
    })

    test('관계를 쓰면 사람 쪽 조건이 있는 것으로 세어 유효해진다', async () => {
        const rule = {
            ...emptyRule,
            propertyId: 'prop-clevel',
            propertyValueId: 'opt-strategy',
            relation: 'mine' as const,
        }
        const {container} = await renderRow(rule)

        expect(container.querySelector('.PropertyAccessRow--invalid')).toBeNull()
    })

    test('the delete button reports the row', async () => {
        const {container, onDelete} = await renderRow(emptyRule)

        const remove = container.querySelector('.PropertyAccessRow__delete')
        expect(remove).not.toBeNull()
        await userEvent.click(remove!)

        expect(onDelete).toHaveBeenCalledWith('r1')
    })
})
