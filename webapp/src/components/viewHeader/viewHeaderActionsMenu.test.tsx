// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render, screen, waitFor, act} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'

import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'

import {mocked} from 'jest-mock'

import {TestBlockFactory} from '../../test/testBlockFactory'

import {wrapIntl, mockStateStore} from '../../testUtils'

import {Archiver} from '../../archiver'

import {CsvExporter} from '../../csvExporter'

import ViewHeaderActionsMenu from './viewHeaderActionsMenu'

jest.mock('../../archiver')
jest.mock('../../csvExporter')
jest.mock('../../mutator')
const mockedArchiver = mocked(Archiver, true)
const mockedCsvExporter = mocked(CsvExporter, true)

const board = TestBlockFactory.createBoard()
const activeView = TestBlockFactory.createBoardView(board)
const card = TestBlockFactory.createCard(board)

describe('components/viewHeader/viewHeaderActionsMenu', () => {
    const state = {
        users: {
            me: {
                id: 'user-id-1',
                username: 'username_1',
            },
        },
    }
    const store = mockStateStore([], state)
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('return menu', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeaderActionsMenu
                        board={board}
                        activeView={activeView}
                        cards={[card]}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {
            name: 'View header menu',
        })
        await act(async () => {
            await userEvent.click(buttonElement)
        })
        expect(container).toMatchSnapshot()
    })

    test('return menu and verify call to csv exporter', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeaderActionsMenu
                        board={board}
                        activeView={activeView}
                        cards={[card]}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'View header menu'})
        await act(async () => {
            await userEvent.click(buttonElement)
        })
        expect(container).toMatchSnapshot()
        const buttonExportCSV = await screen.findByRole('button', {name: 'Export to CSV'})
        await act(async () => {
            await userEvent.click(buttonExportCSV)
        })
        await waitFor(() => {
            expect(mockedCsvExporter.exportTableCsv).toBeCalledTimes(1)
        })
        expect(mockedCsvExporter.exportTableCsv).toBeCalledWith(board, activeView, [card], expect.anything())
    })

    test('return menu and verify call to board archive', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <ViewHeaderActionsMenu
                        board={board}
                        activeView={activeView}
                        cards={[card]}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'View header menu'})
        await act(async () => {
            await userEvent.click(buttonElement)
        })
        expect(container).toMatchSnapshot()
        const buttonExportBoardArchive = await screen.findByRole('button', {name: 'Export board archive'})
        await act(async () => {
            await userEvent.click(buttonExportBoardArchive)
        })
        await waitFor(() => {
            expect(mockedArchiver.exportBoardArchive).toBeCalledTimes(1)
        })
        expect(mockedArchiver.exportBoardArchive).toBeCalledWith(board)
    })
})
