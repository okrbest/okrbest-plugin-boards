// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {mocked} from 'jest-mock'

import {render, screen, waitFor, within, act} from '@testing-library/react'

import configureStore from 'redux-mock-store'

import userEvent from '@testing-library/user-event'

import {TestBlockFactory} from '../../test/testBlockFactory'

import {wrapIntl} from '../../testUtils'
import {IPropertyTemplate} from '../../blocks/board'

import client from '../../octoClient'

import mutator from '../../mutator'

import PersonProperty from './property'

// import {IPropertyTemplate, Board} from '../blocks/board'

import ConfirmPerson from './confirmPerson'
jest.mock('../../mutator')
jest.mock('../../octoClient')

const mockedMutator = mocked(mutator, true)
const mockedOctoClient = mocked(client, true)

const board = TestBlockFactory.createBoard()
board.teamId = 'team-id-1'
const card = TestBlockFactory.createCard(board)

describe('properties/person', () => {
    const mockStore = configureStore([])
    const state = {
        boards: {
            boards: {
                [board.id]: board,
            },
            current: board.id,
            myBoardMemberships: {
                [board.id]: {userId: 'user-id-1', schemeAdmin: true},
            },
        },
        users: {
            me: {
                id: 'user-id-1',
                username: 'username_1',
                roles: 'system_user',
            },
            boardUsers: {
                'user-id-1': {
                    id: 'user-id-1',
                    username: 'username-1',
                    email: 'user-1@example.com',
                    firstname: 'test',
                    lastname: 'user',
                    props: {},
                    create_at: 1621315184,
                    update_at: 1621315184,
                    delete_at: 0,
                },
                'user-id-2': {
                    id: 'user-id-2',
                    username: 'username-2',
                    email: 'user-2@example.com',
                    props: {},
                    create_at: 1621315184,
                    update_at: 1621315184,
                    delete_at: 0,
                },
                'user-id-3': {
                    id: 'user-id-3',
                    username: 'username-3',
                    email: 'user-3@example.com',
                    props: {},
                    create_at: 1621315184,
                    update_at: 1621315184,
                    delete_at: 0,
                },
            },
        },
        clientConfig: {
            value: {
                teammateNameDisplay: 'username',
            },
        },
    }
    const additionalUsers = [
        {
            id: 'user-id-4',
            username: 'username-4',
            email: 'user-4@example.com',
            nickname: '',
            firstname: '',
            lastname: '',
            props: {},
            create_at: 1621315184,
            update_at: 1621315184,
            delete_at: 0,
            is_bot: false,
            is_guest: false,
            roles: 'system_user',
        },
        {
            id: 'user-id-5',
            username: 'username-5',
            email: 'user-5@example.com',
            nickname: '',
            firstname: '',
            lastname: '',
            props: {},
            create_at: 1621315184,
            update_at: 1621315184,
            delete_at: 0,
            is_bot: false,
            is_guest: false,
            roles: 'system_user',
        },
    ]

    mockedOctoClient.searchTeamUsers.mockResolvedValue(additionalUsers)

    test('select user - confirm', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <ConfirmPerson
                    property={new PersonProperty()}
                    propertyValue={'user-id-1'}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                    propertyTemplate={{} as IPropertyTemplate}
                    board={board}
                    card={card}
                />
            </ReduxProvider>,
        )
        const renderResult = render(component)
        const container = await waitFor(() => {
            if (!renderResult.container) {
                return Promise.reject(new Error('container not found'))
            }
            return Promise.resolve(renderResult.container)
        })
        expect(container).toMatchSnapshot()

        if (container) {
            // this is the actual element where the click event triggers
            // opening of the dropdown
            const userProperty = container.querySelector('.Person > div > div:nth-child(1) > div:nth-child(2) > input')
            expect(userProperty).not.toBeNull()

            act(() => {
                userEvent.click(userProperty as Element)
            })
            expect(container).toMatchSnapshot()

            const option = await renderResult.findByText('username-4')
            expect(option).not.toBeNull()
            act(() => {
                userEvent.click(option as Element)
            })

            const confirmDialog = screen.getByTitle('Confirmation Dialog Box')
            expect(confirmDialog).toBeDefined()
            const confirmButton = within(confirmDialog).getByRole('button', {name: 'Add to board'})
            expect(confirmButton).toBeDefined()
            userEvent.click(confirmButton)

            expect(mockedMutator.createBoardMember).toBeCalled()
        } else {
            throw new Error('container should have been initialized')
        }
    })

    test('select user - cancel', async () => {
        mockedMutator.createBoardMember.mockClear()
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <ConfirmPerson
                    property={new PersonProperty()}
                    propertyValue={'user-id-1'}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                    propertyTemplate={{} as IPropertyTemplate}
                    board={board}
                    card={card}
                />
            </ReduxProvider>,
        )
        const renderResult = render(component)
        const container = await waitFor(() => {
            if (!renderResult.container) {
                return Promise.reject(new Error('container not found'))
            }
            return Promise.resolve(renderResult.container)
        })
        expect(container).toMatchSnapshot()

        if (container) {
            // this is the actual element where the click event triggers
            // opening of the dropdown
            const userProperty = container.querySelector('.Person > div > div:nth-child(1) > div:nth-child(2) > input')
            expect(userProperty).not.toBeNull()

            act(() => {
                userEvent.click(userProperty as Element)
            })
            expect(container).toMatchSnapshot()

            const option = await renderResult.findByText('username-4')
            expect(option).not.toBeNull()
            act(() => {
                userEvent.click(option as Element)
            })

            const confirmDialog = screen.getByTitle('Confirmation Dialog Box')
            expect(confirmDialog).toBeDefined()
            const cancelButton = within(confirmDialog).getByRole('button', {name: 'Cancel'})
            expect(cancelButton).toBeDefined()
            userEvent.click(cancelButton)

            expect(mockedMutator.createBoardMember).not.toBeCalled()
        } else {
            throw new Error('container should have been initialized')
        }
    })
})

