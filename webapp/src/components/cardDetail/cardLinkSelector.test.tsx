// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react'
import '@testing-library/jest-dom'

import {Card, createCard} from '../../blocks/card'
import {wrapIntl} from '../../testUtils'
import octoClient from '../../octoClient'

import CardLinkSelector from './cardLinkSelector'

jest.mock('../../octoClient')
const mockedOctoClient = jest.mocked(octoClient)

describe('components/cardDetail/CardLinkSelector', () => {
    const boardId = 'board-id-1'
    const currentCardId = 'current-card-id'

    const card1: Card = {
        ...createCard(),
        id: 'card-1',
        boardId,
        title: 'Card 1',
        fields: {
            icon: '📋',
            properties: {},
            contentOrder: [],
            depth: 0,
        },
    }

    const card2: Card = {
        ...createCard(),
        id: 'card-2',
        boardId,
        title: 'Card 2',
        fields: {
            icon: '📝',
            properties: {},
            contentOrder: [],
            depth: 0,
        },
    }

    const subCard: Card = {
        ...createCard(),
        id: 'sub-card-1',
        boardId,
        title: 'Already Sub Card',
        fields: {
            icon: '',
            properties: {},
            contentOrder: [],
            parentCardId: 'parent-id',
            depth: 1,
        },
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('renders loading state initially', async () => {
        mockedOctoClient.getAllBlocks.mockImplementation(() => new Promise(() => {}))

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    test('renders card list after loading', async () => {
        mockedOctoClient.getAllBlocks.mockResolvedValue([card1, card2])

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
        })

        expect(screen.getByText('Card 1')).toBeInTheDocument()
        expect(screen.getByText('Card 2')).toBeInTheDocument()
    })

    test('shows empty state when no cards available', async () => {
        mockedOctoClient.getAllBlocks.mockResolvedValue([])

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
        })

        expect(screen.getByText('No cards available to link')).toBeInTheDocument()
    })

    test('filters cards by search query', async () => {
        mockedOctoClient.getAllBlocks.mockResolvedValue([card1, card2])

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('Search cards...')
        fireEvent.change(searchInput, {target: {value: 'Card 1'}})

        expect(screen.getByText('Card 1')).toBeInTheDocument()
        expect(screen.queryByText('Card 2')).not.toBeInTheDocument()
    })

    test('calls onSelect when a card is clicked', async () => {
        mockedOctoClient.getAllBlocks.mockResolvedValue([card1, card2])

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Card 1'))

        expect(onSelect).toHaveBeenCalledWith(card1)
    })

    test('calls onClose when backdrop is clicked', async () => {
        mockedOctoClient.getAllBlocks.mockResolvedValue([card1])

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
        })

        const backdrop = document.querySelector('.CardLinkSelector__backdrop')
        expect(backdrop).toBeInTheDocument()

        fireEvent.click(backdrop!)

        expect(onClose).toHaveBeenCalled()
    })

    test('disables current card in list', async () => {
        const currentCard: Card = {
            ...createCard(),
            id: currentCardId,
            boardId,
            title: 'Current Card',
            fields: {
                icon: '',
                properties: {},
                contentOrder: [],
                depth: 0,
            },
        }
        mockedOctoClient.getAllBlocks.mockResolvedValue([currentCard, card1])

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
        })

        const disabledItem = document.querySelector('.CardLinkSelector__item--disabled')
        expect(disabledItem).toBeInTheDocument()
        expect(screen.getByText('Cannot link self')).toBeInTheDocument()
    })

    test('disables already sub-card in list', async () => {
        mockedOctoClient.getAllBlocks.mockResolvedValue([subCard, card1])

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
        })

        expect(screen.getByText('Already a sub-card')).toBeInTheDocument()
    })

    test('does not call onSelect for disabled card', async () => {
        const currentCard: Card = {
            ...createCard(),
            id: currentCardId,
            boardId,
            title: 'Current Card',
            fields: {
                icon: '',
                properties: {},
                contentOrder: [],
                depth: 0,
            },
        }
        mockedOctoClient.getAllBlocks.mockResolvedValue([currentCard])

        const onSelect = jest.fn()
        const onClose = jest.fn()

        await act(async () => {
            render(
                wrapIntl(
                    <CardLinkSelector
                        boardId={boardId}
                        currentCardId={currentCardId}
                        currentCardDepth={0}
                        onSelect={onSelect}
                        onClose={onClose}
                    />,
                ),
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Current Card'))

        expect(onSelect).not.toHaveBeenCalled()
    })
})
