// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import {MockStoreEnhanced} from 'redux-mock-store'

import {Provider as ReduxProvider} from 'react-redux'

import {render} from '@testing-library/react'



import {Team} from '../../store/teams'
import {TestBlockFactory} from '../../test/testBlockFactory'

import {mockStateStore, wrapDNDIntl} from '../../testUtils'

import BoardSwitcherDialog from './boardSwitcherDialog'

// Mock octoClient to prevent actual API calls
jest.mock('../../octoClient', () => ({
    searchAll: jest.fn().mockResolvedValue([]),
}))

describe('component/BoardSwitcherDialog', () => {
    const team1: Team = {
        id: 'team-id-1',
        title: 'Dunder Mifflin',
        signupToken: '',
        updateAt: 0,
        modifiedBy: 'michael-scott',
    }

    const team2: Team = {
        id: 'team-id-2',
        title: 'Michael Scott Paper Company',
        signupToken: '',
        updateAt: 0,
        modifiedBy: 'michael-scott',
    }

    const me = TestBlockFactory.createUser()

    const state = {
        users: {
            me,
        },
        teams: {
            allTeams: [team1, team2],
            current: team1,
        },
    }

    let store: MockStoreEnhanced<unknown, unknown>

    beforeEach(() => {
        store = mockStateStore([], state)
    })

    test('base case', () => {
        const onCloseHandler = jest.fn()
        const component = wrapDNDIntl(
            <ReduxProvider store={store}>
                <BoardSwitcherDialog onClose={onCloseHandler}/>
            </ReduxProvider>,
        )

        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })
})
