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
            {id: 'opt-research', value: '연구', color: 'propColorYellow'},
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
    dutyTiers: {
        tiersByTeamId: {
            'team-id': [
                {id: 'tier-clevel', name: '임원진', dutyIds: ['duty-head']},
                {id: 'tier-lead', name: '리더', dutyIds: ['duty-lead']},
            ],
        },
        canEditByTeamId: {'team-id': true},
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

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({propertyValueIds: ['opt-strategy']}))
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

    test('a row missing its card condition says so', async () => {
        const {container} = await renderRow(emptyRule)

        const notice = container.querySelector('.PropertyAccessRow__pending')
        expect(notice).not.toBeNull()
        expect(notice!.textContent).toContain('not saved')
    })

    test('a row missing only its subject condition names that axis', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'}
        const {container} = await renderRow(rule)

        const notice = container.querySelector('.PropertyAccessRow__pending')
        expect(notice).not.toBeNull()
        expect(notice!.textContent).toContain('organisation')
    })

    test('a complete row carries no pending notice', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', dutyId: 'duty-lead'}
        const {container} = await renderRow(rule)

        expect(container.querySelector('.PropertyAccessRow__pending')).toBeNull()
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

    // 실제 보드는 본부 속성과 부서 속성을 하나씩 가진다. 둘을 한 묶음으로 세면
    // 개수가 둘이 되어 자동 채우기가 꺼졌고, 빈 채로 저장된 규칙을 서버가
    // "relation needs orgPropertyId"로 되돌려 보냈다 — 화면에는 표시 없이.
    const bothOrgKinds = () => ({
        ...board,
        cardProperties: [
            ...board.cardProperties,
            {id: 'prop-division', name: '본부', type: 'orgDivision' as const, options: []},
            {id: 'prop-department', name: '부서', type: 'orgDepartment' as const, options: []},
        ],
    })

    const pickRelation = async (boardOverride: typeof board, name: string) => {
        const store = mockStateStore([thunk], state)
        const onChange = jest.fn()
        await act(async () => {
            render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <PropertyAccessRow
                        board={boardOverride}
                        rule={{...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'}}
                        onChange={onChange}
                        onDelete={jest.fn()}
                    />
                </ReduxProvider>))
        })
        await userEvent.click(document.querySelectorAll('.user-item__button')[2])
        await userEvent.click(screen.getByText(name))
        return onChange
    }

    test('본부 관계는 본부 속성을 골라 채운다', async () => {
        const onChange = await pickRelation(bothOrgKinds(), '같은 본부')

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            relation: 'sameDivision',
            orgPropertyId: 'prop-division',
        }))
    })

    test('부서 관계는 부서 속성을 골라 채운다', async () => {
        const onChange = await pickRelation(bothOrgKinds(), '같은 부서')

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            relation: 'sameDepartment',
            orgPropertyId: 'prop-department',
        }))
    })

    test('본인 관계도 부서 속성을 읽는다', async () => {
        // 매트릭스가 오래 전부터 그렇게 판단해 왔다(accessMatrix.orgPropertyFor).
        // "내 것"은 누구 카드인가와 어디 놓였는가를 함께 묻는다 — 조직을 빼면
        // 만드는 순간 작성자라는 사실만으로 어느 팀 Task든 만들 수 있다.
        const onChange = await pickRelation(bothOrgKinds(), '본인')

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            relation: 'mine',
            orgPropertyId: 'prop-department',
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

    // ---- 009 US2: 직책 칸이 묶음을 가리킨다 ----

    test('직책 칸이 팀 묶음을 내놓는다', async () => {
        const {container} = await renderRow({...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'})

        await openSelector(container, 4)

        expect(screen.queryByText('임원진')).not.toBeNull()
    })

    test('묶음을 고르면 tierIds로 저장한다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy'}
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 4)
        await userEvent.click(screen.getByText('임원진'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            tierIds: ['tier-clevel'],
            dutyId: '',
        }))
    })

    test('tierIds가 빈 옛 규칙은 직책을 그대로 보여준다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', dutyId: 'duty-head'}
        const {container} = await renderRow(rule)

        const label = container.querySelectorAll('.user-item__button')[4].textContent

        expect(label).toContain('본부장')
    })

    test('묶음을 쓰면 사람 쪽 조건이 있는 것으로 센다', async () => {
        const rule = {
            ...emptyRule,
            propertyId: 'prop-clevel',
            propertyValueId: 'opt-strategy',
            tierIds: ['tier-clevel'],
        }
        const {container} = await renderRow(rule)

        expect(container.querySelector('.PropertyAccessRow--invalid')).toBeNull()
    })

    test('없는 묶음을 가리키면 깨진 규칙으로 표시한다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', tierIds: ['tier-gone']}
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

    // The value axis holds several values at once. The label reports the state
    // rather than listing every name, and the menu toggles values without closing.
    const valueLabel = (container: Element): string | null =>
        container.querySelectorAll('.user-item__button')[1].querySelector('.PropertyAccessRow__label')!.textContent

    test('속성값 하나면 그 값 이름을 보여준다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', propertyValueIds: ['opt-strategy']}
        const {container} = await renderRow(rule)

        expect(valueLabel(container)).toBe('전략')
    })

    test('속성값을 모두 고르면 전체로 표시한다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', propertyValueIds: ['opt-strategy', 'opt-production', 'opt-research']}
        const {container} = await renderRow(rule)

        expect(valueLabel(container)).toBe('전체')
    })

    test('속성값이 여럿이지만 전부는 아니면 개수로 표시한다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', propertyValueIds: ['opt-strategy', 'opt-research']}
        const {container} = await renderRow(rule)

        expect(valueLabel(container)).toBe('2개 선택')
    })

    test('레거시 단수 propertyValueId도 값 이름으로 보여준다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: 'opt-production'}
        const {container} = await renderRow(rule)

        expect(valueLabel(container)).toBe('생산')
    })

    test('속성값을 토글하면 목록에 더하고 메뉴는 열린 채로 둔다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', propertyValueIds: ['opt-strategy']}
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 1)
        await userEvent.click(screen.getByText('생산'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            propertyValueIds: ['opt-strategy', 'opt-production'],
            propertyValueId: '',
        }))

        // 메뉴가 닫히지 않아 다른 값도 이어서 고를 수 있다.
        expect(screen.queryByText('연구')).not.toBeNull()
    })

    // 전체는 그날의 옵션 목록이 아니라 의도다. 나열해서 담으면 나중에 추가된
    // 값이 규칙 밖에 남아, 값을 만들 때마다 규칙을 손봐야 했다.
    test('전체를 고르면 나열하지 않고 allValues로 담는다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', propertyValueIds: ['opt-strategy']}
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 1)
        await userEvent.click(screen.getByText('전체'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            allValues: true,
            propertyValueIds: [],
            propertyValueId: '',
        }))
    })

    test('allValues 규칙은 전체로 표시한다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', allValues: true}
        const {container} = await renderRow(rule)

        expect(valueLabel(container)).toBe('전체')
    })

    test('allValues에서는 모든 값에 체크가 켜져 있다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', allValues: true}
        const {container} = await renderRow(rule)

        await openSelector(container, 1)

        // 전체 한 줄 + 값 세 줄 = 체크 넷.
        expect(document.querySelectorAll('.CheckIcon').length).toBe(4)
    })

    // 화면에는 모든 값에 체크가 켜져 있다. 그중 하나를 누르면 그 하나가 꺼지는
    // 것이 눈에 보이는 대로의 결과다 — 누른 값 하나만 남기면 나머지를 조용히
    // 버리게 된다.
    test('allValues에서 값 하나를 끄면 나머지가 전부 남는다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', allValues: true}
        const {container, onChange} = await renderRow(rule)

        await openSelector(container, 1)
        await userEvent.click(screen.getByText('생산'))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            allValues: false,
            propertyValueIds: ['opt-strategy', 'opt-research'],
            propertyValueId: '',
        }))
    })

    test('속성을 고르면 값 축이 비워지고 전체 선택도 풀린다', async () => {
        const rule = {...emptyRule, propertyId: 'prop-clevel', propertyValueId: '', allValues: true}
        const {container, onChange} = await renderRow(rule)

        // 닫힌 버튼에도 같은 이름이 찍혀 있으므로 메뉴 쪽 항목을 고른다.
        await openSelector(container, 0)
        const options = screen.getAllByText('C-Level')
        await userEvent.click(options[options.length - 1])

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            allValues: false,
            propertyValueIds: [],
        }))
    })
})
