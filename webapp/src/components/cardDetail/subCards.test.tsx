// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import '@testing-library/jest-dom'
import {act} from 'react-dom/test-utils'
import {Provider as ReduxProvider} from 'react-redux'
import configureStore from 'redux-mock-store'

import {Board, MemberRole} from '../../blocks/board'
import {Card, createCard} from '../../blocks/card'
import {wrapIntl} from '../../testUtils'
import mutator from '../../mutator'

import SubCards from './subCards'

jest.mock('../../mutator')
const mockedMutator = jest.mocked(mutator)

describe('components/cardDetail/SubCards', () => {
    const board: Board = {
        id: 'board-id-1',
        teamId: 'team-id-1',
        channelId: '',
        title: 'Test Board',
        description: '',
        showDescription: false,
        createdBy: 'user-id-1',
        modifiedBy: 'user-id-1',
        createAt: 0,
        updateAt: 0,
        deleteAt: 0,
        type: 'O',
        minimumRole: MemberRole.Editor,
        cardProperties: [],
        isTemplate: false,
        templateVersion: 0,
        properties: {},
    }

    const parentCard: Card = {
        ...createCard(),
        id: 'card-id-1',
        boardId: 'board-id-1',
        title: 'Parent Card',
        fields: {
            icon: '📋',
            properties: {},
            contentOrder: [],
            depth: 0,
        },
    }

    const subCard1: Card = {
        ...createCard(),
        id: 'subcard-id-1',
        boardId: 'board-id-1',
        title: 'Sub Card 1',
        fields: {
            icon: '📝',
            properties: {},
            contentOrder: [],
            parentCardId: 'card-id-1',
            depth: 1,
        },
    }

    const subCard2: Card = {
        ...createCard(),
        id: 'subcard-id-2',
        boardId: 'board-id-1',
        title: 'Sub Card 2',
        fields: {
            icon: '',
            properties: {},
            contentOrder: [],
            parentCardId: 'card-id-1',
            depth: 1,
        },
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    const createMockStore = (subCards: Card[] = [], subCardCount = 0) => {
        const mockStore = configureStore([])
        return mockStore({
            users: {
                me: {id: 'user-id-1'},
                boardUsers: {},
            },
            boards: {
                boards: {[board.id]: board},
                current: board.id,
                myBoardMemberships: {
                    [board.id]: {userId: 'user-id-1', schemeAdmin: true},
                },
            },
            cards: {
                cards: {[parentCard.id]: parentCard},
                current: parentCard.id,
                subCardsByParent: {
                    [parentCard.id]: subCards,
                },
                subCardCountByParent: {
                    [parentCard.id]: subCardCount,
                },
            },
            teams: {
                current: {id: 'team-id-1'},
            },
            clientConfig: {
                value: {},
            },
        })
    }

    test('renders loading state initially', async () => {
        mockedMutator.fetchSubCards.mockImplementation(() => new Promise(() => {}))

        const store = createMockStore()
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={false}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        expect(screen.getByText('로딩 중...')).toBeInTheDocument()
    })

    test('renders sub-cards after loading', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([subCard1, subCard2])

        const store = createMockStore([subCard1, subCard2], 2)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={false}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        expect(screen.getByText('Sub Card 1')).toBeInTheDocument()
        expect(screen.getByText('Sub Card 2')).toBeInTheDocument()
    })

    test('renders empty state when no sub-cards', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([])

        const store = createMockStore([], 0)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={true}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        expect(screen.getByText('하위 작업 없음')).toBeInTheDocument()
    })

    test('shows add button when not readonly', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([])

        const store = createMockStore([], 0)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={false}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        expect(screen.getByText('새 페이지 추가하기')).toBeInTheDocument()
    })

    test('hides add button in readonly mode', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([])

        const store = createMockStore([], 0)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={true}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        expect(screen.queryByText('새 페이지 추가하기')).not.toBeInTheDocument()
    })

    test('hides add button at max depth', async () => {
        const maxDepthCard: Card = {
            ...parentCard,
            fields: {
                ...parentCard.fields,
                depth: 2,
            },
        }

        mockedMutator.fetchSubCards.mockResolvedValue([])

        const store = createMockStore([], 0)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={maxDepthCard}
                            readonly={false}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        expect(screen.queryByText('새 페이지 추가하기')).not.toBeInTheDocument()
    })

    test('calls onCardClick when sub-card is clicked', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([subCard1])

        const store = createMockStore([subCard1], 1)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={false}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Sub Card 1'))

        expect(onCardClick).toHaveBeenCalledWith('subcard-id-1')
    })

    test('creates sub-card when add button is clicked', async () => {
        const newSubCard: Card = {
            ...createCard(),
            id: 'new-subcard-id',
            boardId: 'board-id-1',
            title: '',
        }

        mockedMutator.fetchSubCards.mockResolvedValue([])
        mockedMutator.createSubCard.mockImplementation(async (boardId, parentCardId, title, afterRedo) => {
            if (afterRedo) {
                await afterRedo(newSubCard)
            }
            return newSubCard
        })

        const store = createMockStore([], 0)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={false}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        await act(async () => {
            fireEvent.click(screen.getByText('새 페이지 추가하기'))
        })

        expect(mockedMutator.createSubCard).toHaveBeenCalledWith(
            'board-id-1',
            'card-id-1',
            '',
            expect.any(Function),
        )
        expect(onCardClick).toHaveBeenCalledWith('new-subcard-id')
    })

    test('shows link existing button when not readonly', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([])

        const store = createMockStore([], 0)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={false}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        expect(screen.getByText('기존 항목 연결')).toBeInTheDocument()
    })

    test('hides link existing button in readonly mode', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([])

        const store = createMockStore([], 0)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={true}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        expect(screen.queryByText('기존 항목 연결')).not.toBeInTheDocument()
    })

    test('shows unlink button on hover for sub-cards', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([subCard1])

        const store = createMockStore([subCard1], 1)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={false}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        const unlinkButton = document.querySelector('.SubCards__item-unlink')
        expect(unlinkButton).toBeInTheDocument()
    })

    test('unlink button not shown in readonly mode', async () => {
        mockedMutator.fetchSubCards.mockResolvedValue([subCard1])

        const store = createMockStore([subCard1], 1)
        const onCardClick = jest.fn()

        await act(async () => {
            render(
                <ReduxProvider store={store}>
                    {wrapIntl(
                        <SubCards
                            board={board}
                            card={parentCard}
                            readonly={true}
                            onCardClick={onCardClick}
                        />,
                    )}
                </ReduxProvider>,
            )
        })

        await waitFor(() => {
            expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument()
        })

        const unlinkButton = document.querySelector('.SubCards__item-unlink')
        expect(unlinkButton).not.toBeInTheDocument()
    })
})
