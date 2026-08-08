// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'

import {render, waitFor, act} from '@testing-library/react'

import configureStore from 'redux-mock-store'

import userEvent from '@testing-library/user-event'

import {wrapIntl} from '../testUtils'

import PersonProperty from '../properties/person/property'

import PersonSelector from './personSelector'

describe('properties/person', () => {
    const mockStore = configureStore([])
    const state = {
        users: {
            me: {
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

    test('not readOnly, show username', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <PersonSelector
                    readOnly={false}
                    userIDs={['user-id-1']}
                    allowAddUsers={false}
                    property={new PersonProperty()}
                    emptyDisplayValue={'Empty'}
                    isMulti={false}
                    closeMenuOnSelect={true}
                    onChange={() => {}}
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
    })

    test('not readOnly, show firstname', async () => {
        const store = mockStore({
            ...state,
            clientConfig: {
                value: {
                    teammateNameDisplay: 'full_name',
                },
            },
        })
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <PersonSelector
                    readOnly={false}
                    userIDs={['user-id-1']}
                    allowAddUsers={false}
                    property={new PersonProperty()}
                    emptyDisplayValue={'Empty'}
                    isMulti={false}
                    closeMenuOnSelect={true}
                    onChange={() => {}}
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
    })

    test('not readOnly, show modal', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <PersonSelector
                    readOnly={false}
                    userIDs={[]}
                    allowAddUsers={false}
                    property={new PersonProperty()}
                    emptyDisplayValue={'Empty'}
                    isMulti={false}
                    closeMenuOnSelect={true}
                    onChange={() => {}}
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

            const userList = container.querySelector('.Person-item')
            expect(userList).not.toBeNull()
            expect(container).toMatchSnapshot()
        } else {
            throw new Error('container should have been initialized')
        }
    })

    test('readOnly view', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <PersonSelector
                    readOnly={true}
                    userIDs={['user-id-1']}
                    allowAddUsers={false}
                    property={new PersonProperty()}
                    emptyDisplayValue={'Empty'}
                    isMulti={false}
                    closeMenuOnSelect={true}
                    onChange={() => {}}
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
            expect(userProperty).toBeNull()
        } else {
            throw new Error('container should have been initialized')
        }
    })

    test('show multiple', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <PersonSelector
                    readOnly={false}
                    userIDs={['user-id-1', 'user-id-2']}
                    allowAddUsers={false}
                    property={new PersonProperty()}
                    emptyDisplayValue={'Empty'}
                    isMulti={true}
                    closeMenuOnSelect={true}
                    onChange={() => {}}
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
    })
    test('show multiple, display modal', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <PersonSelector
                    readOnly={false}
                    userIDs={['user-id-1', 'user-id-2']}
                    allowAddUsers={false}
                    property={new PersonProperty()}
                    emptyDisplayValue={'(empty)'}
                    isMulti={true}
                    closeMenuOnSelect={true}
                    onChange={() => {}}
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
            const userProperty = container.querySelector('.MultiPerson > div > div:nth-child(1) > div:nth-child(3) > input')
            expect(userProperty).not.toBeNull()

            act(() => {
                userEvent.click(userProperty as Element)
            })
            const userList = container.querySelector('.MultiPerson-item')
            expect(userList).not.toBeNull()
            expect(container).toMatchSnapshot()
        } else {
            throw new Error('container should have been initialized')
        }
    })

    test('not readOnly, show me', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <PersonSelector
                    readOnly={false}
                    showMe={true}
                    userIDs={[]}
                    allowAddUsers={false}
                    property={new PersonProperty()}
                    emptyDisplayValue={'Empty'}
                    isMulti={false}
                    closeMenuOnSelect={true}
                    onChange={() => {}}
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

        // expect(container).toMatchSnapshot()
        if (container) {
            // this is the actual element where the click event triggers
            // opening of the dropdown
            const userProperty = container.querySelector('.Person > div > div:nth-child(1) > div:nth-child(2) > input')
            expect(userProperty).not.toBeNull()
            act(() => {
                userEvent.click(userProperty as Element)
            })

            const userList = container.querySelector('.Person-item')
            expect(userList).not.toBeNull()
            console.log('Text content ' + userList?.textContent)
            expect(userList?.textContent).toBe('Me')
            expect(container).toMatchSnapshot()
        } else {
            throw new Error('container should have been initialized')
        }
        expect(container).toMatchSnapshot()
    })

    // The narrowing has to be invisible to every caller that does not ask for
    // it, otherwise adding an organisation property to one board would change
    // how person pickers behave everywhere.
    describe('allowedUserIds', () => {
        const openMenu = async (allowedUserIds?: Set<string> | null) => {
            const {container} = render(wrapIntl(
                <ReduxProvider store={mockStore(state)}>
                    <PersonSelector
                        readOnly={false}
                        userIDs={[]}
                        allowAddUsers={false}
                        property={new PersonProperty()}
                        emptyDisplayValue={'Empty'}
                        isMulti={true}
                        closeMenuOnSelect={false}
                        allowedUserIds={allowedUserIds}
                        onChange={() => {}}
                    />
                </ReduxProvider>,
            ))

            const input = container.querySelector('input')
            await act(async () => {
                await userEvent.click(input!)
            })
            return container
        }

        test('offers everyone when the prop is absent', async () => {
            const container = await openMenu(undefined)

            expect(container.textContent).toContain('username-1')
            expect(container.textContent).toContain('username-2')
            expect(container.textContent).toContain('username-3')
        })

        test('offers everyone when the prop is null', async () => {
            const container = await openMenu(null)

            expect(container.textContent).toContain('username-2')
            expect(container.textContent).toContain('username-3')
        })

        test('offers only the users in the set', async () => {
            const container = await openMenu(new Set(['user-id-2']))

            expect(container.textContent).toContain('username-2')
            expect(container.textContent).not.toContain('username-1')
            expect(container.textContent).not.toContain('username-3')
        })

        test('an empty set really does offer nobody', async () => {
            // Distinct from null. If a card names an organisation that nobody
            // belongs to, the honest answer is an empty list, not everyone.
            const container = await openMenu(new Set<string>())

            expect(container.textContent).not.toContain('username-1')
            expect(container.textContent).not.toContain('username-2')
        })
    })
})
