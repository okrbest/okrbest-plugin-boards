// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'

import {TestBlockFactory} from '../../test/testBlockFactory'
import {mockStateStore} from '../../testUtils'
import {UserSettings} from '../../userSettings'

import TeamToBoardAndViewRedirect from './teamToBoardAndViewRedirect'

const board = TestBlockFactory.createBoard()
const viewA = TestBlockFactory.createBoardView(board)
viewA.id = 'view-a'
viewA.title = 'A first'
const viewB = TestBlockFactory.createBoardView(board)
viewB.id = 'view-b'
viewB.title = 'B second'

const mockNavigate = jest.fn()
let mockParams: {teamId?: string, boardId?: string, viewId?: string} = {}

jest.mock('react-router-dom', () => {
    const originalModule = jest.requireActual('react-router-dom')
    return {
        ...originalModule,
        useNavigate: () => mockNavigate,
        useParams: () => mockParams,
        useLocation: () => ({pathname: `/team/team-id/${board.id}`, search: ''}),
    }
})

// A view address that is not among the views this person can see falls back to
// the first visible view (022 FR-014, contracts/ui-surfaces.md U-14 · W-18).
// Before this feature such an address rendered an empty workspace.
describe('pages/boardPage/teamToBoardAndViewRedirect', () => {
    const stateWith = (views: Record<string, unknown>) => ({
        teams: {current: {id: 'team-id'}},
        boards: {current: board.id, boards: {[board.id]: board}, templates: [], myBoardMemberships: {}},
        views: {current: '', views},
        users: {me: {id: 'me', username: 'me', props: {}}},
        sidebar: {categoryAttributes: [], hiddenBoardIDs: []},
    })

    const renderRedirect = (views: Record<string, unknown>) => render(
        <ReduxProvider store={mockStateStore([], stateWith(views))}>
            <TeamToBoardAndViewRedirect/>
        </ReduxProvider>,
    )

    let lastViewIdSpy: jest.SpyInstance
    let setLastViewIdSpy: jest.SpyInstance

    beforeEach(() => {
        jest.clearAllMocks()
        lastViewIdSpy = jest.spyOn(UserSettings, 'lastViewId', 'get').mockReturnValue({})
        setLastViewIdSpy = jest.spyOn(UserSettings, 'setLastViewId').mockImplementation(() => undefined)
    })

    afterEach(() => {
        lastViewIdSpy.mockRestore()
        setLastViewIdSpy.mockRestore()
    })

    test('W-18 a view that is not in the visible list falls back to the first one', () => {
        mockParams = {teamId: 'team-id', boardId: board.id, viewId: 'view-hidden'}
        renderRedirect({[viewA.id]: viewA, [viewB.id]: viewB})

        expect(mockNavigate).toHaveBeenCalledTimes(1)
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining(viewA.id), {replace: true})
        expect(setLastViewIdSpy).toHaveBeenCalledWith(board.id, viewA.id)
    })

    test('W-18 a remembered last view that is no longer visible also falls back', () => {
        mockParams = {teamId: 'team-id', boardId: board.id}
        lastViewIdSpy.mockReturnValue({[board.id]: 'view-hidden'})
        renderRedirect({[viewA.id]: viewA, [viewB.id]: viewB})

        expect(mockNavigate).toHaveBeenCalledTimes(1)
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining(viewA.id), {replace: true})
    })

    test('a visible view address is left alone', () => {
        mockParams = {teamId: 'team-id', boardId: board.id, viewId: viewB.id}
        renderRedirect({[viewA.id]: viewA, [viewB.id]: viewB})

        expect(mockNavigate).not.toHaveBeenCalled()
    })

    test('nothing happens while the views have not loaded', () => {
        mockParams = {teamId: 'team-id', boardId: board.id, viewId: 'view-hidden'}
        renderRedirect({})

        expect(mockNavigate).not.toHaveBeenCalled()
    })
})
