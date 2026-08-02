// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import {thunk} from 'redux-thunk'

import React from 'react'
import {mocked} from 'jest-mock'

import {IUser} from '../../user'
import {ISharing} from '../../blocks/sharing'
import {BoardMember} from '../../blocks/board'
import {Channel} from '../../store/channels'
import {TestBlockFactory} from '../../test/testBlockFactory'
import {mockStateStore, wrapDNDIntl} from '../../testUtils'
import client from '../../octoClient'
import {Utils} from '../../utils'

import mutator from '../../mutator'

import ShareBoard from './shareBoard'

jest.useFakeTimers()

const boardId = '1'
const workspaceId: string|undefined = boardId
const viewId = boardId

jest.mock('../../octoClient')
jest.mock('../../utils')

const mockedOctoClient = mocked(client, true)
const mockedUtils = mocked(Utils, true)

let params: Record<string, string> = {}
jest.mock('react-router-dom', () => {
    const originalModule = jest.requireActual('react-router-dom')

    return {
        ...originalModule,
        useParams: jest.fn(() => params),
    }
})

const board = TestBlockFactory.createBoard()
board.id = boardId
board.teamId = 'team-id'
board.cardProperties = [
    {
        id: 'property1',
        name: 'Property 1',
        type: 'text',
        options: [
            {
                id: 'value1',
                value: 'value 1',
                color: 'propColorBrown',
            },
        ],
    },
    {
        id: 'property2',
        name: 'Property 2',
        type: 'select',
        options: [
            {
                id: 'value2',
                value: 'value 2',
                color: 'propColorBlue',
            },
        ],
    },
]
board.channelId = 'channel_1'

const activeView = TestBlockFactory.createBoardView(board)
activeView.id = 'view1'
activeView.fields.hiddenOptionIds = []
activeView.fields.visiblePropertyIds = ['property1']
activeView.fields.visibleOptionIds = ['value1']

const fakeBoard = {id: board.id}
activeView.boardId = fakeBoard.id

const card1 = TestBlockFactory.createCard(board)
card1.id = 'card1'
card1.title = 'card-1'
card1.boardId = fakeBoard.id

const card2 = TestBlockFactory.createCard(board)
card2.id = 'card2'
card2.title = 'card-2'
card2.boardId = fakeBoard.id

const card3 = TestBlockFactory.createCard(board)
card3.id = 'card3'
card3.title = 'card-3'
card3.boardId = fakeBoard.id

const me: IUser = {
    id: 'user-id-1',
    username: 'username_1',
    email: '',
    nickname: '',
    firstname: '',
    lastname: '',
    props: {},
    create_at: 0,
    update_at: 0,
    is_bot: false,
    is_guest: false,
    roles: 'system_user',
}

const categoryAttribute1 = TestBlockFactory.createCategoryBoards()
categoryAttribute1.name = 'Category 1'
categoryAttribute1.boardMetadata = [{boardID: board.id, hidden: false}]

