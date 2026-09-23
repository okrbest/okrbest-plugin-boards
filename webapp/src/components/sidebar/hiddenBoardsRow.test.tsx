// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {mocked} from 'jest-mock'

import '@testing-library/jest-dom'

import {TestBlockFactory} from '../../test/testBlockFactory'
import {wrapIntl} from '../../testUtils'
import mutator from '../../mutator'
import {sendFlashMessage} from '../flashMessages'
import {CategoryBoardMetadata, CategoryBoards} from '../../store/sidebar'

import HiddenBoardsRow from './hiddenBoardsRow'

jest.mock('../../mutator')
jest.mock('../flashMessages')
const mockedMutator = mocked(mutator, true)
const mockedSendFlashMessage = mocked(sendFlashMessage)

describe('components/sidebar/HiddenBoardsRow', () => {
    const alpha = TestBlockFactory.createBoard()
    alpha.id = 'board_alpha'
    alpha.title = 'Alpha'
    const beta = TestBlockFactory.createBoard()
    beta.id = 'board_beta'
    beta.title = 'Beta'
    const gamma = TestBlockFactory.createBoard()
    gamma.id = 'board_gamma'
    gamma.title = 'Gamma'
    const boards = [alpha, beta, gamma]

    const makeCategory = (boardMetadata: CategoryBoardMetadata[]): CategoryBoards => {
        const category = TestBlockFactory.createCategoryBoards()
        category.id = 'cat-1'
        category.name = 'Category 1'
        category.boardMetadata = boardMetadata
        return category
    }

    const twoHidden = () => makeCategory([
        {boardID: alpha.id, hidden: false},
        {boardID: beta.id, hidden: true},
        {boardID: gamma.id, hidden: true},
    ])

    const renderRow = (category: CategoryBoards, boardList = boards) => render(wrapIntl(
        <HiddenBoardsRow
            categoryBoards={category}
            boards={boardList}
        />,
    ))

    beforeEach(() => {
        jest.clearAllMocks()
        mockedMutator.unhideBoard.mockResolvedValue(true)
    })

    test('U-01: shows the hidden count as a collapsed row that is not draggable', () => {
        const {container} = renderRow(twoHidden())

        expect(screen.getByText('2 hidden boards')).toBeInTheDocument()
        expect(container.querySelector('[data-rbd-draggable-id]')).toBeNull()
        expect(screen.queryByText('Beta')).toBeNull()
    })

    test('U-01a: renders nothing when no board is hidden', () => {
        const {container} = renderRow(makeCategory([{boardID: alpha.id, hidden: false}]))

        expect(container.firstChild).toBeNull()
    })

    test('U-01c: does not count hidden boards that are missing from the store', () => {
        renderRow(makeCategory([
            {boardID: alpha.id, hidden: true},
            {boardID: 'board_gone', hidden: true},
        ]))

        expect(screen.getByText('1 hidden board')).toBeInTheDocument()
    })

    test('U-02: the header toggles the list and the state survives a re-render', () => {
        const category = twoHidden()
        const {rerender} = renderRow(category)

        fireEvent.click(screen.getByText('2 hidden boards'))
        expect(screen.getByText('Beta')).toBeInTheDocument()

        rerender(wrapIntl(
            <HiddenBoardsRow
                categoryBoards={category}
                boards={[...boards]}
            />,
        ))
        expect(screen.getByText('Beta')).toBeInTheDocument()

        fireEvent.click(screen.getByText('2 hidden boards'))
        expect(screen.queryByText('Beta')).toBeNull()
    })

    test('U-03: lists hidden boards in category order, dimmed, marked hidden, without navigation', () => {
        const {container} = renderRow(makeCategory([
            {boardID: gamma.id, hidden: true},
            {boardID: alpha.id, hidden: false},
            {boardID: beta.id, hidden: true},
        ]))
        fireEvent.click(screen.getByText('2 hidden boards'))

        const items = Array.from(container.querySelectorAll('.HiddenBoardsRow__item'))
        expect(items.map((item) => item.querySelector('.octo-sidebar-title')?.textContent)).toEqual(['Gamma', 'Beta'])
        items.forEach((item) => {
            expect(item).toHaveClass('octo-sidebar-item', 'subitem')
            expect(item.querySelector('.HideIcon')).not.toBeNull()
        })
        expect(screen.queryByRole('link')).toBeNull()

        fireEvent.click(screen.getByText('Gamma'))
        expect(mockedMutator.unhideBoard).not.toHaveBeenCalled()
    })

    test('U-04: the Show button restores that board through mutator.unhideBoard', async () => {
        renderRow(twoHidden())
        fireEvent.click(screen.getByText('2 hidden boards'))

        const showButtons = screen.getAllByRole('button', {name: 'Show'})
        expect(showButtons).toHaveLength(2)
        fireEvent.click(showButtons[1])

        await waitFor(() => expect(mockedMutator.unhideBoard).toHaveBeenCalledWith('cat-1', gamma.id))
        expect(mockedMutator.unhideBoard).toHaveBeenCalledTimes(1)
        expect(mockedSendFlashMessage).not.toHaveBeenCalled()
    })

    test('U-09: a failed restore raises a high-severity notice', async () => {
        mockedMutator.unhideBoard.mockResolvedValue(false)
        renderRow(twoHidden())
        fireEvent.click(screen.getByText('2 hidden boards'))

        fireEvent.click(screen.getAllByRole('button', {name: 'Show'})[0])

        await waitFor(() => expect(mockedSendFlashMessage).toHaveBeenCalledTimes(1))
        expect(mockedSendFlashMessage).toHaveBeenCalledWith(expect.objectContaining({severity: 'high'}))
    })
    // --- 016: 모두 표시 (contracts/ui-surfaces.md U-05, unhide-flow.md F-03) ---
    describe('Show all', () => {
        test('U-05: restores every hidden board in category order with one call each', async () => {
            renderRow(makeCategory([
                {boardID: gamma.id, hidden: true},
                {boardID: alpha.id, hidden: false},
                {boardID: beta.id, hidden: true},
            ]))
            fireEvent.click(screen.getByText('2 hidden boards'))

            fireEvent.click(screen.getByRole('button', {name: 'Show all'}))

            await waitFor(() => expect(mockedMutator.unhideBoard).toHaveBeenCalledTimes(2))
            expect(mockedMutator.unhideBoard.mock.calls).toEqual([['cat-1', gamma.id], ['cat-1', beta.id]])
            const order = mockedMutator.unhideBoard.mock.invocationCallOrder
            expect(order[0]).toBeLessThan(order[1])
            expect(mockedSendFlashMessage).not.toHaveBeenCalled()
        })

        test('F-03: a partial failure raises exactly one notice and still restores the rest', async () => {
            mockedMutator.unhideBoard.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
            renderRow(twoHidden())
            fireEvent.click(screen.getByText('2 hidden boards'))

            fireEvent.click(screen.getByRole('button', {name: 'Show all'}))

            await waitFor(() => expect(mockedMutator.unhideBoard).toHaveBeenCalledTimes(2))
            await waitFor(() => expect(mockedSendFlashMessage).toHaveBeenCalledTimes(1))
            expect(mockedSendFlashMessage).toHaveBeenCalledWith(expect.objectContaining({severity: 'high'}))
        })

        test('U-05: no Show all button when only one board is hidden', () => {
            renderRow(makeCategory([
                {boardID: alpha.id, hidden: false},
                {boardID: beta.id, hidden: true},
            ]))
            fireEvent.click(screen.getByText('1 hidden board'))

            expect(screen.queryByRole('button', {name: 'Show all'})).toBeNull()
            expect(screen.getAllByRole('button', {name: 'Show'})).toHaveLength(1)
        })
    })
})
