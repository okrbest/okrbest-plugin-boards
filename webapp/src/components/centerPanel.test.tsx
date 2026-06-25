// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen, within, act} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import {mocked} from 'jest-mock'
import {Provider as ReduxProvider} from 'react-redux'

import {mockDOM, mockStateStore, wrapDNDIntl} from '../testUtils'
import {TestBlockFactory} from '../test/testBlockFactory'
import {IPropertyTemplate} from '../blocks/board'
import {Utils} from '../utils'
import {IUser} from '../user'
import octoClient from '../octoClient'
import Mutator from '../mutator'
import {Constants} from '../constants'

import {mockMMStore} from '../../tests/mock_window'

import CenterPanel from './centerPanel'

Object.defineProperty(Constants, 'versionString', {value: '1.0.0'})
jest.mock('react-router-dom', () => {
    const originalModule = jest.requireActual('react-router-dom')

    return {
        ...originalModule,
        useParams: jest.fn(() => ({
            boardId: '1',
            viewId: '1',
        })),
        useNavigate: jest.fn(() => jest.fn()),
        useLocation: jest.fn(() => ({pathname: '/board/view', search: ''})),
    }
})
jest.mock('../utils')
jest.mock('../octoClient')
jest.mock('../mutator')
jest.mock('../telemetry/telemetryClient')
const mockedUtils = mocked(Utils, true)
const mockedMutator = mocked(Mutator, true)
const mockedOctoClient = mocked(octoClient, true)
mockedUtils.createGuid.mockReturnValue('test-id')
mockedUtils.generateClassName = jest.requireActual('../utils').Utils.generateClassName
mockedMutator.fetchSubCards.mockResolvedValue([])
describe('components/centerPanel', () => {
    (window as any).store = mockMMStore
    const board = TestBlockFactory.createBoard()
    board.id = '1'
    board.teamId = 'team_id'
    const activeView = TestBlockFactory.createBoardView(board)
    activeView.id = '1'
    const card1 = TestBlockFactory.createCard(board)
    card1.id = '1'
    card1.title = 'card1'
    card1.fields.isTemplate = true
    card1.fields.properties = {id: 'property_value_id_1'}
    const card2 = TestBlockFactory.createCard(board)
    card2.id = '2'
    card2.title = 'card2'
    card2.fields.properties = {id: 'property_value_id_1'}
    const comment1 = TestBlockFactory.createComment(card1)
    comment1.id = '1'
    const comment2 = TestBlockFactory.createComment(card2)
    comment2.id = '2'
    const groupProperty: IPropertyTemplate = {
        id: 'id',
        name: 'name',
        type: 'text',
        options: [
            {
                color: 'propColorOrange',
                id: 'property_value_id_1',
                value: 'Q1',
            },
            {
                color: 'propColorBlue',
                id: 'property_value_id_2',
                value: 'Q2',
            },
        ],
    }
    const state = {
        clientConfig: {
            value: {},
        },
        searchText: '',
        users: {
            me: {
                id: 'user_id_1',
            },
            myConfig: {
                onboardingTourStarted: {value: false},
            },
            boardUsers: {
                'user-id-1': {username: 'username_1'},
            },
            blockSubscriptions: [],
        },
        teams: {
            current: {id: 'team_id'},
        },
        boards: {
            current: board.id,
            boards: {
                [board.id]: board,
            },
            templates: [],
            myBoardMemberships: {
                [board.id]: {userId: 'user_id_1', schemeAdmin: true},
            },
        },
        limits: {
            limits: {
                cards: 0,
                used_cards: 0,
                card_limit_timestamp: 0,
                views: 0,
            },
        },
        cards: {
            templates: [card1, card2],
            cards: [card1, card2],
            current: card1.id,
            modifiedCardIds: [],
            subCardsByParent: {},
            subCardCountByParent: {},
        },
        views: {
            views: {
                boardView: activeView,
            },
            current: 'boardView',
        },
        contents: {
            contents: [],
            contentsByCard: {},
        },
        comments: {
            comments: [comment1, comment2],
            commentsByCard: {
                [card1.id]: [comment1],
                [card2.id]: [comment2],
            },
        },
        imits: {
            limits: {
                views: 0,
            },
        },
    }
    mockedOctoClient.searchTeamUsers.mockResolvedValue(Object.values(state.users.boardUsers) as IUser[])
    const store = mockStateStore([], state)
    beforeAll(() => {
        mockDOM()
        console.error = jest.fn()
    })
    beforeEach(() => {
        activeView.fields.viewType = 'board'
        jest.clearAllMocks()
    })
    test('should match snapshot for Kanban, not shared', () => {
        const {container} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <CenterPanel
                    cards={[card1]}
                    views={[activeView]}
                    board={board}
                    activeView={activeView}
                    readonly={false}
                    showCard={jest.fn()}
                    groupByProperty={groupProperty}
                    shownCardId={card1.id}
                    hiddenCardsCount={0}
                />
            </ReduxProvider>,
        ))
        expect(container).toMatchSnapshot()
    })
    test('should match snapshot for Kanban', () => {
        const {container} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <CenterPanel
                    cards={[card1]}
                    views={[activeView]}
                    board={board}
                    activeView={activeView}
                    readonly={false}
                    showCard={jest.fn()}
                    groupByProperty={groupProperty}
                    shownCardId={card1.id}
                    hiddenCardsCount={0}
                />
            </ReduxProvider>,
        ))
        expect(container).toMatchSnapshot()
    })
    test('should match snapshot for Gallery', () => {
        activeView.fields.viewType = 'gallery'
        const {container} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <CenterPanel
                    cards={[card1]}
                    views={[activeView]}
                    board={board}
                    activeView={activeView}
                    readonly={false}
                    showCard={jest.fn()}
                    groupByProperty={groupProperty}
                    shownCardId={card1.id}
                    hiddenCardsCount={0}
                />
            </ReduxProvider>,
        ))
        expect(container).toMatchSnapshot()
    })
    test('should match snapshot for Table', () => {
        activeView.fields.viewType = 'table'
        const {container} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <CenterPanel
                    cards={[card1]}
                    views={[activeView]}
                    board={board}
                    activeView={activeView}
                    readonly={false}
                    showCard={jest.fn()}
                    groupByProperty={groupProperty}
                    shownCardId={card1.id}
                    hiddenCardsCount={0}
                />
            </ReduxProvider>,
        ))
        expect(container).toMatchSnapshot()
    })

    test('shows subcard in kanban list when subcard is in board cards', () => {
        activeView.fields.viewType = 'board'
        card2.fields.parentCardId = card1.id

        const {container} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <CenterPanel
                    cards={[card1]}
                    views={[activeView]}
                    board={board}
                    activeView={activeView}
                    readonly={false}
                    showCard={jest.fn()}
                    groupByProperty={groupProperty}
                    shownCardId={card1.id}
                    hiddenCardsCount={0}
                />
            </ReduxProvider>,
        ))

        const kanbanCardElements = container.querySelectorAll('.KanbanCard')
        expect(kanbanCardElements).toHaveLength(2)

        card2.fields.parentCardId = ''
    })

    test('keeps table list unchanged with parent-only props cards', () => {
        activeView.fields.viewType = 'table'
        card2.fields.parentCardId = card1.id

        render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <CenterPanel
                    cards={[card1]}
                    views={[activeView]}
                    board={board}
                    activeView={activeView}
                    readonly={false}
                    showCard={jest.fn()}
                    groupByProperty={groupProperty}
                    shownCardId={card1.id}
                    hiddenCardsCount={0}
                />
            </ReduxProvider>,
        ))

        expect(screen.getByRole('textbox', {name: 'card1'})).toBeInTheDocument()
        expect(screen.queryByRole('textbox', {name: 'card2'})).not.toBeInTheDocument()

        card2.fields.parentCardId = ''
    })
    describe('return centerPanel and', () => {
          test('select one card and click background', async () => {
              activeView.fields.viewType = 'table'
              const {container} = render(wrapDNDIntl(
                  <ReduxProvider store={store}>
                      <CenterPanel
                          cards={[card1, card2]}
                          views={[activeView]}
                          board={board}
                          activeView={activeView}
                          readonly={false}
                          showCard={jest.fn()}
                          groupByProperty={groupProperty}
                          shownCardId={card1.id}
                          hiddenCardsCount={0}
                      />
                  </ReduxProvider>,
              ))

              //select card
              const cardElement = await screen.findByRole('textbox', {name: 'card1'})
              expect(cardElement).not.toBeNull()
              await userEvent.click(cardElement, {shiftKey: true})
              expect(container).toMatchSnapshot()

              //background
              const boardElement = container.querySelector('.BoardComponent')
              expect(boardElement).not.toBeNull()
              await userEvent.click(boardElement!)
              expect(container).toMatchSnapshot()
          })

        test('press touch 1 with readonly', () => {
            activeView.fields.viewType = 'table'
            const {container, baseElement} = render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <CenterPanel
                        cards={[card1, card2]}
                        views={[activeView]}
                        board={board}
                        activeView={activeView}
                        readonly={true}
                        showCard={jest.fn()}
                        groupByProperty={groupProperty}
                        shownCardId={card1.id}
                        hiddenCardsCount={0}
                    />
                </ReduxProvider>,
            ))

            //touch '1'
            fireEvent.keyDown(baseElement, {keyCode: 49})
            expect(container).toMatchSnapshot()
        })

          test('press touch esc for one card selected', async () => {
              activeView.fields.viewType = 'table'
              const {container, baseElement} = render(wrapDNDIntl(
                  <ReduxProvider store={store}>
                      <CenterPanel
                          cards={[card1, card2]}
                          views={[activeView]}
                          board={board}
                          activeView={activeView}
                          readonly={false}
                          showCard={jest.fn()}
                          groupByProperty={groupProperty}
                          shownCardId={card1.id}
                          hiddenCardsCount={0}
                      />
                  </ReduxProvider>,
              ))

              await act(async () => {
                  const cardElement = await screen.findByRole('textbox', {name: 'card1'})
                  expect(cardElement.parentNode).not.toBeNull()
                  await userEvent.click(cardElement as HTMLElement, {shiftKey: true})
              })
              expect(container).toMatchSnapshot()

              //escape
              fireEvent.keyDown(baseElement, {keyCode: 27})
              expect(container).toMatchSnapshot()
          })
         test('press touch esc for two cards selected', async () => {
             activeView.fields.viewType = 'table'
             const {container, baseElement} = render(wrapDNDIntl(
                 <ReduxProvider store={store}>
                     <CenterPanel
                         cards={[card1, card2]}
                         views={[activeView]}
                         board={board}
                         activeView={activeView}
                         readonly={false}
                         showCard={jest.fn()}
                         groupByProperty={groupProperty}
                         shownCardId={card1.id}
                         hiddenCardsCount={0}
                     />
                 </ReduxProvider>,
             ))

             await act(async () => {
                 //select card1
                 const card1Element = await screen.findByRole('textbox', {name: 'card1'})
                 expect(card1Element).not.toBeNull()
                 await userEvent.click(card1Element, {shiftKey: true})
             })
             expect(container).toMatchSnapshot()

             await act(async () => {
                 //select card2
                 const card2Element = await screen.findByRole('textbox', {name: 'card2'})
                 expect(card2Element).not.toBeNull()
                 await userEvent.click(card2Element, {shiftKey: true, ctrlKey: true})
             })
             expect(container).toMatchSnapshot()

             //escape
             fireEvent.keyDown(baseElement, {keyCode: 27})
             expect(container).toMatchSnapshot()
         })
         test('press touch del for one card selected', async () => {
             activeView.fields.viewType = 'table'
             const {container, baseElement} = render(wrapDNDIntl(
                 <ReduxProvider store={store}>
                     <CenterPanel
                         cards={[card1, card2]}
                         views={[activeView]}
                         board={board}
                         activeView={activeView}
                         readonly={false}
                         showCard={jest.fn()}
                         groupByProperty={groupProperty}
                         shownCardId={card1.id}
                         hiddenCardsCount={0}
                     />
                 </ReduxProvider>,
             ))
             await act(async () => {
                 const cardElement = await screen.findByRole('textbox', {name: 'card1'})
                 expect(cardElement).not.toBeNull()
                 await userEvent.click(cardElement, {shiftKey: true})
             })
             expect(container).toMatchSnapshot()

             //delete
             fireEvent.keyDown(baseElement, {keyCode: 8})
             expect(mockedMutator.performAsUndoGroup).toBeCalledTimes(1)
         })
         test('press touch ctrl+d for one card selected', async () => {
             activeView.fields.viewType = 'table'
             const {container, baseElement} = render(wrapDNDIntl(
                 <ReduxProvider store={store}>
                     <CenterPanel
                         cards={[card1, card2]}
                         views={[activeView]}
                         board={board}
                         activeView={activeView}
                         readonly={false}
                         showCard={jest.fn()}
                         groupByProperty={groupProperty}
                         shownCardId={card1.id}
                         hiddenCardsCount={0}
                     />
                 </ReduxProvider>,
             ))
             await act(async () => {
                 const cardElement = await screen.findByRole('textbox', {name: 'card1'})
                 expect(cardElement).not.toBeNull()
                 await userEvent.click(cardElement, {shiftKey: true})
             })
             expect(container).toMatchSnapshot()

             //ctrl+d
             fireEvent.keyDown(baseElement, {ctrlKey: true, keyCode: 68})
             expect(mockedMutator.performAsUndoGroup).toBeCalledTimes(1)
         })
        test('click on card to show card', () => {
            activeView.fields.viewType = 'board'
            const mockedShowCard = jest.fn()
            const {container} = render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <CenterPanel
                        cards={[card1, card2]}
                        views={[activeView]}
                        board={board}
                        activeView={activeView}
                        readonly={false}
                        showCard={mockedShowCard}
                        groupByProperty={groupProperty}
                        shownCardId={card1.id}
                        hiddenCardsCount={0}
                    />
                </ReduxProvider>,
            ))

            const kanbanCardElements = container.querySelectorAll('.KanbanCard')
            expect(kanbanCardElements).not.toBeNull()
            const kanbanCardElement = kanbanCardElements[0]
            userEvent.click(kanbanCardElement)
            expect(container).toMatchSnapshot()
            expect(mockedShowCard).toBeCalledWith(card1.id)
        })
        test('click on new card to add card', () => {
            activeView.fields.viewType = 'table'
            const {container} = render(wrapDNDIntl(
                <ReduxProvider store={store}>
                    <CenterPanel
                        cards={[card1, card2]}
                        views={[activeView]}
                        board={board}
                        activeView={activeView}
                        readonly={false}
                        showCard={jest.fn()}
                        groupByProperty={groupProperty}
                        shownCardId={card1.id}
                        hiddenCardsCount={0}
                    />
                </ReduxProvider>,
            ))
            const buttonWithMenuElement = container.querySelector('.ButtonWithMenu')
            expect(buttonWithMenuElement).not.toBeNull()
            userEvent.click(buttonWithMenuElement!)
            expect(mockedMutator.performAsUndoGroup).toBeCalledTimes(1)
        })
         test('click on new card to add card template', async () => {
             activeView.fields.viewType = 'table'
             const {container} = render(wrapDNDIntl(
                 <ReduxProvider store={store}>
                     <CenterPanel
                         cards={[card1, card2]}
                         views={[activeView]}
                         board={board}
                         activeView={activeView}
                         readonly={false}
                         showCard={jest.fn()}
                         groupByProperty={groupProperty}
                         shownCardId={card1.id}
                         hiddenCardsCount={0}
                     />
                 </ReduxProvider>,
             ))
             const elementMenuWrapper = container.querySelector('.ButtonWithMenu > div.MenuWrapper')
             expect(elementMenuWrapper).not.toBeNull()
             await userEvent.click(elementMenuWrapper!)
             const buttonNewTemplate = await within(elementMenuWrapper!.parentElement!).findByRole('button', {name: 'New template'})
             await userEvent.click(buttonNewTemplate)
             expect(mockedMutator.insertBlock).toBeCalledTimes(1)
         })

         test('click on new card to add card from template', async () => {
             activeView.fields.viewType = 'table'
             activeView.fields.defaultTemplateId = '1'
             const {container} = render(wrapDNDIntl(
                 <ReduxProvider store={store}>
                     <CenterPanel
                         cards={[card1, card2]}
                         views={[activeView]}
                         board={board}
                         activeView={activeView}
                         readonly={false}
                         showCard={jest.fn()}
                         groupByProperty={groupProperty}
                         shownCardId={card1.id}
                         hiddenCardsCount={0}
                     />
                 </ReduxProvider>,
             ))
             const elementMenuWrapper = container.querySelector('.ButtonWithMenu > div.MenuWrapper')
             expect(elementMenuWrapper).not.toBeNull()
             await userEvent.click(elementMenuWrapper!)
             const elementCard1 = await within(elementMenuWrapper!.parentElement!).findByRole('button', {name: 'card1'})
             expect(elementCard1).not.toBeNull()
             await userEvent.click(elementCard1)
             expect(mockedMutator.performAsUndoGroup).toBeCalledTimes(1)
         })

         test('click on new card to edit template', async () => {
             activeView.fields.viewType = 'table'
             activeView.fields.defaultTemplateId = '1'
             const {container} = render(wrapDNDIntl(
                 <ReduxProvider store={store}>
                     <CenterPanel
                         cards={[card1, card2]}
                         views={[activeView]}
                         board={board}
                         activeView={activeView}
                         readonly={false}
                         showCard={jest.fn()}
                         groupByProperty={groupProperty}
                         shownCardId={card1.id}
                         hiddenCardsCount={0}
                     />
                 </ReduxProvider>,
             ))
             const elementMenuWrapper = container.querySelector('.ButtonWithMenu > div.MenuWrapper')
             expect(elementMenuWrapper).not.toBeNull()
             await userEvent.click(elementMenuWrapper!)
             const elementCard1 = await within(elementMenuWrapper!.parentElement!).findByRole('button', {name: 'card1'})
             expect(elementCard1).not.toBeNull()
             const elementMenuWrapperCard1 = await within(elementCard1).findByRole('button', {name: 'menuwrapper'})
             expect(elementMenuWrapperCard1).not.toBeNull()
             await userEvent.click(elementMenuWrapperCard1)
             const elementEditMenuTemplate = await within(elementMenuWrapperCard1).findByRole('button', {name: 'Edit'})
             expect(elementMenuWrapperCard1).not.toBeNull()
             await userEvent.click(elementEditMenuTemplate)
             expect(container).toMatchSnapshot()
         })
    })
})

