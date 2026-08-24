// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import {thunk} from 'redux-thunk'

import React from 'react'
import {mocked} from 'jest-mock'

import {Board, DutyTier, PropertyAccessSettings} from '../../blocks/board'
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
    dutyTiers: {
        tiersByTeamId: {'team-id': [] as DutyTier[]},
        canEditByTeamId: {'team-id': true},
        boardCountsByTeamId: {'team-id': {} as {[tierId: string]: number}},
        loadedTeamIds: ['team-id'],
    },
    clientConfig: {
        value: {teammateNameDisplay: 'username'},
    },
})

const renderSection = async (board: Board, schemeAdmin = true) => {
    const store = mockStateStore([thunk], buildState(board, schemeAdmin))
    let container: Element | undefined
    let rerenderResult: ((ui: React.ReactElement) => void) | undefined
    await act(async () => {
        const result = render(
            wrapDNDIntl(
                <ReduxProvider store={store}>
                    <PropertyAccessSection board={board}/>
                </ReduxProvider>),
        )
        container = result.container
        rerenderResult = result.rerender
    })

    // The board arrives again whenever anything on it changes — another admin's
    // save, a websocket update, the response to this dialog's own save.
    const rerender = async (next: Board) => {
        await act(async () => {
            rerenderResult!(
                wrapDNDIntl(
                    <ReduxProvider store={store}>
                        <PropertyAccessSection board={next}/>
                    </ReduxProvider>),
            )
        })
    }

    return {container: container!, store, rerender}
}

