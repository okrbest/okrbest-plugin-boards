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
import {ViewAccessMode} from '../../viewAccess'

import ViewHeaderAccessMenu from './viewHeaderAccessMenu'

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

// The access menu shows only what this person may choose
// (specs/022-view-permission/contracts/ui-surfaces.md W-03~W-07).
describe('components/viewHeader/viewHeaderAccessMenu', () => {
    const me = 'user-id-1'
    const board = TestBlockFactory.createBoard()

    const viewBy = (createdBy: string, mode?: ViewAccessMode) => {
        const view = TestBlockFactory.createBoardView(board)
        view.createdBy = createdBy
        if (mode) {
            view.fields.accessMode = mode
        }
        return view
    }

    const storeFor = (membership: {schemeAdmin?: boolean, schemeEditor?: boolean}) => mockStateStore([], {
        users: {me: {id: me, username: 'username_1', props: {}}},
        teams: {current: {id: 'team-id'}},
        boards: {
            current: board.id,
            boards: {[board.id]: board},
            templates: [],
            myBoardMemberships: {[board.id]: {userId: me, ...membership}},
        },
    })

    const renderMenu = (store: ReturnType<typeof mockStateStore>, view: ReturnType<typeof viewBy>, sharedViewCount = 2, readonly = false) => render(
        wrapIntl(
            <ReduxProvider store={store}>
                <ViewHeaderAccessMenu
                    activeView={view}
                    sharedViewCount={sharedViewCount}
                    readonly={readonly}
                />
            </ReduxProvider>,
        ),
    )

    const openMenu = async () => {
        await userEvent.click(screen.getByRole('button', {name: 'menuwrapper'}))
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('W-03 an editor who did not create the view cannot change anything', async () => {
        renderMenu(storeFor({schemeEditor: true}), viewBy('someone-else'))

        const button = screen.getByRole('button', {name: 'Everyone'})
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute('title', "You can't change who may edit this view.")

        await openMenu()
        expect(screen.queryByRole('button', {name: 'Admins'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Private'})).not.toBeInTheDocument()
    })

    test('W-04 an admin sees the admin item but not private on another person\'s view', async () => {
        renderMenu(storeFor({schemeAdmin: true}), viewBy('someone-else'))

        expect(screen.getByRole('button', {name: 'Everyone'})).toBeEnabled()
        await openMenu()
        expect(screen.getByRole('button', {name: 'Admins'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Private'})).not.toBeInTheDocument()
    })

    test('W-05 the creator sees the private item but not admin', async () => {
        renderMenu(storeFor({schemeEditor: true}), viewBy(me), 2)

        await openMenu()
        expect(screen.getByRole('button', {name: 'Private'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Admins'})).not.toBeInTheDocument()
    })

    test('W-06 the last shared view offers no private item', async () => {
        renderMenu(storeFor({schemeEditor: true}), viewBy(me), 1)

        await openMenu()
        expect(screen.queryByRole('button', {name: 'Private'})).not.toBeInTheDocument()
    })

    test('W-07 choosing an item changes the mode through the mutator', async () => {
        const view = viewBy('someone-else')
        renderMenu(storeFor({schemeAdmin: true}), view)

        await openMenu()
        await userEvent.click(screen.getByRole('button', {name: 'Admins'}))

        expect(mockedMutator.changeViewAccessMode).toHaveBeenCalledTimes(1)
        expect(mockedMutator.changeViewAccessMode).toHaveBeenCalledWith(board.id, view.id, 'everyone', 'admin')
    })

    test('the current mode is labelled on the button and checked in the menu', async () => {
        const {baseElement} = renderMenu(storeFor({schemeAdmin: true}), viewBy('someone-else', 'admin'))

        expect(screen.getByRole('button', {name: 'Admins'})).toBeInTheDocument()
        await openMenu()
        const items = screen.getAllByRole('button', {name: 'Admins'})
        expect(items.length).toBe(2)
        expect(baseElement.querySelectorAll('.menu-option .CheckIcon').length).toBe(1)
    })

    test('renders nothing on a read-only shared link', () => {
        const {container} = renderMenu(storeFor({schemeAdmin: true}), viewBy(me), 2, true)
        expect(container).toBeEmptyDOMElement()
    })
})
