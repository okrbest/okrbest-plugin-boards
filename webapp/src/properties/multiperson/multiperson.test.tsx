// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'

import {render, waitFor, act, screen} from '@testing-library/react'
import {mocked} from 'jest-mock'

import configureStore from 'redux-mock-store'

import userEvent from '@testing-library/user-event'

import {wrapIntl} from '../../testUtils'
import {IPropertyTemplate, Board} from '../../blocks/board'
import {Card} from '../../blocks/card'

import octoClient from '../../octoClient'
import mutator from '../../mutator'

import MultiPersonProperty from './property'
import MultiPerson from './multiperson'

jest.mock('../../octoClient')
jest.mock('../../mutator')
const mockedOctoClient = mocked(octoClient, true)
const mockedMutator = mocked(mutator, true)

describe('properties/multiperson', () => {
    const mockStore = configureStore([])

    const state = {
        users: {
            boardUsers: {
                'user-id-1': {
                    id: 'user-id-1',
                    username: 'username-1',
                    email: 'user-1@example.com',
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

    test('not readonly not existing user', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MultiPerson
                    property={new MultiPersonProperty()}
                    propertyValue={['user-id-4']}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                    propertyTemplate={{
                        id: 'personPropertyID',
                        name: 'My Person Property',
                        type: 'multiPerson',
                        options: [],
                    } as IPropertyTemplate}
                    board={{} as Board}
                    card={{} as Card}
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

    test('not readonly', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MultiPerson
                    property={new MultiPersonProperty()}
                    propertyValue={['user-id-1', 'user-id-2']}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                    propertyTemplate={{
                        id: 'personPropertyID',
                        name: 'My Person Property',
                        type: 'multiPerson',
                        options: [],
                    } as IPropertyTemplate}
                    board={{} as Board}
                    card={{} as Card}
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

    test('readonly view', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MultiPerson
                    property={new MultiPersonProperty()}
                    propertyValue={['user-id-1', 'user-id-2']}
                    readOnly={true}
                    showEmptyPlaceholder={false}
                    propertyTemplate={{
                        id: 'personPropertyID',
                        name: 'My Person Property',
                        type: 'multiPerson',
                        options: [],
                    } as IPropertyTemplate}
                    board={{} as Board}
                    card={{} as Card}
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

    test('user dropdown open', async () => {
        const store = mockStore(state)
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <MultiPerson
                    property={new MultiPersonProperty()}
                    propertyValue={['user-id-1', 'user-id-2']}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                    propertyTemplate={{
                        id: 'personPropertyID',
                        name: 'My Person Property',
                        type: 'multiPerson',
                        options: [],
                    } as IPropertyTemplate}
                    board={{} as Board}
                    card={{} as Card}
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

        if (container) {
            // this is the actual element where the click event triggers
            // opening of the dropdown
            const userProperty = container.querySelector('.MultiPerson > div > div:nth-child(1) > div:nth-child(3) > input')
            expect(userProperty).not.toBeNull()

            act(() => {
                userEvent.click(userProperty as Element)
            })
            expect(container).toMatchSnapshot()
        } else {
            throw new Error('container should have been initialized')
        }
    })
})

// 보드 멤버가 아닌 사용자를 선택하면 "보드에 추가" 확인 다이얼로그가 떠야 하고,
// 확인 전에는 카드를 패치하지 않아야 한다. 즉시 패치하면 card.updateAt이 바뀌어
// 표 행(key = card.id + card.updateAt)이 재마운트되고, 행 안에 렌더된 다이얼로그가
// 로컬 state와 함께 날아간다 — "팝업이 잠깐 떴다 사라지는" 버그의 근본 원인.
describe('properties/multiperson — 비멤버 선택 확인 다이얼로그', () => {
    const mockStore = configureStore([])

    const member = {
        id: 'member-1',
        username: 'memberuser',
        email: 'member@example.com',
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
    }
    const nonMember = {...member, id: 'nonmember-1', username: 'nonmember'}

    const state = {
        users: {boardUsers: {[member.id]: member}, me: null},
        clientConfig: {value: {teammateNameDisplay: 'username'}},
        boards: {boards: {}, myBoardMemberships: {}, membersInBoards: {}},
        boardPermissions: {byBoardId: {}},
    }

    const board = {id: 'board-1', teamId: 'team-1', type: 'O', minimumRole: 'viewer'} as unknown as Board
    const card = {id: 'card-1', fields: {properties: {}}} as unknown as Card

    const renderEditor = () => render(wrapIntl(
        <ReduxProvider store={mockStore(state)}>
            <MultiPerson
                property={new MultiPersonProperty()}
                propertyValue={[]}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={{
                    id: 'personPropertyID',
                    name: '기여자',
                    type: 'multiPerson',
                    options: [],
                } as IPropertyTemplate}
                board={board}
                card={card}
            />
        </ReduxProvider>,
    ))

    beforeEach(() => {
        jest.clearAllMocks()
        mockedOctoClient.searchTeamUsers.mockResolvedValue([member, nonMember] as never)
    })

    test('비멤버 선택: 다이얼로그가 뜨고, 확인 전에는 카드를 패치하지 않는다', async () => {
        const {container} = renderEditor()

        const input = container.querySelector('.react-select__input-container input') as HTMLElement
        await act(async () => {
            await userEvent.click(input)
        })
        await waitFor(() => expect(screen.getByText('nonmember')).toBeDefined())

        await act(async () => {
            await userEvent.click(screen.getByText('nonmember'))
        })

        // 다이얼로그가 떠 있다
        await waitFor(() => expect(screen.getByText('Add nonmember to board')).toBeDefined())

        // 확인 전에는 어떤 저장도 일어나지 않는다 — 즉시 패치가 다이얼로그를 죽이는 원인이다
        expect(mockedMutator.changePropertyValue).not.toHaveBeenCalled()
        expect(mockedMutator.createBoardMember).not.toHaveBeenCalled()
    })

    test('다이얼로그 확인: 멤버 추가와 값 저장이 그때 일어난다', async () => {
        const {container} = renderEditor()

        const input = container.querySelector('.react-select__input-container input') as HTMLElement
        await act(async () => {
            await userEvent.click(input)
        })
        await waitFor(() => expect(screen.getByText('nonmember')).toBeDefined())
        await act(async () => {
            await userEvent.click(screen.getByText('nonmember'))
        })
        await waitFor(() => expect(screen.getByText('Add to board')).toBeDefined())

        await act(async () => {
            await userEvent.click(screen.getByText('Add to board'))
        })

        expect(mockedMutator.createBoardMember).toHaveBeenCalledWith(expect.objectContaining({boardId: 'board-1', userId: 'nonmember-1'}))
        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith('board-1', card, 'personPropertyID', ['nonmember-1'])
    })
})
