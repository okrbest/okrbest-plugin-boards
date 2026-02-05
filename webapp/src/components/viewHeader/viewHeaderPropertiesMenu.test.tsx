// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'

import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'

import {mocked} from 'jest-mock'

import {BoardView} from '../../blocks/boardView'

import {TestBlockFactory} from '../../test/testBlockFactory'

import mutator from '../../mutator'

import {mockStateStore, wrapIntl} from '../../testUtils'

import {Constants} from '../../constants'

import ViewHeaderPropertiesMenu from './viewHeaderPropertiesMenu'

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

const board = TestBlockFactory.createBoard()
let activeView: BoardView

describe('components/viewHeader/viewHeaderPropertiesMenu', () => {
    const state = {
        users: {
            me: {
                id: 'user-id-1',
                username: 'username_1'},
        },
    }
    const store = mockStateStore([], state)
    beforeEach(() => {
        jest.clearAllMocks()
        activeView = TestBlockFactory.createBoardView(board)
    })
    test('return properties menu', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeaderPropertiesMenu
                        activeView={activeView}
                        properties={board.cardProperties}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'Properties menu'})
        await userEvent.click(buttonElement)
        expect(container).toMatchSnapshot()
    })
    test('return properties menu with gallery typeview', async () => {
        activeView.fields.viewType = 'gallery'
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeaderPropertiesMenu
                        activeView={activeView}
                        properties={board.cardProperties}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'Properties menu'})
        await userEvent.click(buttonElement)
        expect(container).toMatchSnapshot()
    })
    test('show menu and verify the call for showing card badges', async () => {
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeaderPropertiesMenu
                        activeView={activeView}
                        properties={board.cardProperties}
                    />
                </ReduxProvider>,
            ),
        )
        const menuButton = await screen.findByRole('button', {name: 'Properties menu'})
        await userEvent.click(menuButton)
        const badgesButton = await screen.findByRole('button', {name: 'Comments and description'})
        await userEvent.click(badgesButton)
        expect(mockedMutator.changeViewVisibleProperties).toHaveBeenCalledWith(
            activeView.boardId,
            activeView.id,
            activeView.fields.visiblePropertyIds,
            [...activeView.fields.visiblePropertyIds, Constants.badgesColumnId],
        )
    })
    test('show menu and verify that it is not closed after clicking on the item', async () => {
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeaderPropertiesMenu
                        activeView={activeView}
                        properties={board.cardProperties}
                    />
                </ReduxProvider>,
            ),
        )
        const menuButton = await screen.findByRole('button', {name: 'Properties menu'})
        await userEvent.click(menuButton)

        const property1Button = await screen.findByRole('button', {name: 'Property 1'})
        await userEvent.click(property1Button)
        expect(property1Button).toBeInTheDocument()

        const property2Button = await screen.findByRole('button', {name: 'Property 2'})
        await userEvent.click(property2Button)
        expect(property2Button).toBeInTheDocument()

        expect(mockedMutator.changeViewVisibleProperties).toHaveBeenCalledTimes(2)
    })
})
