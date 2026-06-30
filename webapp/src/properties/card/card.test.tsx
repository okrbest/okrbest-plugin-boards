// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'

import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import '@testing-library/jest-dom'
import configureStore from 'redux-mock-store'

import {createBoard, IPropertyTemplate} from '../../blocks/board'
import {Card, createCard} from '../../blocks/card'
import {Block} from '../../blocks/block'
import {wrapIntl} from '../../testUtils'
import octoClient from '../../octoClient'

import CardProperty from './property'
import CardPropertyEditor, {clearLinkedBoardCardCacheForTests} from './card'

jest.mock('../../octoClient')
const mockedOctoClient = jest.mocked(octoClient)

describe('properties/card', () => {
    const mockStore = configureStore([])

    const baseBoard = createBoard()
    baseBoard.id = 'current-board-id'

    const baseCard = createCard()
    baseCard.boardId = baseBoard.id
    baseCard.id = 'current-card-id'

    const getPropertyTemplate = (linkedBoardId: string): IPropertyTemplate => ({
        id: 'card-property-template-id',
        name: 'linked card',
        type: 'card',
        options: [{id: linkedBoardId, value: linkedBoardId, color: 'propColorGray'}],
    })

    beforeEach(() => {
        mockedOctoClient.getBoard.mockReset()
        mockedOctoClient.getAllBlocks.mockReset()
        mockedOctoClient.getCardsByIDs.mockReset()
        clearLinkedBoardCardCacheForTests()
    })

    test('shows latest selected card title from current board cards', () => {
        const linkedCard = createCard()
        linkedCard.boardId = baseBoard.id
        linkedCard.id = 'linked-card-id'
        linkedCard.title = '새 카드 이름'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {
                    [linkedCard.id]: linkedCard,
                },
            },
        })

        const propertyValue = JSON.stringify({
            boardId: baseBoard.id,
            cards: [
                {id: linkedCard.id, title: '이전 카드 이름'},
            ],
        })

        render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(baseBoard.id)}
                    propertyValue={propertyValue}
                    readOnly={true}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        expect(screen.getByText('새 카드 이름')).toBeInTheDocument()
        expect(screen.queryByText('이전 카드 이름')).not.toBeInTheDocument()
    })

    test('does not fetch linked board blocks when linked board is current board', async () => {
        const linkedCard = createCard()
        linkedCard.boardId = baseBoard.id
        linkedCard.id = 'linked-card-id'
        linkedCard.title = 'same-board-card'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {
                    [linkedCard.id]: linkedCard,
                },
            },
        })

        render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(baseBoard.id)}
                    propertyValue={JSON.stringify({boardId: baseBoard.id, cards: []})}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        fireEvent.click(screen.getByTitle('Select a card'))
        expect(screen.getByText('same-board-card')).toBeInTheDocument()
        expect(mockedOctoClient.getBoard).not.toBeCalled()
        expect(mockedOctoClient.getAllBlocks).not.toBeCalled()
    })

    test('keeps selected title in sync without opening dropdown', async () => {
        const linkedBoard = createBoard()
        linkedBoard.id = 'linked-board-id'

        const linkedCard = createCard()
        linkedCard.boardId = linkedBoard.id
        linkedCard.id = 'linked-card-id'
        linkedCard.title = '변경된 카드 이름'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {},
            },
        })

        mockedOctoClient.getBoard.mockResolvedValue(linkedBoard)
        mockedOctoClient.getCardsByIDs.mockResolvedValue([linkedCard])

        const propertyValue = JSON.stringify({
            boardId: linkedBoard.id,
            cards: [
                {id: linkedCard.id, title: '기존 저장 제목'},
            ],
        })

        render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(linkedBoard.id)}
                    propertyValue={propertyValue}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        expect(screen.getByText('기존 저장 제목')).toBeInTheDocument()

        await waitFor(() => {
            expect(screen.getAllByText('변경된 카드 이름').length).toBeGreaterThanOrEqual(1)
        })
        expect(screen.queryByText('기존 저장 제목')).not.toBeInTheDocument()
    })

    test('reuses in-flight request for linked board fetches', async () => {
        const linkedBoard = createBoard()
        linkedBoard.id = 'linked-board-id'

        const linkedCard = createCard()
        linkedCard.boardId = linkedBoard.id
        linkedCard.id = 'linked-card-id'
        linkedCard.title = '변경된 카드 이름'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {},
            },
        })

        let resolveCardsRequest: (cards: Card[]) => void = () => {}
        const cardsPromise = new Promise<Card[]>((resolve) => {
            resolveCardsRequest = resolve
        })
        mockedOctoClient.getBoard.mockResolvedValue(linkedBoard)
        mockedOctoClient.getCardsByIDs.mockReturnValue(cardsPromise as unknown as Promise<Block[]>)

        render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(linkedBoard.id)}
                    propertyValue={JSON.stringify({boardId: linkedBoard.id, cards: [{id: linkedCard.id, title: '기존 저장 제목'}]})}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        await waitFor(() => {
            expect(mockedOctoClient.getCardsByIDs).toBeCalledTimes(1)
        })
        window.dispatchEvent(new Event('focus'))
        await waitFor(() => {
            expect(mockedOctoClient.getCardsByIDs).toBeCalledTimes(1)
        })

        resolveCardsRequest([linkedCard])
        await waitFor(() => {
            expect(screen.getByText('변경된 카드 이름')).toBeInTheDocument()
        })
    })

    test('refetches selected titles on every focus after previous request completes', async () => {
        const linkedBoard = createBoard()
        linkedBoard.id = 'linked-board-id'

        const linkedCard = createCard()
        linkedCard.boardId = linkedBoard.id
        linkedCard.id = 'linked-card-id'
        linkedCard.title = '제목'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {},
            },
        })

        mockedOctoClient.getBoard.mockResolvedValue(linkedBoard)
        mockedOctoClient.getCardsByIDs.mockResolvedValue([linkedCard])

        render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(linkedBoard.id)}
                    propertyValue={JSON.stringify({boardId: linkedBoard.id, cards: [{id: linkedCard.id, title: '기존 저장 제목'}]})}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        await waitFor(() => {
            expect(mockedOctoClient.getCardsByIDs).toBeCalledTimes(1)
        })

        window.dispatchEvent(new Event('focus'))
        await waitFor(() => {
            expect(mockedOctoClient.getCardsByIDs).toBeCalledTimes(2)
        })
    })

    test('refetches dropdown cards whenever dropdown reopens', async () => {
        const linkedBoard = createBoard()
        linkedBoard.id = 'linked-board-id'

        const linkedCard = createCard()
        linkedCard.boardId = linkedBoard.id
        linkedCard.id = 'linked-card-id'
        linkedCard.title = '드롭다운 카드'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {},
            },
        })

        mockedOctoClient.getBoard.mockResolvedValue(linkedBoard)
        mockedOctoClient.getAllBlocks.mockResolvedValue([linkedCard])

        const {container} = render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(linkedBoard.id)}
                    propertyValue={JSON.stringify({boardId: linkedBoard.id, cards: []})}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        fireEvent.click(screen.getByTitle('Select a card'))
        await waitFor(() => {
            expect(mockedOctoClient.getAllBlocks).toBeCalledTimes(1)
        })

        const backdrop = container.querySelector('.CardProperty-backdrop')
        expect(backdrop).not.toBeNull()
        fireEvent.click(backdrop as Element)

        fireEvent.click(screen.getByTitle('Select a card'))
        await waitFor(() => {
            expect(mockedOctoClient.getAllBlocks).toBeCalledTimes(2)
        })
    })

    test('keeps dropdown list as full cards while selected title sync uses ids lookup', async () => {
        const linkedBoard = createBoard()
        linkedBoard.id = 'linked-board-id'

        const selectedCard = createCard()
        selectedCard.boardId = linkedBoard.id
        selectedCard.id = 'selected-card-id'
        selectedCard.title = '선택된 카드 제목'

        const extraCard = createCard()
        extraCard.boardId = linkedBoard.id
        extraCard.id = 'extra-card-id'
        extraCard.title = '추가 후보 카드'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {},
            },
        })

        mockedOctoClient.getBoard.mockResolvedValue(linkedBoard)
        mockedOctoClient.getCardsByIDs.mockResolvedValue([selectedCard])
        mockedOctoClient.getAllBlocks.mockResolvedValue([selectedCard, extraCard])

        render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(linkedBoard.id)}
                    propertyValue={JSON.stringify({boardId: linkedBoard.id, cards: [{id: selectedCard.id, title: '기존 저장 제목'}]})}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        await waitFor(() => {
            expect(mockedOctoClient.getCardsByIDs).toBeCalledTimes(1)
        })

        fireEvent.click(screen.getByTitle('Add card'))
        await waitFor(() => {
            expect(mockedOctoClient.getAllBlocks).toBeCalledTimes(1)
        })
        expect(screen.getByText('추가 후보 카드')).toBeInTheDocument()
    })

    test('falls back to getAllBlocks when ids lookup returns empty', async () => {
        const linkedBoard = createBoard()
        linkedBoard.id = 'linked-board-id'

        const linkedCard = createCard()
        linkedCard.boardId = linkedBoard.id
        linkedCard.id = 'linked-card-id'
        linkedCard.title = '폴백 카드 제목'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {},
            },
        })

        mockedOctoClient.getBoard.mockResolvedValue(linkedBoard)
        mockedOctoClient.getCardsByIDs.mockResolvedValue([])
        mockedOctoClient.getAllBlocks.mockResolvedValue([linkedCard])

        render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(linkedBoard.id)}
                    propertyValue={JSON.stringify({boardId: linkedBoard.id, cards: [{id: linkedCard.id, title: '기존 저장 제목'}]})}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        await waitFor(() => {
            expect(mockedOctoClient.getCardsByIDs).toBeCalledTimes(1)
            expect(mockedOctoClient.getAllBlocks).toBeCalledTimes(1)
        })
        expect(screen.getByText('폴백 카드 제목')).toBeInTheDocument()
    })

    test('shows board access error even without selected cards', async () => {
        const linkedBoardId = 'linked-board-id'

        const store = mockStore({
            teams: {
                current: 'team-id',
            },
            boards: {
                current: baseBoard.id,
            },
            cards: {
                cards: {},
            },
        })

        mockedOctoClient.getBoard.mockResolvedValue(undefined)

        render(wrapIntl(
            <ReduxProvider store={store}>
                <CardPropertyEditor
                    property={new CardProperty()}
                    board={baseBoard}
                    card={baseCard}
                    propertyTemplate={getPropertyTemplate(linkedBoardId)}
                    propertyValue={JSON.stringify({boardId: linkedBoardId, cards: []})}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />
            </ReduxProvider>,
        ))

        await waitFor(() => {
            expect(screen.getByText('Board not accessible')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Board not accessible'))
        await waitFor(() => {
            expect(screen.getByText('Board has been deleted or is no longer accessible. Please select a different board.')).toBeInTheDocument()
        })
        expect(screen.queryByText('No cards available')).not.toBeInTheDocument()
        expect(mockedOctoClient.getAllBlocks).not.toBeCalled()
    })
})