const RULES_ONE = [{id: 'r1', propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: '', departmentId: '', dutyId: 'duty-lead', permission: 'viewer' as const}]

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

    // ---- 저장이 거부되면 화면에 남긴다 ----

    test('저장이 거부되면 조용히 넘어가지 않는다', async () => {
        mockedMutator.updateBoard.mockRejectedValueOnce(
            new Error('propertyAccess rule 0: relation "sameDivision" needs orgPropertyId'))
        const {container} = await renderSection(buildBoard())

        await act(async () => {
            await userEvent.click(container.querySelector('.Switch')!)
        })

        const notice = container.querySelector('.PropertyAccessSection__saveError')
        expect(notice).not.toBeNull()
        expect(notice!.textContent).toContain('needs orgPropertyId')
    })

    test('다음 저장이 통하면 실패 표시를 거둔다', async () => {
        mockedMutator.updateBoard.mockRejectedValueOnce(new Error('rejected'))
        const {container} = await renderSection(buildBoard())

        await act(async () => {
            await userEvent.click(container.querySelector('.Switch')!)
        })
        expect(container.querySelector('.PropertyAccessSection__saveError')).not.toBeNull()

        await act(async () => {
            await userEvent.click(container.querySelector('.Switch')!)
        })

        expect(container.querySelector('.PropertyAccessSection__saveError')).toBeNull()
    })

    // ---- 편집 중인 행은 보드가 다시 도착해도 살아남는다 ----

    test('a row still being filled in survives the board arriving again', async () => {
        const {container, rerender} = await renderSection(buildBoard())

        await act(async () => {
            await userEvent.click(container.querySelector('.PropertyAccessSection__add')!)
        })
        expect(container.querySelectorAll('.PropertyAccessRow').length).toBe(1)

        await rerender(buildBoard({trackingTemplateId: 'template-1'}))

        expect(container.querySelectorAll('.PropertyAccessRow').length).toBe(1)
    })

    test('an edit that empties a rule is not undone by the board arriving again', async () => {
        const stored = {enabled: true, updatedBy: '', updatedAt: 0, rules: RULES_ONE}
        const {container, rerender} = await renderSection(buildBoard({propertyAccess: stored}))

        // Choosing the property again clears the value, so the row can no
        // longer be saved — exactly the edit that used to spring back.
        await act(async () => {
            await userEvent.click(container.querySelectorAll('.user-item__button')[0])
        })
        await act(async () => {
            await userEvent.click(document.querySelector('.menu-name')!)
        })
        expect(container.querySelector('.PropertyAccessRow__pending')).not.toBeNull()

        await rerender(buildBoard({propertyAccess: stored}))

        expect(container.querySelector('.PropertyAccessRow__pending')).not.toBeNull()
    })

    test('a saved rule still takes its value from the board', async () => {
        const {container, rerender} = await renderSection(buildBoard({
            propertyAccess: {enabled: true, updatedBy: '', updatedAt: 0, rules: RULES_ONE},
        }))

        await rerender(buildBoard({
            propertyAccess: {
                enabled: true,
                updatedBy: '',
                updatedAt: 0,
                rules: [{...RULES_ONE[0], permission: 'editor' as const}],
            },
        }))

        const labels = container.querySelectorAll('.PropertyAccessRow__label')
        expect(labels[labels.length - 1].textContent).toBe('Editor')
    })

    test('moving to another board drops the row being filled in', async () => {
        const {container, rerender} = await renderSection(buildBoard())

        await act(async () => {
            await userEvent.click(container.querySelector('.PropertyAccessSection__add')!)
        })
        expect(container.querySelectorAll('.PropertyAccessRow').length).toBe(1)

        const other = buildBoard()
        other.id = 'board-2'
        await rerender(other)

        expect(container.querySelectorAll('.PropertyAccessRow').length).toBe(0)
    })

    // ---- 009 US3: 매트릭스 화면 ----

    const okrBoard = (): Board => {
        const board = buildBoard({
            okrBoard: {propertyId: 'prop-type', levels: ['opt-objective', 'opt-key-result', 'opt-task']},
            propertyAccess: {enabled: true, updatedBy: '', updatedAt: 0, rules: []},
        })
        board.cardProperties = [
            {
                id: 'prop-type',
                name: '유형',
                type: 'select',
                options: [
                    {id: 'opt-objective', value: 'Objective', color: 'propColorBrown'},
                    {id: 'opt-key-result', value: 'Key Results', color: 'propColorBlue'},
                    {id: 'opt-task', value: 'Tasks', color: 'propColorGray'},
                ],
            },
            // 관계가 견줄 값이 있어야 표가 쓸 만한 규칙을 만든다. 없으면 서버가
            // orgPropertyId 없는 규칙을 거절한다.
            {id: 'prop-division', name: '본부', type: 'orgDivision', options: []},
            {id: 'prop-department', name: '부서', type: 'orgDepartment', options: []},
            {id: 'prop-assignee', name: '담당자', type: 'person', options: []},
        ]
        return board
    }

    const withTiers = (board: Board) => {
        const state = buildState(board, true)
        state.dutyTiers.tiersByTeamId['team-id'] = [
            {id: 't1', name: '대표', dutyIds: ['duty-ceo']},
            {id: 't2', name: 'C-Level', dutyIds: ['duty-cso']},
            {id: 't3', name: '팀장', dutyIds: ['duty-lead']},
            {id: 't4', name: '팀원', dutyIds: ['duty-member']},
        ]
        return state
    }

    const renderWith = async (board: Board, state: ReturnType<typeof buildState>) => {
        const store = mockStateStore([thunk], state)
        let container: Element | undefined
        await act(async () => {
            container = render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <PropertyAccessSection board={board}/>
                </ReduxProvider>)).container
        })
        return container!
    }

    test('OKR 사다리가 있는 보드는 표를 보여준다 (FR-022)', async () => {
        const board = okrBoard()
        const container = await renderWith(board, withTiers(board))

        expect(container.querySelector('.AccessMatrix')).not.toBeNull()
    })

    test('OKR 보드는 표와 규칙을 오가는 토글을 두지 않는다', async () => {
        const board = okrBoard()
        const container = await renderWith(board, withTiers(board))

        expect(container.querySelector('.PropertyAccessSection__views')).toBeNull()
    })

    test('OKR 보드는 규칙 목록을 함께 보여주지 않는다', async () => {
        const board = okrBoard()
        board.properties = {
            ...board.properties,
            propertyAccess: {
                enabled: true,
                updatedBy: '',
                updatedAt: 0,
                rules: [{id: 'hand-1', propertyId: 'prop-type', propertyValueId: 'opt-task', divisionId: 'div-x', departmentId: '', dutyId: '', permission: 'editor'}],
            },
        }
        const container = await renderWith(board, withTiers(board))

        expect(container.querySelector('.PropertyAccessRow')).toBeNull()
    })

    test('OKR이 아닌 보드는 표 토글 없이 규칙 뷰만 보여준다', async () => {
        const board = buildBoard({
            propertyAccess: {
                enabled: true,
                updatedBy: '',
                updatedAt: 0,
                rules: [{id: 'r1', propertyId: 'prop-clevel', propertyValueId: 'opt-strategy', divisionId: 'div-x', departmentId: '', dutyId: '', permission: 'editor'}],
            },
        })
        const {container} = await renderSection(board)

        expect(container.querySelector('.AccessMatrix')).toBeNull()
        expect(container.querySelector('.PropertyAccessSection__views')).toBeNull()
        expect(container.querySelector('.PropertyAccessRow')).not.toBeNull()
    })

    test('카드 유형이 정해지지 않은 보드는 표가 안 나온다 (FR-022)', async () => {
        const board = buildBoard({propertyAccess: {enabled: true, updatedBy: '', updatedAt: 0, rules: []}})
        const container = await renderWith(board, buildState(board, true))

        expect(container.querySelector('.AccessMatrix')).toBeNull()
        expect(container.querySelector('.PropertyAccessSection__rules')).not.toBeNull()
    })

    test('팀에 묶음이 없으면 묶음부터 정하라고 알린다', async () => {
        const board = okrBoard()
        const container = await renderWith(board, buildState(board, true))

        expect(container.querySelector('.PropertyAccessSection__needTiers')).not.toBeNull()
        expect(container.querySelector('.AccessMatrix')).toBeNull()
    })

    test('표가 비어 있으면 표준 적용 버튼이 나온다 (FR-019)', async () => {
        const board = okrBoard()
        const container = await renderWith(board, withTiers(board))

        expect(container.querySelector('.PropertyAccessSection__preset')).not.toBeNull()
    })

    test('표준을 적용하면 규칙 여섯 줄로 저장된다 (SC-002)', async () => {
        const board = okrBoard()
        const container = await renderWith(board, withTiers(board))

        await act(async () => {
            await userEvent.click(container.querySelector('.PropertyAccessSection__preset')!)
        })

        const [newBoard] = mockedMutator.updateBoard.mock.calls[0]
        const saved = newBoard.properties.propertyAccess as PropertyAccessSettings
        expect(saved.rules).toHaveLength(6)
    })

    test('OKR 보드는 표만 다루므로 표 밖 안내를 띄우지 않는다', async () => {
        // 뷰를 가른 뒤로 OKR 보드는 표 하나로만 편집한다. 규칙 뷰가 없으니 "표 밖에
        // N줄" 안내도 사라진다.
        const board = okrBoard()
        board.properties = {
            ...board.properties,
            propertyAccess: {
                enabled: true,
                updatedBy: '',
                updatedAt: 0,
                rules: [{id: 'hand-1', propertyId: 'prop-type', propertyValueId: 'opt-task', divisionId: 'div-x', departmentId: '', dutyId: '', permission: 'editor'}],
            },
        }
        const container = await renderWith(board, withTiers(board))

        expect(container.querySelector('.PropertyAccessSection__outside')).toBeNull()
    })

    test('본부 속성이 없으면 표준 버튼 대신 안내를 띄운다', async () => {
        // 서버가 orgPropertyId 없는 관계 규칙을 거절하므로, 화면이 먼저 막는다.
        const board = okrBoard()
        board.cardProperties = board.cardProperties.filter((property) => property.type !== 'orgDivision')
        const container = await renderWith(board, withTiers(board))

        expect(container.querySelector('.PropertyAccessSection__preset')).toBeNull()
        expect(container.querySelector('.PropertyAccessSection__needTiers')).not.toBeNull()
    })
})
