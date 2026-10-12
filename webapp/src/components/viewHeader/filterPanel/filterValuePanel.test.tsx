// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {fireEvent, render, screen} from '@testing-library/react'
import configureStore from 'redux-mock-store'
import {mocked} from 'jest-mock'

import {wrapIntl} from '../../../testUtils'
import {Board, IPropertyTemplate} from '../../../blocks/board'
import {BoardView} from '../../../blocks/boardView'

import {orgColorForId} from '../../../properties/orgLabels'
import {FilterClause} from '../../../blocks/filterClause'
import mutator from '../../../mutator'

import FilterValuePanel from './filterValuePanel'

jest.mock('../../../mutator')
const mockedMutator = mocked(mutator, true)

// The organisation branch of the filter panel. It cannot reuse the options
// branch because an organisation property's options array is always empty — the
// choices come from the organisation master (FR-019).
describe('components/viewHeader/filterPanel/filterValuePanel — organisation', () => {
    const mockStore = configureStore([])
    const teamID = 'team-1'

    const state = {
        orgMaster: {
            orgUnitsByTeamId: {
                [teamID]: [
                    {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
                    {id: 'div-admin', name: '관리본부', type: 'division', parentId: ''},
                    {id: 'dep-production', name: '생산팀', type: 'department', parentId: 'div-production'},
                    {id: 'dep-finance', name: '재경전산팀', type: 'department', parentId: 'div-admin'},
                ],
            },
            dutiesByTeamId: {
                [teamID]: [
                    {id: 'duty-head', code: 'head', name: '본부장', rank: 2, fullVisibility: true},
                    {id: 'duty-lead', code: 'lead', name: '팀장', rank: 3, fullVisibility: false},
                ],
            },
            orgProfilesByTeamId: {},
            loadedTeamIds: [teamID],
        },
        users: {boardUsers: {}},
        cards: {cards: {}, current: ''},
    }

    const board = {id: 'board-1', teamId: teamID, cardProperties: []} as unknown as Board

    const activeView = {
        id: 'view-1',
        fields: {filter: {operation: 'and', filters: []}},
    } as unknown as BoardView

    const renderPanel = (type: string) => render(wrapIntl(
        <ReduxProvider store={mockStore(state)}>
            <FilterValuePanel
                board={board}
                activeView={activeView}
                propertyTemplate={{id: 'p-1', name: '조직', type, options: []} as IPropertyTemplate}
            />
        </ReduxProvider>,
    ))

    test('a 본부 filter lists the divisions from the master (FR-019)', () => {
        renderPanel('orgDivision')

        expect(screen.getByText('생산본부')).toBeDefined()
        expect(screen.getByText('관리본부')).toBeDefined()
    })

    test('a 본부 filter does not list departments', () => {
        renderPanel('orgDivision')

        expect(screen.queryByText('생산팀')).toBeNull()
    })

    test('a 부서 filter lists every department, not just one division\'s', () => {
        // Unlike the card editor, a filter is a question about the whole board,
        // so it is not narrowed by what any one card names.
        renderPanel('orgDepartment')

        expect(screen.getByText('생산팀')).toBeDefined()
        expect(screen.getByText('재경전산팀')).toBeDefined()
        expect(screen.queryByText('생산본부')).toBeNull()
    })

    test('a 직책 filter lists the duties from the master (FR-007)', () => {
        renderPanel('orgDuty')

        expect(screen.getByText('본부장')).toBeDefined()
        expect(screen.getByText('팀장')).toBeDefined()
    })

    test('a 직책 filter lists no organisation units', () => {
        renderPanel('orgDuty')

        expect(screen.queryByText('생산본부')).toBeNull()
        expect(screen.queryByText('생산팀')).toBeNull()
    })

    test('a 본부 filter lists no duties', () => {
        // The three organisation filters share one panel, so each one has to be
        // shown to draw from its own source rather than from all of them.
        renderPanel('orgDivision')

        expect(screen.queryByText('본부장')).toBeNull()
    })

    test('the list appears even though the board holds no options', () => {
        // The regression this guards: routing organisation properties through
        // the 'options' branch would render an empty panel, because that branch
        // reads propertyTemplate.options.
        const {container} = renderPanel('orgDivision')

        expect(container.querySelectorAll('.FilterValuePanel__option').length).toBe(2)
    })

    // The filter list used to be plain text while the card editor drew labels,
    // so the same 본부 looked different in the two places (FR-007).
    const filterColorOf = (container: HTMLElement, name: string): string => {
        const label = [...container.querySelectorAll('.Label')].find((node) => node.textContent?.includes(name))
        return label ? label.className.replace('Label', '').trim() : ''
    }

    test('draws organisation choices as coloured labels (FR-007)', () => {
        const {container} = renderPanel('orgDivision')

        expect(filterColorOf(container, '생산본부')).not.toBe('')
        expect(filterColorOf(container, '생산본부')).not.toBe('propColorDefault')
    })

    test('uses the same colour the card editor would (FR-007)', () => {
        const {container} = renderPanel('orgDivision')

        expect(filterColorOf(container, '생산본부')).toBe(orgColorForId('div-production', [{id: 'div-production', name: '생산본부'}]))
    })

    test('draws duties from the same rule', () => {
        const {container} = renderPanel('orgDuty')

        expect(filterColorOf(container, '팀장')).toBe(orgColorForId('duty-lead', [{id: 'duty-lead', name: '팀장'}]))
    })
})

// 019: 사용자 선택형 필터의 "본인" 항목 계약 (specs/019-me-filter/contracts/ui-surfaces.md U-01~U-05)
describe('components/viewHeader/filterPanel/filterValuePanel — person "본인" (019)', () => {
    const mockStore = configureStore([])

    const makeUser = (id: string, username: string) => ({
        id,
        username,
        email: '',
        nickname: '',
        firstname: '',
        lastname: '',
        props: {},
        create_at: 0,
        update_at: 0,
        is_bot: false,
        is_guest: false,
        roles: 'system_user',
    })

    const state = {
        users: {
            boardUsers: {
                'user-1': makeUser('user-1', 'alice'),
                'user-2': makeUser('user-2', 'bob'),
            },
        },
        orgMaster: {orgUnitsByTeamId: {}, dutiesByTeamId: {}, orgProfilesByTeamId: {}, loadedTeamIds: []},
        cards: {cards: {}, current: ''},
    }

    const board = {id: 'board-1', teamId: 'team-1', cardProperties: []} as unknown as Board

    const makeView = (values?: string[]) => ({
        id: 'view-1',
        boardId: 'board-1',
        fields: {
            filter: {
                operation: 'and',
                filters: values ? [{propertyId: 'p-1', condition: 'includes', values}] : [],
            },
        },
    } as unknown as BoardView)

    const renderPanel = (type: string, view: BoardView = makeView()) => render(wrapIntl(
        <ReduxProvider store={mockStore(state)}>
            <FilterValuePanel
                board={board}
                activeView={view}
                propertyTemplate={{id: 'p-1', name: '담당자', type, options: []} as IPropertyTemplate}
            />
        </ReduxProvider>,
    ))

    beforeEach(() => {
        jest.clearAllMocks()
    })

    test.each(['person', 'multiPerson', 'createdBy', 'updatedBy'])(
        'U-01: %s 속성 값 목록의 맨 위에 "본인" 항목이 있다', (type) => {
            renderPanel(type)

            const rows = screen.getAllByRole('checkbox')
            expect(rows[0].textContent).toBe('Me')
            expect(screen.getByText('alice')).toBeDefined()
        })

    test('U-02: "본인" 클릭은 values에 me를 저장하고, 재클릭은 제거한다', () => {
        const first = renderPanel('person')
        fireEvent.click(screen.getAllByRole('checkbox')[0])

        const firstCall = mockedMutator.changeViewFilter.mock.calls[0]
        expect((firstCall[3].filters[0] as FilterClause).values).toEqual(['me'])
        first.unmount()

        // 이미 me가 저장된 뷰에서 재클릭 → 절이 제거된다
        renderPanel('person', makeView(['me']))
        fireEvent.click(screen.getAllByRole('checkbox')[0])

        const secondCall = mockedMutator.changeViewFilter.mock.calls[1]
        expect(secondCall[3].filters).toEqual([])
    })

    test('U-03: me가 저장된 뷰를 열면 "본인"이 체크 상태다 — 사용자 이름이 아니다', () => {
        renderPanel('person', makeView(['me']))

        const meRow = screen.getAllByRole('checkbox')[0]
        expect(meRow.textContent).toBe('Me')
        expect(meRow.getAttribute('aria-checked')).toBe('true')
    })

    test('U-04: 검색어 "me"·"본인" 둘 다 본인 항목이 남고, 다른 검색어면 사라진다', () => {
        renderPanel('person')
        const input = screen.getByPlaceholderText('Search users...')

        fireEvent.change(input, {target: {value: 'me'}})
        expect(screen.getAllByRole('checkbox')[0].textContent).toBe('Me')

        fireEvent.change(input, {target: {value: '본인'}})
        expect(screen.getAllByRole('checkbox')[0].textContent).toBe('Me')
        expect(screen.queryByText('alice')).toBeNull()

        fireEvent.change(input, {target: {value: 'alice'}})
        expect(screen.queryByText('Me')).toBeNull()
        expect(screen.getByText('alice')).toBeDefined()
    })

    test('U-05: "본인"과 실제 사용자를 함께 선택할 수 있다', () => {
        renderPanel('person', makeView(['me']))
        fireEvent.click(screen.getByText('alice'))

        const call = mockedMutator.changeViewFilter.mock.calls[0]
        expect((call[3].filters[0] as FilterClause).values).toEqual(['me', 'user-1'])
    })
})
