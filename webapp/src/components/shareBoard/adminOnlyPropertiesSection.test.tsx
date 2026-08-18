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

import AdminOnlyPropertiesSection from './adminOnlyPropertiesSection'

jest.mock('../../mutator')
const mockedMutator = jest.mocked(mutator)

// 스위치는 보드가 무엇을 기록하는지 누가 정하는가를 고른다. 제한 대상인 에디터가
// 스스로 끌 수 있으면 잠금이 아니므로, 보드 관리자에게만 보인다.
describe('components/shareBoard/adminOnlyPropertiesSection', () => {
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
                <AdminOnlyPropertiesSection board={board}/>
            </ReduxProvider>,
        ))
        return {board, ...result}
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('정한 적 없는 보드는 스위치가 꺼져 있다', () => {
        const {container} = renderSection()

        expect(container.querySelector('.Switch.on')).toBeNull()
    })

    test('잠긴 보드는 스위치가 켜져 있다', () => {
        const {container} = renderSection({adminOnlyCardProperties: true})

        expect(container.querySelector('.Switch.on')).not.toBeNull()
    })

    test('스위치가 아닌 값은 꺼짐으로 보여준다', () => {
        const {container} = renderSection({adminOnlyCardProperties: 'true'})

        expect(container.querySelector('.Switch.on')).toBeNull()
    })

    test('켜면 잠금을 요청한다', async () => {
        const {board, container} = renderSection()

        await userEvent.click(container.querySelector('.Switch')!)

        expect(mockedMutator.setCardPropertiesAdminOnly).toHaveBeenCalledWith(board, true)
    })

    test('끄면 해제를 요청한다', async () => {
        const {board, container} = renderSection({adminOnlyCardProperties: true})

        await userEvent.click(container.querySelector('.Switch')!)

        expect(mockedMutator.setCardPropertiesAdminOnly).toHaveBeenCalledWith(board, false)
    })

    test('에디터에게는 스위치가 아예 없다', () => {
        const {container} = renderSection(
            {adminOnlyCardProperties: true},
            {userId: 'user-1', schemeEditor: true},
        )

        expect(screen.queryByText(/속성 편집|Property editing/)).toBeNull()
        expect(container.querySelector('.Switch')).toBeNull()
    })
})