describe('components/centerPanel', () => {
    const board = TestBlockFactory.createBoard()
    board.id = '1'
    const activeView = TestBlockFactory.createBoardView(board)
    activeView.id = '1'
    const card1 = TestBlockFactory.createCard(board)
    card1.id = '1'
    card1.title = 'card1'
    card1.fields.properties = {id: 'property_value_id_1'}
    card1.limited = true
    const card2 = TestBlockFactory.createCard(board)
    card2.id = '2'
    card2.title = 'card2'
    card2.fields.properties = {id: 'property_value_id_1'}
    card2.limited = true
    const comment1 = TestBlockFactory.createComment(card1)
    comment1.id = '1'
    const comment2 = TestBlockFactory.createComment(card2)
    comment2.id = '2'
    const groupProperty: IPropertyTemplate = {
        id: 'id',
        name: 'name',
        type: 'text',
        options: [
            {
                color: 'propColorOrange',
                id: 'property_value_id_1',
                value: 'Q1',
            },
            {
                color: 'propColorBlue',
                id: 'property_value_id_2',
                value: 'Q2',
            },
        ],
    }
    const state = {
        clientConfig: {
            value: {},
        },
        searchText: '',
        users: {
            me: {
                id: 'user_id_1',
            },
            myConfig: {
                onboardingTourStarted: {value: false},
            },
            workspaceUsers: [
                {username: 'username_1'},
            ],
            boardUsers: [
                {username: 'username_1'},
            ],
            blockSubscriptions: [],
        },
        teams: {
            current: {id: 'team-id'},
        },
        boards: {
            current: board.id,
            boards: {
                [board.id]: board,
            },
            templates: [],
            myBoardMemberships: {
                [board.id]: {userId: 'user_id_1', schemeAdmin: true},
            },
        },
        cards: {
            templates: [card1, card2],
            cards: [card1, card2],
            current: card1.id,
            modifiedCardIds: [],
            subCardsByParent: {},
            subCardCountByParent: {},
        },
        views: {
            views: {
                boardView: activeView,
            },
            current: 'boardView',
        },
        contents: {},
        comments: {
            comments: [comment1, comment2],
        },
        limits: {
            limits: {
                views: 0,
            },
        },
    }
    const store = mockStateStore([], state)
    beforeAll(() => {
        mockDOM()
        console.error = jest.fn()
    })
    beforeEach(() => {
        activeView.fields.viewType = 'board'
        jest.clearAllMocks()
    })

    test('Clicking on the Hidden card count should open a dailog', () => {
        activeView.fields.viewType = 'table'
        activeView.fields.defaultTemplateId = '1'
        const {container, getByTitle, getByText} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <CenterPanel
                    cards={[card1, card2]}
                    views={[activeView]}
                    board={board}
                    activeView={activeView}
                    readonly={false}
                    showCard={jest.fn()}
                    groupByProperty={groupProperty}
                    shownCardId={card1.id}
                    hiddenCardsCount={2}
                />
            </ReduxProvider>,
        ))
        fireEvent.click(getByTitle('hidden-card-count'))
        expect(getByText('2 cards hidden from board')).not.toBeNull()
        expect(container).toMatchSnapshot()
    })
})