describe('src/components/shareBoard/shareBoard', () => {
    const w = (window as any)
    const oldBaseURL = w.baseURL

    const state = {
        teams: {
            current: {id: 'team-id', title: 'Test Team'},
        },
        users: {
            me,
            boardUsers: {[me.id]: me},
            blockSubscriptions: [],
        },
        boards: {
            current: board.id,
            boards: {
                [board.id]: board,
            },
            templates: [],
            membersInBoards: {
                [board.id]: {},
            },
            myBoardMemberships: {
                [board.id]: {userId: me.id, schemeAdmin: true},
            },
        },
        globalTemplates: {
            value: [],
        },
        views: {
            views: {
                [activeView.id]: activeView,
            },
            current: activeView.id,
        },
        cards: {
            templates: [],
            cards: [card1, card2, card3],
        },
        searchText: {},
        clientConfig: {
            value: {
                telemetry: true,
                telemetryid: 'telemetry',
                enablePublicSharedBoards: true,
                teammateNameDisplay: 'username',
            },
        },
        contents: {
            contents: {},
        },
        comments: {
            comments: {},
        },
        sidebar: {
            categoryAttributes: [
                categoryAttribute1,
            ],
        },
    }

    const store = mockStateStore([thunk], state)
    beforeEach(() => {
        jest.clearAllMocks()
        mockedUtils.buildURL.mockImplementation((path) => (w.baseURL || '') + path)

        params = {
            boardId,
            viewId,
            workspaceId,
        }

        mockedOctoClient.getChannel.mockResolvedValue({type: 'P', display_name: 'Dunder Mifflin Party Planing Committee'} as Channel)
    })

    afterEach(() => {
        w.baseURL = oldBaseURL
    })

     test('should match snapshot', async () => {
         const sharing: ISharing = {
             id: '',
             enabled: false,
             token: '',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)
         let container
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={true}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         expect(container).toMatchSnapshot()
         const shareButton = await screen.findByRole('button', {name: 'Share'})
         expect(shareButton).toBeDefined()
         const closeButton = await screen.findByRole('button', {name: 'Close dialog'})
         expect(closeButton).toBeDefined()
     })

     test('should match snapshot with sharing', async () => {
         const sharing: ISharing = {
             id: boardId,
             enabled: true,
             token: 'oneToken',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)

         let container
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={true}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })
         const copyLinkElement = await screen.findByTitle('Copy link')
         expect(copyLinkElement).toBeDefined()

         expect(container).toMatchSnapshot()
     })

     test('return shareBoard and click Copy link', async () => {
         const sharing: ISharing = {
             id: boardId,
             enabled: true,
             token: 'oneToken',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)

         let container
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={true}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         expect(container).toMatchSnapshot()

         const copyLinkElement = await screen.findByTitle('Copy link')
         expect(copyLinkElement).toBeDefined()

         act(() => {
             userEvent.click(copyLinkElement!)
         })

         expect(mockedUtils.copyTextToClipboard).toBeCalledTimes(1)
         expect(container).toMatchSnapshot()

         const copiedLinkElement = await screen.findByText('Copied!')
         expect(copiedLinkElement).toBeDefined()
     })

     test('return shareBoard and click Regenerate token', async () => {
         window.confirm = jest.fn(() => {
             return true
         })
         const sharing: ISharing = {
             id: boardId,
             enabled: true,
             token: 'oneToken',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)

         let container
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={true}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         sharing.token = 'anotherToken'
         mockedUtils.createGuid.mockReturnValue('anotherToken')
         mockedOctoClient.getSharing.mockResolvedValue(sharing)
         mockedOctoClient.setSharing.mockResolvedValue(true)

         const publishButton = await screen.findByRole('button', {name: 'Publish'})
         expect(publishButton).toBeDefined()
         userEvent.click(publishButton)
         await act(async () => {
             jest.runOnlyPendingTimers()
         })

         const regenerateTokenElement = await screen.findByRole('button', {name: 'Regenerate token'})
         expect(regenerateTokenElement).toBeDefined()
         userEvent.click(regenerateTokenElement)
         await act(async () => {
             jest.runOnlyPendingTimers()
         })
         expect(mockedOctoClient.setSharing).toBeCalledTimes(1)
         expect(container).toMatchSnapshot()
     })

     test('return shareBoard, and click switch', async () => {
         const sharing: ISharing = {
             id: boardId,
             enabled: true,
             token: 'oneToken',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)
         let container: Element | undefined
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={true}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         const publishButton = await screen.findByRole('button', {name: 'Publish'})
         expect(publishButton).toBeDefined()
         userEvent.click(publishButton)
         await act(async () => {
             jest.runOnlyPendingTimers()
         })

         const switchElement = container?.querySelector('.Switch')
         expect(switchElement).toBeDefined()
         await act(async () => {
             userEvent.click(switchElement!)
         })

         expect(mockedOctoClient.setSharing).toBeCalledTimes(1)
         expect(mockedOctoClient.getSharing).toBeCalledTimes(2)
         expect(container).toMatchSnapshot()
     })

     test('return shareBoardComponent and click Switch without sharing (null sharing)', async () => {
         mockedOctoClient.getSharing.mockResolvedValue(undefined as unknown as ISharing)
         mockedUtils.createGuid.mockReturnValue('aToken')
         let container: Element | undefined
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={true}
                         />
                     </ReduxProvider>),
             )
             container = result.container
         })

         mockedOctoClient.getSharing.mockResolvedValue({
             id: boardId,
             enabled: true,
             token: 'aToken',
         })

         const publishButton = await screen.findByRole('button', {name: 'Publish'})
         expect(publishButton).toBeDefined()
         userEvent.click(publishButton)
         await act(async () => {
             jest.runOnlyPendingTimers()
         })

         const switchElement = container?.querySelector('.Switch')
         expect(switchElement).toBeDefined()
         await act(async () => {
             userEvent.click(switchElement!)
             jest.runOnlyPendingTimers()
         })

         expect(mockedOctoClient.setSharing).toBeCalledTimes(1)
         expect(mockedOctoClient.getSharing).toBeCalledTimes(2)
         expect(mockedUtils.createGuid).toBeCalledTimes(1)
         expect(container).toMatchSnapshot()
     })

    test('should match snapshot with sharing and without workspaceId and subpath', async () => {
        w.baseURL = '/test-subpath/plugins/boards'
        const sharing: ISharing = {
            id: boardId,
            enabled: true,
            token: 'oneToken',
        }
        params = {
            boardId,
            viewId,
        }
        mockedOctoClient.getSharing.mockResolvedValue(sharing)
        let container
        await act(async () => {
            const result = render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <ShareBoard
                        onClose={jest.fn()}
                        enableSharedBoards={true}
                    />
                </ReduxProvider>),
)
            container = result.container
        })
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot with sharing and subpath', async () => {
        w.baseURL = '/test-subpath/plugins/boards'
        const sharing: ISharing = {
            id: boardId,
            enabled: true,
            token: 'oneToken',
        }
        mockedOctoClient.getSharing.mockResolvedValue(sharing)
        let container
        await act(async () => {
            const result = render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <ShareBoard
                        onClose={jest.fn()}
                        enableSharedBoards={true}
                    />
                </ReduxProvider>),
)
            container = result.container
        })
        expect(container).toMatchSnapshot()
    })

     test('return shareBoard and click Select', async () => {
         const sharing: ISharing = {
             id: '',
             enabled: false,
             token: '',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)
         mockedUtils.isFocalboardPlugin.mockReturnValue(true)
         mockedUtils.getUserDisplayName.mockImplementation((u) => u.username)

         const users: IUser[] = [
             {id: 'userid1', username: 'username_1'} as IUser,
             {id: 'userid2', username: 'username_2'} as IUser,
             {id: 'userid3', username: 'username_3'} as IUser,
             {id: 'userid4', username: 'username_4'} as IUser,
         ]
         const channels: Channel[] = [
             {id: 'channel1', type: 'P', display_name: 'Channel 1'} as Channel,
             {id: 'channel2', type: 'P', display_name: 'Channel 2'} as Channel,
             {id: 'channel3', type: 'O', display_name: 'Channel 3'} as Channel,
             {id: 'channel4', type: 'O', display_name: 'Channel 4'} as Channel,
         ]

         mockedOctoClient.searchTeamUsers.mockResolvedValue(users)
         mockedOctoClient.searchUserChannels.mockResolvedValue(channels)

         let container
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={false}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         expect(container).toMatchSnapshot()
         const selectElement = await screen.findByText('Search for people and channels')
         expect(selectElement).toBeDefined()

         await act(async () => {
             userEvent.click(selectElement!)
         })

         expect(container).toMatchSnapshot()
     })

     test('return shareBoard and click Select, non-plugin mode', async () => {
         const sharing: ISharing = {
             id: '',
             enabled: false,
             token: '',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)
         const users: IUser[] = [
             {id: 'userid1', username: 'username_1', permissions: ['manage_team']} as IUser,
             {id: 'userid2', username: 'username_2', permissions: ['manage_system']} as IUser,
             {id: 'userid3', username: 'username_3'} as IUser,
             {id: 'userid4', username: 'username_4'} as IUser,
         ]
         const channels: Channel[] = [
             {id: 'channel1', type: 'P', display_name: 'Channel 1'} as Channel,
             {id: 'channel2', type: 'P', display_name: 'Channel 2'} as Channel,
             {id: 'channel3', type: 'O', display_name: 'Channel 3'} as Channel,
             {id: 'channel4', type: 'O', display_name: 'Channel 4'} as Channel,
         ]

         mockedOctoClient.searchTeamUsers.mockResolvedValue(users)
         mockedOctoClient.searchUserChannels.mockResolvedValue(channels)

         let container
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={false}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         expect(container).toMatchSnapshot()
         const selectElement = await screen.findByText('Search for people and channels')
         expect(selectElement).toBeDefined()

         await act(async () => {
             userEvent.click(selectElement!)
         })

         expect(container).toMatchSnapshot()
     })

     test('confirm unlinking linked channel', async () => {
         const sharing: ISharing = {
             id: '',
             enabled: false,
             token: '',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)
         mockedUtils.isFocalboardPlugin.mockReturnValue(true)

         let container: Element | DocumentFragment | null = null
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={store}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={true}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         expect(container).toMatchSnapshot()

         const channelMenuBtn = container!.querySelector('.user-item.channel-item .MenuWrapper')
         expect(channelMenuBtn).not.toBeNull()
         userEvent.click(channelMenuBtn as Element)

         const unlinkOption = await screen.findByText('Unlink')
         expect(unlinkOption).not.toBeNull()
         userEvent.click(unlinkOption)

         const unlinkConfirmationBtn = await screen.findByText('Unlink channel')
         expect(unlinkConfirmationBtn).not.toBeNull()
         userEvent.click(unlinkConfirmationBtn)

         expect(mockedOctoClient.patchBoard).toBeCalled()

         const closeButton = await screen.findByRole('button', {name: 'Close dialog'})
         expect(closeButton).toBeDefined()
     })

     test('should match snapshot, with template', async () => {
         const sharing: ISharing = {
             id: '',
             enabled: false,
             token: '',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)

         board.isTemplate = true
         const myStore = mockStateStore([thunk], state)

         let container
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={myStore}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={true}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         expect(container).toMatchSnapshot()
         const closeButton = await screen.findByRole('button', {name: 'Close dialog'})
         expect(closeButton).toBeDefined()
     })

     test('return shareBoard template and click Select', async () => {
         const sharing: ISharing = {
             id: '',
             enabled: false,
             token: '',
         }
         mockedOctoClient.getSharing.mockResolvedValue(sharing)
         mockedUtils.isFocalboardPlugin.mockReturnValue(true)
         mockedUtils.getUserDisplayName.mockImplementation((u) => u.username)

         const users: IUser[] = [
             {id: 'userid1', username: 'username_1'} as IUser,
             {id: 'userid2', username: 'username_2'} as IUser,
             {id: 'userid3', username: 'username_3'} as IUser,
             {id: 'userid4', username: 'username_4'} as IUser,
         ]
         const channels: Channel[] = [
             {id: 'channel1', type: 'P', display_name: 'Channel 1'} as Channel,
             {id: 'channel2', type: 'P', display_name: 'Channel 2'} as Channel,
             {id: 'channel3', type: 'O', display_name: 'Channel 3'} as Channel,
             {id: 'channel4', type: 'O', display_name: 'Channel 4'} as Channel,
         ]

         mockedOctoClient.searchTeamUsers.mockResolvedValue(users)
         mockedOctoClient.searchUserChannels.mockResolvedValue(channels)

         board.isTemplate = true
         const myStore = mockStateStore([thunk], state)

         let container
         await act(async () => {
             const result = render(
                 wrapDNDIntl(
                     <ReduxProvider store={myStore}>
                         <ShareBoard
                             onClose={jest.fn()}
                             enableSharedBoards={false}
                         />
                     </ReduxProvider>),

             )
             container = result.container
         })

         expect(container).toMatchSnapshot()
         const selectElement = await screen.findByText('Search for people')
         expect(selectElement).toBeDefined()

         await act(async () => {
             userEvent.click(selectElement!)
         })

         expect(mockedOctoClient.searchUserChannels).not.toBeCalled()
         expect(container).toMatchSnapshot()
     })

    test('selecting a user adds them to the board users state', async () => {
        board.isTemplate = false
        mockedOctoClient.getSharing.mockResolvedValue({id: '', enabled: false, token: ''} as ISharing)
        mockedOctoClient.getBoardMembers.mockResolvedValue([])
        mockedOctoClient.getTeamUsersList.mockResolvedValue([])
        mockedUtils.isFocalboardPlugin.mockReturnValue(true)
        mockedUtils.getUserDisplayName.mockImplementation((u) => u.username)

        const newUser = {id: 'userid9', username: 'username_9'} as IUser
        mockedOctoClient.searchTeamUsers.mockResolvedValue([newUser])
        mockedOctoClient.searchUserChannels.mockResolvedValue([])
        mockedOctoClient.createBoardMember.mockResolvedValue({boardId, userId: newUser.id, schemeViewer: true} as BoardMember)
        const createMemberSpy = jest.spyOn(mutator, 'createBoardMember')

        let container: HTMLElement|undefined
        await act(async () => {
            const result = render(
                wrapDNDIntl(
                    <ReduxProvider store={store}>
                        <ShareBoard
                            onClose={jest.fn()}
                            enableSharedBoards={false}
                        />
                    </ReduxProvider>),
            )
            container = result.container
        })

        const selectElement = await screen.findByText('Search for people and channels')
        await act(async () => {
            userEvent.click(selectElement!)
        })

        await screen.findByText('username_9')
        const input = container!.querySelector('input[id^="react-select"]') as HTMLElement
        await act(async () => {
            fireEvent.keyDown(input, {key: 'ArrowDown', code: 'ArrowDown'})
            fireEvent.keyDown(input, {key: 'Enter', code: 'Enter'})
        })

        expect(createMemberSpy).toHaveBeenCalledWith(
            expect.objectContaining({boardId, userId: newUser.id}),
            newUser,
        )
    })

    test('refreshes the board members when the dialog opens', async () => {
        board.isTemplate = false
        mockedOctoClient.getSharing.mockResolvedValue({id: '', enabled: false, token: ''} as ISharing)
        mockedOctoClient.getBoardMembers.mockResolvedValue([])
        mockedOctoClient.getTeamUsersList.mockResolvedValue([])

        await act(async () => {
            render(
                wrapDNDIntl(
                    <ReduxProvider store={store}>
                        <ShareBoard
                            onClose={jest.fn()}
                            enableSharedBoards={false}
                        />
                    </ReduxProvider>),
            )
        })

        expect(mockedOctoClient.getBoardMembers).toHaveBeenCalledWith('team-id', boardId)
    })
})
