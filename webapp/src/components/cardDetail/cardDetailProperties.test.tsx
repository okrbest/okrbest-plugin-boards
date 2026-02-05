// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {mocked} from 'jest-mock'
import '@testing-library/jest-dom'
import {createIntl} from 'react-intl'

import configureStore from 'redux-mock-store'
import {Provider as ReduxProvider} from 'react-redux'

import {wrapIntl, wrapRBDNDContext} from '../../testUtils'
import {TestBlockFactory} from '../../test/testBlockFactory'
import mutator from '../../mutator'
import propsRegistry from '../../properties'
import {PropertyType} from '../../properties/types'

import CardDetailProperties from './cardDetailProperties'

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

describe('components/cardDetail/CardDetailProperties', () => {
    const board = TestBlockFactory.createBoard()
    board.cardProperties = [
        {
            id: 'property_id_1',
            name: 'Owner',
            type: 'select',
            options: [
                {
                    color: 'propColorDefault',
                    id: 'property_value_id_1',
                    value: 'Jean-Luc Picard',
                },
                {
                    color: 'propColorDefault',
                    id: 'property_value_id_2',
                    value: 'William Riker',
                },
                {
                    color: 'propColorDefault',
                    id: 'property_value_id_3',
                    value: 'Deanna Troi',
                },
            ],
        },
        {
            id: 'property_id_2',
            name: 'MockStatus',
            type: 'number',
            options: [],
        },
    ]

    const view = TestBlockFactory.createBoardView(board)
    view.fields.sortOptions = []
    view.fields.groupById = undefined
    view.fields.hiddenOptionIds = []
    const views = [view]

    const card = TestBlockFactory.createCard(board)
    card.fields.properties.property_id_1 = 'property_value_id_1'
    card.fields.properties.property_id_2 = '1234'

    const cardTemplate = TestBlockFactory.createCard(board)
    cardTemplate.fields.isTemplate = true

    const cards = [card]

    const state = {
        users: {
            me: {
                id: 'user_id_1',
            },
            myConfig: {
                onboardingTourStarted: {value: true},
                tourCategory: {value: 'card'},
                onboardingTourStep: {value: '1'},
            },
        },
        teams: {
            current: {id: 'team-id'},
        },
        boards: {
            boards: {
                [board.id]: board,
            },
            current: board.id,
            myBoardMemberships: {
                [board.id]: {userId: 'user_id_1', schemeAdmin: true},
            },
        },
        cards: {
            cards: {
                [card.id]: card,
            },
            current: card.id,
        },
        clientConfig: {
            value: {},
        },
    }

    const mockStore = configureStore([])
    let store = mockStore(state)

    beforeEach(() => {
        store = mockStore(state)
    })

    function renderComponent() {
        const component = wrapRBDNDContext(
            wrapIntl(
                <ReduxProvider store={store}>
                    <CardDetailProperties
                        board={board!}
                        card={card}
                        cards={[card]}
                        activeView={view}
                        views={views}
                        readonly={false}
                    />
                </ReduxProvider>,
            ),
        )

        return render(component)
    }

    it('should match snapshot', async () => {
        const {container} = renderComponent()
        expect(container).toMatchSnapshot()
    })

    it('should show confirmation dialog when deleting existing select property', async () => {
         renderComponent()

         const menuElement = await screen.findByRole('button', {name: 'Owner'})
         await userEvent.click(menuElement)

         const deleteButton = await screen.findByRole('button', {name: /delete/i})
         await userEvent.click(deleteButton)

         expect(await screen.findByRole('heading', {name: 'Confirm delete property'})).toBeInTheDocument()
         expect(await screen.findByRole('button', {name: /delete/i})).toBeInTheDocument()
     })

    it('should show property types menu', async () => {
         const intl = createIntl({locale: 'en'})
         const {container} = renderComponent()

         const menuElement = await screen.findByRole('button', {name: /add a property/i})
         await userEvent.click(menuElement)
         expect(container).toMatchSnapshot()

         const selectProperty = await screen.findByText(/select property type/i)
         expect(selectProperty).toBeInTheDocument()

         propsRegistry.list().forEach((type: PropertyType) => {
             const typeButton = screen.getByRole('button', {name: type.displayName(intl)})
             expect(typeButton).toBeInTheDocument()
         })
     })

    it('should allow change property types menu, confirm', async () => {
         const user = userEvent.setup()
         const {container} = renderComponent()

         const menuElement = await screen.findByRole('button', {name: 'Owner'})
         await user.click(menuElement)

         const typeSubMenu = container.querySelector('#type')
         expect(typeSubMenu).not.toBeNull()
         await user.click(typeSubMenu!)

         const newTypeMenu = await screen.findByRole('button', {name: 'Text'})
         await user.click(newTypeMenu)

         expect(await screen.findByRole('heading', {name: 'Confirm property type change'})).toBeInTheDocument()
         expect(await screen.findByRole('button', {name: /Change property/i})).toBeInTheDocument()
     })

    test('rename select property and confirm button on dialog should rename property', async () => {
        const user = userEvent.setup()
        const result = renderComponent()

        const propertyLabel = result.container.querySelector('.MenuWrapper')
        expect(propertyLabel).toBeDefined()
        await user.click(propertyLabel!)

        const propertyNameInput = result.container.querySelector('.PropertyMenu.menu-textbox') as HTMLInputElement
        expect(propertyNameInput).toBeDefined()
        await user.clear(propertyNameInput!)
        await user.type(propertyNameInput!, 'Owner - Renamed{enter}')
        await user.click(propertyLabel!)

        const propertyTemplate = board.cardProperties[0]

        expect(mockedMutator.changePropertyTypeAndName).toBeCalledTimes(1)
        expect(mockedMutator.changePropertyTypeAndName).toHaveBeenCalledWith(board, cards, propertyTemplate, 'select', 'Owner - Renamed')
    })

    it('should add new number property', async () => {
         const user = userEvent.setup()
         renderComponent()

         const menuElement = await screen.findByRole('button', {name: /add a property/i})
         await user.click(menuElement)

         const numberType = await screen.findByRole('button', {name: /number/i})
         await user.click(numberType)

         expect(mockedMutator.insertPropertyTemplate).toHaveBeenCalledTimes(1)

         const args = mockedMutator.insertPropertyTemplate.mock.calls[0]
         const template = args[3]
         expect(template).toBeTruthy()
         expect(template!.name).toMatch(/number/i)
         expect(template!.type).toBe('number')
     })

    it('confirmation on delete dialog should delete the property', async () => {
         renderComponent()

         const propertyTemplate = board.cardProperties[0]

         // Open property menu
         const menuElement = await screen.findByRole('button', {name: 'Owner'})
         await userEvent.click(menuElement)

         // Click delete option in menu
         const deleteOption = await screen.findByRole('button', {name: /^delete$/i})
         await userEvent.click(deleteOption)

         // Confirm dialog should appear
         expect(await screen.findByRole('heading', {name: 'Confirm delete property'})).toBeInTheDocument()

         // Click confirm button in dialog
         const confirmButton = await screen.findByTitle('Delete')
         expect(confirmButton).toBeDefined()
         await userEvent.click(confirmButton!)

         // should be called once on confirming delete
         expect(mockedMutator.deleteProperty).toBeCalledTimes(1)
         expect(mockedMutator.deleteProperty).toBeCalledWith(board, views, cards, propertyTemplate.id)
     })

    it('cancel on delete dialog should do nothing', async () => {
         const user = userEvent.setup()
         const {container} = renderComponent()

         // Open property menu
         const menuElement = await screen.findByRole('button', {name: 'Owner'})
         await user.click(menuElement)

         // Click delete option in menu
         const deleteOption = await screen.findByRole('button', {name: /^delete$/i})
         await user.click(deleteOption)

         // Confirm dialog should appear
         expect(await screen.findByRole('heading', {name: 'Confirm delete property'})).toBeInTheDocument()

         // Click cancel button
         const cancelButton = await screen.findByTitle('Cancel')
         expect(cancelButton).toBeDefined()
         await user.click(cancelButton!)

         expect(container).toMatchSnapshot()
     })
})
