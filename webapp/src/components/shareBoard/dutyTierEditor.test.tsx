// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import {thunk} from 'redux-thunk'

import React from 'react'

import {mockStateStore, wrapDNDIntl} from '../../testUtils'

import DutyTierEditor from './dutyTierEditor'

// 009 US2 — 묶음은 팀이 갖는다. 한 사람의 편집이 팀의 모든 보드에 걸리므로 고칠 수 있는
// 사람과 볼 수 있는 사람이 갈린다.

const teamId = 'team-id'

const buildState = (canEdit: boolean, tiers = [
    {id: 't1', name: '대표', dutyIds: ['duty-ceo']},
    {id: 't2', name: 'C-Level', dutyIds: ['duty-cso', 'duty-coo']},
]) => ({
    teams: {current: {id: teamId, title: 'Test Team'}},
    orgMaster: {
        orgUnitsByTeamId: {[teamId]: []},
        dutiesByTeamId: {
            [teamId]: [
                {id: 'duty-ceo', code: 'd0', name: 'CEO', rank: 0, fullVisibility: true},
                {id: 'duty-cso', code: 'd2', name: 'CSO', rank: 2, fullVisibility: true},
                {id: 'duty-coo', code: 'd2', name: 'COO', rank: 2, fullVisibility: true},
                {id: 'duty-lead', code: 'd3', name: '팀장', rank: 3, fullVisibility: false},
            ],
        },
        orgProfilesByTeamId: {[teamId]: []},
        loadedTeamIds: [teamId],
    },
    dutyTiers: {
        tiersByTeamId: {[teamId]: tiers},
        canEditByTeamId: {[teamId]: canEdit},
        boardCountsByTeamId: {[teamId]: {t2: 3}},
        loadedTeamIds: [teamId],
    },
})

const renderEditor = async (canEdit: boolean, tiers?: {id: string, name: string, dutyIds: string[]}[]) => {
    const store = mockStateStore([thunk], buildState(canEdit, tiers))
    let container: Element | undefined
    await act(async () => {
        container = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <DutyTierEditor teamId={teamId}/>
            </ReduxProvider>)).container
    })
    return {container: container!, store}
}

describe('src/components/shareBoard/dutyTierEditor', () => {
    test('묶음 이름과 든 직책을 보여준다', async () => {
        const {container} = await renderEditor(true)

        expect(container.textContent).toContain('대표')
        expect(container.textContent).toContain('C-Level')
        expect(container.textContent).toContain('CSO')
        expect(container.textContent).toContain('COO')
    })

    test('이 팀의 모든 보드에 적용된다고 알린다', async () => {
        const {container} = await renderEditor(true)

        expect(container.textContent).toMatch(/모든 보드|all boards/i)
    })

    test('고칠 권한이 있으면 직책을 담을 수 있다', async () => {
        const {container} = await renderEditor(true)

        expect(container.querySelectorAll('.DutyTierEditor__duty').length).toBeGreaterThan(0)
        expect(container.querySelector('.DutyTierEditor--readonly')).toBeNull()
    })

    test('고칠 권한이 없으면 값이 보이되 잠긴다', async () => {
        const {container} = await renderEditor(false)

        // 보이는 것이 핵심이다 — C-Level이 누구인지 모르면 규칙을 짤 수 없다 (FR-011c).
        expect(container.textContent).toContain('C-Level')
        expect(container.querySelector('.DutyTierEditor--readonly')).not.toBeNull()
    })

    test('잠긴 상태에서는 직책을 담는 컨트롤이 없다', async () => {
        const {container} = await renderEditor(false)

        expect(container.querySelectorAll('button:not([disabled])').length).toBe(0)
    })

    test('어느 묶음에도 없는 직책을 알려준다', async () => {
        const {container} = await renderEditor(true)

        // 팀장이 어느 묶음에도 안 들었다. 새 직책이 생겼는데 안 넣으면 그 사람만
        // 아무것도 못 보는 사고가 조용히 난다 (FR-023).
        const missing = container.querySelector('.DutyTierEditor__unassigned')
        expect(missing).not.toBeNull()
        expect(missing!.textContent).toContain('팀장')
    })

    test('모든 직책이 담겼으면 경고를 안 띄운다', async () => {
        const {container} = await renderEditor(true, [
            {id: 't1', name: '전부', dutyIds: ['duty-ceo', 'duty-cso', 'duty-coo', 'duty-lead']},
        ])

        expect(container.querySelector('.DutyTierEditor__unassigned')).toBeNull()
    })

    test('직책을 담으면 저장을 부른다', async () => {
        const {container, store} = await renderEditor(true)

        const addButton = container.querySelector('.DutyTierEditor__add')
        expect(addButton).not.toBeNull()
        await userEvent.click(addButton!)
        await userEvent.click(screen.getByText('팀장'))

        const saved = store.getActions().some((action: {type: string}) => action.type.startsWith('dutyTiers/save'))
        expect(saved).toBe(true)
    })

    test('묶음을 새로 만든다', async () => {
        const {container, store} = await renderEditor(true)

        const input = container.querySelector('.DutyTierEditor__newName') as HTMLInputElement
        expect(input).not.toBeNull()
        await userEvent.type(input, '본부장')
        await userEvent.click(container.querySelector('.DutyTierEditor__addTier')!)

        const saved = store.getActions().some((action: {type: string}) => action.type.startsWith('dutyTiers/save'))
        expect(saved).toBe(true)
    })

    test('이름이 비면 만들 수 없다', async () => {
        const {container} = await renderEditor(true)

        expect((container.querySelector('.DutyTierEditor__addTier') as HTMLButtonElement).disabled).toBe(true)
    })

    test('잠긴 상태에서는 묶음을 못 만든다', async () => {
        const {container} = await renderEditor(false)

        expect(container.querySelector('.DutyTierEditor__newName')).toBeNull()
    })

    test('묶음을 지우기 전에 쓰는 보드 수를 알린다', async () => {
        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
        const {container} = await renderEditor(true)

        // t2(C-Level)를 보드 3개가 쓰고 있다.
        const removeButtons = container.querySelectorAll('.DutyTierEditor__removeTier')
        await userEvent.click(removeButtons[1])

        expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('3'))
        confirmSpy.mockRestore()
    })

    test('확인을 거절하면 안 지운다', async () => {
        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
        const {container, store} = await renderEditor(true)

        await userEvent.click(container.querySelectorAll('.DutyTierEditor__removeTier')[0])

        expect(store.getActions().some((a: {type: string}) => a.type.startsWith('dutyTiers/save'))).toBe(false)
        confirmSpy.mockRestore()
    })
})
