// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'

import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'

import {mocked} from 'jest-mock'

import {wrapIntl, mockStateStore} from '../../testUtils'

import {TestBlockFactory} from '../../test/testBlockFactory'

import mutator from '../../mutator'

import NewCardButtonTemplateItem from './newCardButtonTemplateItem'

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

const board = TestBlockFactory.createBoard()
const activeView = TestBlockFactory.createBoardView(board)
const card = TestBlockFactory.createCard(board)

describe('components/viewHeader/newCardButtonTemplateItem', () => {
    const state = {
        users: {
            me: {
                id: 'user-id-1',
                username: 'username_1'},
        },
        teams: {current: {id: 'team-id'}},
        boards: {
            current: board.id,
            boards: {
                [board.id]: {id: board.id},
            },
        },
        views: {
            current: 0,
            views: [activeView],
        },
    }

    const store = mockStateStore([], state)
    const mockFunction = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })
    test('return NewCardButtonTemplateItem', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <NewCardButtonTemplateItem
                        cardTemplate={card}
                        addCardFromTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'menuwrapper'})
        await userEvent.click(buttonElement)
        expect(container).toMatchSnapshot()
    })
    test('return NewCardButtonTemplateItem and edit', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <NewCardButtonTemplateItem
                        cardTemplate={card}
                        addCardFromTemplate={jest.fn()}
                        editCardTemplate={mockFunction}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'menuwrapper'})
        await userEvent.click(buttonElement)
        expect(container).toMatchSnapshot()
        const buttonEdit = await screen.findByRole('button', {name: 'Edit'})
        await userEvent.click(buttonEdit)
        expect(mockFunction).toBeCalledTimes(1)
        expect(mockFunction).toBeCalledWith(card.id)
    })

    test('return NewCardButtonTemplateItem and add Card from template', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <NewCardButtonTemplateItem
                        cardTemplate={card}
                        addCardFromTemplate={mockFunction}
                        editCardTemplate={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonAdd = await screen.findByRole('button', {name: 'title'})
        await userEvent.click(buttonAdd)
        expect(container).toMatchSnapshot()
        expect(mockFunction).toBeCalledTimes(1)
    })
    test('return NewCardButtonTemplateItem and delete', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <NewCardButtonTemplateItem
                        cardTemplate={card}
                        addCardFromTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'menuwrapper'})
        await userEvent.click(buttonElement)
        expect(container).toMatchSnapshot()
        const buttonDelete = await screen.findByRole('button', {name: 'Delete'})
        await userEvent.click(buttonDelete)
        expect(mockedMutator.performAsUndoGroup).toBeCalledTimes(1)
    })
    test('return NewCardButtonTemplateItem and Set as default', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <NewCardButtonTemplateItem
                        cardTemplate={card}
                        addCardFromTemplate={jest.fn()}
                        editCardTemplate={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'menuwrapper'})
        await userEvent.click(buttonElement)
        expect(container).toMatchSnapshot()
        const buttonSetAsDefault = await screen.findByRole('button', {name: 'Set as default'})
        await userEvent.click(buttonSetAsDefault)
        expect(mockedMutator.setDefaultTemplate).toBeCalledTimes(1)
        expect(mockedMutator.setDefaultTemplate).toBeCalledWith(activeView.boardId, activeView.id, activeView.fields.defaultTemplateId, card.id)
    })
})

// 022 U-08 — same lock as the empty card item.
describe('components/viewHeader/newCardButtonTemplateItem admin-only view', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    const lockedView = TestBlockFactory.createBoardView(board)
    lockedView.id = 'locked-view'
    lockedView.createdBy = 'someone-else'
    lockedView.fields.accessMode = 'admin'

    const renderAs = (membership: Record<string, unknown>) => render(
        wrapIntl(
            <ReduxProvider store={mockStateStore([], {
                users: {me: {id: 'user-id-1', username: 'username_1', props: {}}},
                teams: {current: {id: 'team-id'}},
                boards: {
                    current: board.id,
                    boards: {[board.id]: board},
                    myBoardMemberships: {[board.id]: {userId: 'user-id-1', ...membership}},
                },
                views: {current: lockedView.id, views: {[lockedView.id]: lockedView}},
            })}
            >
                <NewCardButtonTemplateItem
                    cardTemplate={card}
                    addCardFromTemplate={jest.fn()}
                    editCardTemplate={jest.fn()}
                />
            </ReduxProvider>,
        ),
    )

    test('an editor sees "Set as default" disabled', async () => {
        renderAs({schemeEditor: true})
        await userEvent.click(await screen.findByRole('button', {name: 'menuwrapper'}))

        const item = await screen.findByRole('button', {name: 'Set as default'})
        expect(item).toHaveClass('menu-option--disabled')
        await userEvent.click(item)
        expect(mockedMutator.setDefaultTemplate).not.toHaveBeenCalled()
    })

    test('a board admin keeps it', async () => {
        renderAs({schemeAdmin: true})
        await userEvent.click(await screen.findByRole('button', {name: 'menuwrapper'}))

        expect(await screen.findByRole('button', {name: 'Set as default'})).not.toHaveClass('menu-option--disabled')
    })
})
