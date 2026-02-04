// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {render, screen, waitFor} from '@testing-library/react'

import {MemoryRouter} from 'react-router-dom'

import {Provider as ReduxProvider} from 'react-redux'

import userEvent from '@testing-library/user-event'

import configureStore from 'redux-mock-store'

import {mocked} from 'jest-mock'

import thunk from 'redux-thunk'

import {wrapIntl} from '../../testUtils'

import mutator from '../../mutator'

import octoClient from '../../octoClient'

import {IUser} from '../../user'

import WelcomePage from './welcomePage'

const w = (window as any)
const oldBaseURL = w.baseURL

const mockedNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockedNavigate,
}))

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

jest.mock('../../octoClient')
const mockedOctoClient = mocked(octoClient, true)

beforeEach(() => {
    jest.resetAllMocks()
    mockedNavigate.mockReset()
    mockedMutator.patchUserConfig.mockImplementation(() => Promise.resolve([
        {
            user_id: '',
            category: 'focalboard',
            name: 'welcomePageViewed',
            value: '1',
        },
    ]))
    mockedOctoClient.prepareOnboarding.mockResolvedValue({
        teamID: 'team_id_1',
        boardID: 'board_id_1',
    })
})

afterEach(() => {
    w.baseURL = oldBaseURL
})

describe('pages/welcome', () => {
    const mockStore = configureStore([thunk])
    const store = mockStore({
        teams: {
            current: {id: 'team_id_1'},
        },
        users: {
            me: {
                props: {},
            },
            myConfig: {
                onboardingTourStep: {value: '0'},
                tourCategory: {value: 'onboarding'},
            },
        },
    })

    test('Welcome Page shows Explore Page', () => {
        const component = (
            <ReduxProvider store={store}>
                {
                    wrapIntl(
                        <MemoryRouter initialEntries={['/welcome']}>
                            <WelcomePage/>
                        </MemoryRouter>,
                    )
                }
            </ReduxProvider>
        )

        const {container} = render(component)
        expect(screen.getByText('Take a tour')).toBeDefined()
        expect(container).toMatchSnapshot()
    })

    test('Welcome Page shows Explore Page with subpath', () => {
        w.baseURL = '/subpath'
        const component = (
            <ReduxProvider store={store}>
                {
                    wrapIntl(
                        <MemoryRouter initialEntries={['/welcome']}>
                            <WelcomePage/>
                        </MemoryRouter>,
                    )
                }
            </ReduxProvider>
        )

        const {container} = render(component)
        expect(screen.getByText('Take a tour')).toBeDefined()
        expect(container).toMatchSnapshot()
    })

    test('Welcome Page shows Explore Page And Then Proceeds after Clicking Explore', async () => {
        const component = (
            <ReduxProvider store={store}>
                {
                    wrapIntl(
                        <MemoryRouter initialEntries={['/welcome']}>
                            <WelcomePage/>
                        </MemoryRouter>,
                    )
                }
            </ReduxProvider>
        )

        render(component)
        const exploreButton = screen.getByText('No thanks, I\'ll figure it out myself')
        expect(exploreButton).toBeDefined()
        userEvent.click(exploreButton)
        await waitFor(() => {
            expect(mockedNavigate).toBeCalledWith('/team/team_id_1', {replace: true})
            expect(mockedMutator.patchUserConfig).toBeCalledTimes(1)
        })
    })

    test('Welcome Page does not render explore page the second time we visit it', async () => {
        const customStore = mockStore({
            teams: {
                current: {id: 'team_id_1'},
            },
            users: {
                me: {},
                myConfig: {
                    welcomePageViewed: {value: '1'},
                },
            },
        })

        const component = (
            <ReduxProvider store={customStore}>
                {
                    wrapIntl(
                        <MemoryRouter initialEntries={['/welcome']}>
                            <WelcomePage/>
                        </MemoryRouter>,
                    )
                }
            </ReduxProvider>
        )

        render(component)
        await waitFor(() => {
            expect(mockedNavigate).toBeCalledWith('/team/team_id_1', {replace: true})
        })
    })

    test('Welcome Page redirects us when we have a r query parameter with welcomePageViewed set to true', async () => {
        const customStore = mockStore({
            teams: {
                current: {id: 'team_id_1'},
            },
            users: {
                me: {},
                myConfig: {
                    welcomePageViewed: {value: '1'},
                },
            },
        })
        const component = (
            <ReduxProvider store={customStore}>
                {
                    wrapIntl(
                        <MemoryRouter initialEntries={['/welcome?r=123']}>
                            <WelcomePage/>
                        </MemoryRouter>,
                    )
                }
            </ReduxProvider>
        )

        render(component)
        await waitFor(() => {
            expect(mockedNavigate).toBeCalledWith('123', {replace: true})
        })
    })

    test('Welcome Page redirects us when we have a r query parameter with welcomePageViewed set to null', async () => {
        const localStore = mockStore({
            teams: {
                current: {id: 'team_id_1'},
            },
            users: {
                me: {
                    props: {},
                },
            },
        })

        const component = (
            <ReduxProvider store={localStore}>
                {
                    wrapIntl(
                        <MemoryRouter initialEntries={['/welcome?r=123']}>
                            <WelcomePage/>
                        </MemoryRouter>,
                    )
                }
            </ReduxProvider>
        )
        render(component)
        const exploreButton = screen.getByText('No thanks, I\'ll figure it out myself')
        expect(exploreButton).toBeDefined()
        userEvent.click(exploreButton)
        await waitFor(() => {
            expect(mockedNavigate).toBeCalledWith('123', {replace: true})
            expect(mockedMutator.patchUserConfig).toBeCalledTimes(1)
        })
    })

    test('Welcome page starts tour on clicking Take a tour button', async () => {
        const user = {} as unknown as IUser
        mockedOctoClient.getMe.mockResolvedValue(user)

        const component = (
            <ReduxProvider store={store}>
                {
                    wrapIntl(
                        <MemoryRouter initialEntries={['/welcome']}>
                            <WelcomePage/>
                        </MemoryRouter>,
                    )
                }
            </ReduxProvider>
        )
        render(component)
        const exploreButton = screen.getByText('Take a tour')
        expect(exploreButton).toBeDefined()
        userEvent.click(exploreButton)
        await waitFor(() => expect(mockedOctoClient.prepareOnboarding).toBeCalledTimes(1))
        await waitFor(() => expect(mockedNavigate).toBeCalledWith('/team/team_id_1/board_id_1', {replace: true}))
    })

    test('Welcome page skips tour on clicking no thanks option', async () => {
        const user = {} as unknown as IUser
        mockedOctoClient.getMe.mockResolvedValue(user)

        const component = (
            <ReduxProvider store={store}>
                {
                    wrapIntl(
                        <MemoryRouter initialEntries={['/welcome']}>
                            <WelcomePage/>
                        </MemoryRouter>,
                    )
                }
            </ReduxProvider>
        )
        render(component)
        const exploreButton = screen.getByText('No thanks, I\'ll figure it out myself')
        expect(exploreButton).toBeDefined()
        userEvent.click(exploreButton)
        await waitFor(() => expect(mockedNavigate).toBeCalledWith('/team/team_id_1', {replace: true}))
    })
})