// The toggle of specs 011: person·multiPerson properties may opt out of the
// 본부·부서 narrowing that spec 005 gave every board at once.
describe('properties/person organisation narrowing', () => {
    const mockStore = configureStore([])

    const orgBoard = TestBlockFactory.createBoard()
    orgBoard.teamId = 'team-id-1'
    orgBoard.cardProperties = [
        {id: 'prop-division', name: '본부', type: 'orgDivision', options: []},
        {id: 'prop-person', name: '담당자', type: 'person', options: []},
    ]
    const orgCard = TestBlockFactory.createCard(orgBoard)
    orgCard.fields.properties['prop-division'] = ['div-production']

    const boardUser = (id: string, username: string) => ({
        id,
        username,
        email: `${username}@example.com`,
        nickname: '',
        firstname: '',
        lastname: '',
        props: {},
        create_at: 1621315184,
        update_at: 1621315184,
        delete_at: 0,
        is_bot: false,
        is_guest: false,
        roles: 'system_user',
    })

    // The board lets its admin add people, so the picker searches the team and
    // narrows what comes back — the branch a real assignment goes through.
    beforeEach(() => {
        mockedOctoClient.searchTeamUsers.mockResolvedValue([
            boardUser('user-id-2', 'username-2'),
            boardUser('user-id-3', 'username-3'),
        ])
    })

    const orgState = {
        boards: {
            boards: {[orgBoard.id]: orgBoard},
            current: orgBoard.id,
            myBoardMemberships: {
                [orgBoard.id]: {userId: 'user-id-1', schemeAdmin: true},
            },
        },
        users: {
            me: {id: 'user-id-1', username: 'username-1', roles: 'system_user'},
            boardUsers: {
                'user-id-1': boardUser('user-id-1', 'username-1'),
                'user-id-2': boardUser('user-id-2', 'username-2'),
                'user-id-3': boardUser('user-id-3', 'username-3'),
            },
        },
        clientConfig: {
            value: {teammateNameDisplay: 'username'},
        },
        orgMaster: {
            orgUnitsByTeamId: {
                'team-id-1': [{id: 'div-production', name: '생산본부', type: 'division', parentId: ''}],
            },
            // username-2 sits in the 본부 the card names; username-3 sits nowhere.
            orgProfilesByTeamId: {
                'team-id-1': [{userId: 'user-id-2', orgUnitId: 'div-production'}],
            },
            dutiesByTeamId: {},
            loadedTeamIds: ['team-id-1'],
        },
    }

    const openPicker = async (orgScoped?: boolean) => {
        const template = {
            id: 'prop-person',
            name: '담당자',
            type: 'person',
            options: [],
            orgScoped,
        } as IPropertyTemplate

        const {container} = render(wrapIntl(
            <ReduxProvider store={mockStore(orgState)}>
                <ConfirmPerson
                    property={new PersonProperty()}
                    propertyValue={''}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                    propertyTemplate={template}
                    board={orgBoard}
                    card={orgCard}
                />
            </ReduxProvider>,
        ))

        const input = container.querySelector('input')
        await act(async () => {
            await userEvent.click(input!)
        })
        return container
    }

    test('narrows to the organisation the card names when the flag is unset', async () => {
        const container = await openPicker(undefined)

        expect(container.textContent).toContain('username-2')
        expect(container.textContent).not.toContain('username-3')
    })

    test('offers everyone when the flag is off', async () => {
        const container = await openPicker(false)

        expect(container.textContent).toContain('username-2')
        expect(container.textContent).toContain('username-3')
    })
})
