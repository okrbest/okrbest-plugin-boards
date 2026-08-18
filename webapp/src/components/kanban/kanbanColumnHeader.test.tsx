// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {fireEvent, render, screen, within, waitFor} from '@testing-library/react'
import {createIntl} from 'react-intl'
import userEvent from '@testing-library/user-event'
import {mocked} from 'jest-mock'
import {Provider as ReduxProvider} from 'react-redux'

import Mutator from '../../mutator'
import {wrapDNDIntl, mockStateStore} from '../../testUtils'
import {TestBlockFactory} from '../../test/testBlockFactory'
import {IPropertyOption} from '../../blocks/board'

import KanbanColumnHeader from './kanbanColumnHeader'
jest.mock('../../mutator')
const mockedMutator = mocked(Mutator, true)
describe('src/components/kanban/kanbanColumnHeader', () => {
    const intl = createIntl({locale: 'en-us'})
    const board = TestBlockFactory.createBoard()
    const activeView = TestBlockFactory.createBoardView(board)
    const card = TestBlockFactory.createCard(board)
    card.id = 'id1'
    activeView.fields.kanbanCalculations = {
        id1: {
            calculation: 'countEmpty',
            propertyId: '1',

        },
    }
    const option: IPropertyOption = {
        id: 'id1',
        value: 'Title',
        color: 'propColorDefault',
    }
    const state = {
        teams: {
            current: {id: 'team-id'},
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
    }
    const store = mockStateStore([], state)
    beforeAll(() => {
        console.error = jest.fn()
    })
    beforeEach(jest.resetAllMocks)
    test('should match snapshot', () => {
        const {container} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <KanbanColumnHeader
                    board={board}
                    activeView={activeView}
                    group={{
                        option,
                        cards: [card],
                    }}
                    intl={intl}
                    readonly={false}
                    addCard={jest.fn()}
                    addCardFromTemplate={jest.fn()}
                    defaultTemplateID={"1"}
                    propertyNameChanged={jest.fn()}
                    onDropToColumn={jest.fn()}
                    calculationMenuOpen={false}
                    onCalculationMenuOpen={jest.fn()}
                    onCalculationMenuClose={jest.fn()}
                />
            </ReduxProvider>,
        ))
        expect(container).toMatchSnapshot()
    })
    test('should match snapshot readonly', () => {
        const {container} = render(wrapDNDIntl(
            <ReduxProvider store={store}>
                <KanbanColumnHeader
                    board={board}
                    activeView={activeView}
                    group={{
                        option,
                        cards: [card],
                    }}
                    intl={intl}
                    readonly={true}
                    addCard={jest.fn()}
                    addCardFromTemplate={jest.fn()}
                    defaultTemplateID={"1"}
                    propertyNameChanged={jest.fn()}
                    onDropToColumn={jest.fn()}
                    calculationMenuOpen={false}
                    onCalculationMenuOpen={jest.fn()}
                    onCalculationMenuClose={jest.fn()}
                />
            </ReduxProvider>,
        ))
        expect(container).toMatchSnapshot()
    })
    test('return kanbanColumnHeader and click on menuwrapper', async () => {
         const {container} = render(wrapDNDIntl(
             <ReduxProvider store={store}>
                 <KanbanColumnHeader
                     board={board}
                     activeView={activeView}
                     group={{
                         option,
                         cards: [card],
                     }}
                     intl={intl}
                     readonly={false}
                     addCard={jest.fn()}
                     addCardFromTemplate={jest.fn()}
                     defaultTemplateID={"1"}
                     propertyNameChanged={jest.fn()}
                     onDropToColumn={jest.fn()}
                     calculationMenuOpen={false}
                     onCalculationMenuOpen={jest.fn()}
                     onCalculationMenuClose={jest.fn()}
                 />
             </ReduxProvider>,
         ))
         const buttonMenuWrapper = await screen.findByRole('button', {name: 'menuwrapper'})
         expect(buttonMenuWrapper).toBeDefined()
         await userEvent.click(buttonMenuWrapper)
         expect(container).toMatchSnapshot()
     })
    test('return kanbanColumnHeader, click on menuwrapper and click on hide menu', async () => {
         render(wrapDNDIntl(
             <ReduxProvider store={store}>
                 <KanbanColumnHeader
                     board={board}
                     activeView={activeView}
                     group={{
                         option,
                         cards: [card],
                     }}
                     intl={intl}
                     readonly={false}
                     addCard={jest.fn()}
                     addCardFromTemplate={jest.fn()}
                     defaultTemplateID={"1"}
                     propertyNameChanged={jest.fn()}
                     onDropToColumn={jest.fn()}
                     calculationMenuOpen={false}
                     onCalculationMenuOpen={jest.fn()}
                     onCalculationMenuClose={jest.fn()}
                 />
             </ReduxProvider>,
         ))
         const buttonMenuWrapper = await screen.findByRole('button', {name: 'menuwrapper'})
         expect(buttonMenuWrapper).toBeDefined()
         await userEvent.click(buttonMenuWrapper)
         const buttonHide = await within(buttonMenuWrapper).findByRole('button', {name: 'Hide'})
         expect(buttonHide).toBeDefined()
         await userEvent.click(buttonHide)
         expect(mockedMutator.hideViewColumn).toBeCalledTimes(1)
     })

    test('return kanbanColumnHeader and click to add card', async () => {
         const mockedAddCard = jest.fn()
         const {container} = render(wrapDNDIntl(
             <ReduxProvider store={store}>
                 <KanbanColumnHeader
                     board={board}
                     activeView={activeView}
                     group={{
                         option,
                         cards: [card],
                     }}
                     intl={intl}
                     readonly={false}
                     addCard={mockedAddCard}
                     addCardFromTemplate={jest.fn()}
                     defaultTemplateID={undefined}
                     propertyNameChanged={jest.fn()}
                     onDropToColumn={jest.fn()}
                     calculationMenuOpen={false}
                     onCalculationMenuOpen={jest.fn()}
                     onCalculationMenuClose={jest.fn()}
                 />
             </ReduxProvider>,
         ))
         const buttonAddCard = container.querySelector('.AddIcon')?.parentElement
         expect(buttonAddCard).toBeDefined()
         await userEvent.click(buttonAddCard!)
         expect(mockedAddCard).toBeCalledTimes(1)
     })
    test('return kanbanColumnHeader and click KanbanCalculationMenu', async () => {
         const mockedCalculationMenuOpen = jest.fn()
         render(wrapDNDIntl(
             <ReduxProvider store={store}>
                 <KanbanColumnHeader
                     board={board}
                     activeView={activeView}
                     group={{
                         option,
                         cards: [card],
                     }}
                     intl={intl}
                     readonly={false}
                     addCard={jest.fn()}
                     addCardFromTemplate={jest.fn()}
                     defaultTemplateID={"1"}
                     propertyNameChanged={jest.fn()}
                     onDropToColumn={jest.fn()}
                     calculationMenuOpen={false}
                     onCalculationMenuOpen={mockedCalculationMenuOpen}
                     onCalculationMenuClose={jest.fn()}
                 />
             </ReduxProvider>,
         ))
         const buttonKanbanCalculation = (await screen.findByText(/0/i)).parentElement
         expect(buttonKanbanCalculation).toBeDefined()
         await userEvent.click(buttonKanbanCalculation!)
         expect(mockedCalculationMenuOpen).toBeCalledTimes(1)
     })
    test('return kanbanColumnHeader and click count on KanbanCalculationMenu', async () => {
         render(wrapDNDIntl(
             <ReduxProvider store={store}>
                 <KanbanColumnHeader
                     board={board}
                     activeView={activeView}
                     group={{
                         option,
                         cards: [card],
                     }}
                     intl={intl}
                     readonly={false}
                     addCard={jest.fn()}
                     addCardFromTemplate={jest.fn()}
                     defaultTemplateID={"1"}
                     propertyNameChanged={jest.fn()}
                     onDropToColumn={jest.fn()}
                     calculationMenuOpen={true}
                     onCalculationMenuOpen={jest.fn()}
                     onCalculationMenuClose={jest.fn()}
                 />
             </ReduxProvider>,
         ))
         const menuCountEmpty = await screen.findByText('Count')
         expect(menuCountEmpty).toBeDefined()
         await userEvent.click(menuCountEmpty)
         expect(mockedMutator.changeViewKanbanCalculations).toBeCalledTimes(1)
     })

    // U-07 — 잠긴 보드에서 에디터는 열 이름·색·삭제를 못 한다. 열 숨기기는 뷰를
    // 바꾸는 일이라 그대로 남는다.
    describe('속성 편집 잠금', () => {
        const lockedStore = (membership: Record<string, unknown>) => {
            const locked = {...board, properties: {adminOnlyCardProperties: true}}
            return {
                locked,
                store: mockStateStore([], {
                    teams: {current: {id: 'team-id'}},
                    boards: {
                        current: locked.id,
                        boards: {[locked.id]: locked},
                        myBoardMemberships: {[locked.id]: membership},
                    },
                }),
            }
        }

        const renderHeader = (membership: Record<string, unknown>) => {
            const {locked, store: lockedStoreInstance} = lockedStore(membership)
            return render(wrapDNDIntl(
                <ReduxProvider store={lockedStoreInstance}>
                    <KanbanColumnHeader
                        board={locked}
                        activeView={activeView}
                        group={{option, cards: [card]}}
                        groupByProperty={locked.cardProperties[0]}
                        intl={intl}
                        readonly={false}
                        addCard={jest.fn()}
                        addCardFromTemplate={jest.fn()}
                        defaultTemplateID={'1'}
                        propertyNameChanged={jest.fn()}
                        onDropToColumn={jest.fn()}
                        calculationMenuOpen={false}
                        onCalculationMenuOpen={jest.fn()}
                        onCalculationMenuClose={jest.fn()}
                    />
                </ReduxProvider>,
            ))
        }

        test('에디터는 열 삭제·색을 못 본다', async () => {
            const {container} = renderHeader({userId: 'user_id_1', schemeEditor: true})

            const menu = await screen.findByRole('button', {name: 'menuwrapper'})
            await userEvent.click(menu)

            expect(screen.queryByText('Delete')).toBeNull()

            // 숨기기는 뷰 조작이라 남는다.
            expect(screen.getByText('Hide')).toBeDefined()

            // 이름도 못 바꾼다.
            expect(container.querySelector('.Editable')?.getAttribute('readonly')).not.toBeNull()
        })

        test('보드 관리자는 열 삭제를 본다', async () => {
            renderHeader({userId: 'user_id_1', schemeAdmin: true})

            const menu = await screen.findByRole('button', {name: 'menuwrapper'})
            await userEvent.click(menu)

            expect(screen.getByText('Delete')).toBeDefined()
        })
    })
})
