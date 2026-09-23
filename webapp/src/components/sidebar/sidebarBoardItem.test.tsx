// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {mocked} from 'jest-mock'

import {MemoryRouter} from 'react-router-dom'

import {render, screen, waitFor, act} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {Provider as ReduxProvider} from 'react-redux'

import configureStore from 'redux-mock-store'

import {TestBlockFactory} from '../../test/testBlockFactory'

import {wrapIntl, wrapRBDNDDroppable} from '../../testUtils'

import octoClient from '../../octoClient'
import mutator from '../../mutator'
import {sendFlashMessage} from '../flashMessages'

import SidebarBoardItem from './sidebarBoardItem'

jest.mock('../../octoClient')
jest.mock('../../mutator')
jest.mock('../flashMessages')
const mockedOctoClient = mocked(octoClient, true)
const mockedMutator = mocked(mutator, true)
const mockedSendFlashMessage = mocked(sendFlashMessage)

describe('components/sidebarBoardItem', () => {
    const board = TestBlockFactory.createBoard()
    board.id = 'board_id_1'

    const view = TestBlockFactory.createBoardView(board)
    view.fields.sortOptions = []

    const categoryBoards1 = TestBlockFactory.createCategoryBoards()
    categoryBoards1.name = 'Category 1'
    categoryBoards1.boardMetadata = [{boardID: board.id, hidden: false}]

    const categoryBoards2 = TestBlockFactory.createCategoryBoards()
    categoryBoards2.name = 'Category 2'

    const categoryBoards3 = TestBlockFactory.createCategoryBoards()
    categoryBoards3.name = 'Category 3'

    const allCategoryBoards = [
        categoryBoards1,
        categoryBoards2,
        categoryBoards3,
    ]

    const state = {
        users: {
            me: {
                id: 'user_id_1',
            },
        },
        boards: {
            current: board.id,
            boards: {
                [board.id]: board,
            },
            myBoardMemberships: {
                [board.id]: {userId: 'user_id_1', schemeAdmin: true},
            },
        },
        views: {
            current: view.id,
            views: {
                [view.id]: view,
            },
        },
        teams: {
            current: {
                id: 'team-id',
            },
        },
    }

    test('sidebar board item', async () => {
        const mockStore = configureStore([])
        const store = mockStore(state)

        const component = wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id/board_id_1']}>
                    <SidebarBoardItem
                        index={0}
                        categoryBoards={categoryBoards1}
                        board={board}
                        allCategories={allCategoryBoards}
                        isActive={true}
                        showBoard={jest.fn()}
                        showView={jest.fn()}
                        onDeleteRequest={jest.fn()}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))
        const {container} = render(component)
        await waitFor(async () => {
            const elementMenuWrapper = container.querySelector('.SidebarBoardItem div.MenuWrapper')
            expect(elementMenuWrapper).not.toBeNull()
            await act(async () => {
                userEvent.click(elementMenuWrapper!)
            })
        })
        expect(container).toMatchSnapshot()
    })

    test('renders default icon if no custom icon set', () => {
        const mockStore = configureStore([])
        const store = mockStore(state)
        const noIconBoard = {...board, icon: ''}

        const component = wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id/board_id_1']}>
                    <SidebarBoardItem
                        index={0}
                        categoryBoards={categoryBoards1}
                        board={noIconBoard}
                        allCategories={allCategoryBoards}
                        isActive={true}
                        showBoard={jest.fn()}
                        showView={jest.fn()}
                        onDeleteRequest={jest.fn()}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))
        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    test('sidebar board item for guest', async () => {
        const mockStore = configureStore([])
        const store = mockStore({...state, users: {me: {is_guest: true}}})

        const component = wrapRBDNDDroppable(wrapIntl(
            <ReduxProvider store={store}>
                <MemoryRouter initialEntries={['/team/team-id/board_id_1']}>
                    <SidebarBoardItem
                        index={0}
                        categoryBoards={categoryBoards1}
                        board={board}
                        allCategories={allCategoryBoards}
                        isActive={true}
                        showBoard={jest.fn()}
                        showView={jest.fn()}
                        onDeleteRequest={jest.fn()}
                    />
                </MemoryRouter>
            </ReduxProvider>,
        ))
        const {container} = render(component)
        await waitFor(async () => {
            const elementMenuWrapper = container.querySelector('.SidebarBoardItem div.MenuWrapper')
            expect(elementMenuWrapper).not.toBeNull()
            await act(async () => {
                userEvent.click(elementMenuWrapper!)
            })
        })
        expect(container).toMatchSnapshot()
    })
    // --- 016: 숨기기 직후 실행 취소 알림 (contracts/ui-surfaces.md U-07·U-08·U-09) ---
    describe('hide board undo notice', () => {
        // 현재 보드가 아닌 보드를 숨긴다. 현재 보드를 숨기면 다른 보드로 이동하는 기존 분기가 섞인다.
        const otherCurrent = {...state, boards: {...state.boards, current: 'some_other_board'}}

        const hideViaMenu = async () => {
            const mockStore = configureStore([])
            const store = mockStore(otherCurrent)
            const showBoard = jest.fn()
            const component = wrapRBDNDDroppable(wrapIntl(
                <ReduxProvider store={store}>
                    <MemoryRouter initialEntries={['/team/team-id/board_id_1']}>
                        <SidebarBoardItem
                            index={0}
                            categoryBoards={categoryBoards1}
                            board={board}
                            allCategories={allCategoryBoards}
                            isActive={false}
                            showBoard={showBoard}
                            showView={jest.fn()}
                            onDeleteRequest={jest.fn()}
                        />
                    </MemoryRouter>
                </ReduxProvider>,
            ))
            const {container} = render(component)
            const menuWrapper = container.querySelector('.SidebarBoardItem div.MenuWrapper')
            expect(menuWrapper).not.toBeNull()
            await userEvent.click(menuWrapper!)
            await userEvent.click(await screen.findByText('Hide board'))
            await waitFor(() => expect(mockedOctoClient.hideBoard).toHaveBeenCalledWith(categoryBoards1.id, board.id))
            return {showBoard}
        }

        beforeEach(() => {
            jest.clearAllMocks()
            mockedOctoClient.hideBoard.mockResolvedValue({ok: true} as Response)
            mockedMutator.unhideBoard.mockResolvedValue(true)
        })

        test('U-07: hiding shows a notice with the board title, an Undo action, and a 5.2s duration', async () => {
            await hideViaMenu()

            expect(mockedSendFlashMessage).toHaveBeenCalledTimes(1)
            expect(mockedSendFlashMessage).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining(board.title),
                severity: 'low',
                durationMs: 5200,
                action: expect.objectContaining({label: 'Undo'}),
            }))
        })

        test('U-08: Undo restores the board through mutator.unhideBoard without navigating', async () => {
            const {showBoard} = await hideViaMenu()

            const notice = mockedSendFlashMessage.mock.calls[0][0]
            await act(async () => {
                await notice.action?.onClick()
            })

            expect(mockedMutator.unhideBoard).toHaveBeenCalledWith(categoryBoards1.id, board.id)
            expect(showBoard).not.toHaveBeenCalled()
            expect(mockedSendFlashMessage).toHaveBeenCalledTimes(1)
        })

        test('U-09: a failed Undo raises a high-severity notice', async () => {
            mockedMutator.unhideBoard.mockResolvedValue(false)
            await hideViaMenu()

            const notice = mockedSendFlashMessage.mock.calls[0][0]
            await act(async () => {
                await notice.action?.onClick()
            })

            expect(mockedSendFlashMessage).toHaveBeenCalledTimes(2)
            expect(mockedSendFlashMessage.mock.calls[1][0]).toEqual(expect.objectContaining({severity: 'high'}))
        })
    })
})
