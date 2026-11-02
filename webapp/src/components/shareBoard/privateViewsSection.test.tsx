// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import {mocked} from 'jest-mock'

import {wrapIntl, mockStateStore} from '../../testUtils'
import {TestBlockFactory} from '../../test/testBlockFactory'
import client from '../../octoClient'
import {IUser} from '../../user'

import PrivateViewsSection from './privateViewsSection'

jest.mock('../../octoClient')
const mockedOctoClient = mocked(client, true)

// The admin's cleanup list for private views
// (specs/022-view-permission/contracts/ui-surfaces.md U-12 · U-13, W-14~W-16).
describe('components/shareBoard/privateViewsSection', () => {
    const board = TestBlockFactory.createBoard()
    const bob: IUser = {
        id: 'bob', username: 'bob', email: '', nickname: '', firstname: 'Bob', lastname: 'Builder',
        props: {}, create_at: 0, update_at: 0, is_bot: false, is_guest: false, roles: 'system_user',
    }

    const renderAs = (membership: Record<string, unknown>) => render(
        wrapIntl(
            <ReduxProvider store={mockStateStore([], {
                users: {me: {id: 'admin', username: 'admin', props: {}}, boardUsers: {}},
                teams: {current: {id: 'team-id'}},
                boards: {
                    current: board.id,
                    boards: {[board.id]: board},
                    myBoardMemberships: {[board.id]: {userId: 'admin', ...membership}},
                },
                clientConfig: {value: {teammateNameDisplay: 'username'}},
            })}
            >
                <PrivateViewsSection board={board}/>
            </ReduxProvider>,
        ),
    )

    beforeEach(() => {
        jest.clearAllMocks()
        mockedOctoClient.getUsersList.mockResolvedValue([bob])
        mockedOctoClient.deletePrivateView.mockResolvedValue({status: 200} as Response)
    })

    test('W-14 an admin sees each private view with its creator and can delete it', async () => {
        mockedOctoClient.getPrivateViews.mockResolvedValue([
            {id: 'view-bob', title: "Bob's scratch view", createdBy: 'bob', createAt: 1762000000000},
        ])
        renderAs({schemeAdmin: true})

        expect(await screen.findByText("Bob's scratch view")).toBeInTheDocument()
        expect(mockedOctoClient.getPrivateViews).toHaveBeenCalledWith(board.id)
        expect(mockedOctoClient.getUsersList).toHaveBeenCalledWith(['bob'])
        expect(screen.getByText(/bob/)).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: 'Delete'}))
        expect(screen.getByText(/Delete the private view/)).toBeInTheDocument()
        const confirmButtons = screen.getAllByRole('button', {name: 'Delete'})
        await userEvent.click(confirmButtons[confirmButtons.length - 1])

        expect(mockedOctoClient.deletePrivateView).toHaveBeenCalledWith(board.id, 'view-bob')
        await waitFor(() => expect(screen.queryByText("Bob's scratch view")).not.toBeInTheDocument())
    })

    test('W-15 a non-admin does not see the section at all', async () => {
        mockedOctoClient.getPrivateViews.mockResolvedValue([
            {id: 'view-bob', title: "Bob's scratch view", createdBy: 'bob', createAt: 1762000000000},
        ])
        const {container} = renderAs({schemeEditor: true})

        await waitFor(() => expect(container).toBeEmptyDOMElement())
        expect(mockedOctoClient.getPrivateViews).not.toHaveBeenCalled()
    })

    test('W-16 a board without private views says so', async () => {
        mockedOctoClient.getPrivateViews.mockResolvedValue([])
        renderAs({schemeAdmin: true})

        expect(await screen.findByText('No private views on this board.')).toBeInTheDocument()
    })
})
