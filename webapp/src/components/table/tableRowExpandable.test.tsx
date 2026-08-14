// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {act, render} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import configureStore from 'redux-mock-store'
import '@testing-library/jest-dom'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import {Constants} from '../../constants'
import {OKR_BOARD_KEY} from '../../okrBoard'
import {TestBlockFactory} from '../../test/testBlockFactory'
import {wrapDNDIntl} from '../../testUtils'

import {ColumnResizeProvider} from './tableColumnResizeContext'
import TableRowExpandable from './tableRowExpandable'

// Contract test T-17 from
// specs/003-table-add-row/contracts/component-contracts.md §5.
//
// The expanded state lives here rather than in the component that creates the
// sub-card, so this is where the transition is pinned down.

const board = TestBlockFactory.createBoard()

// The factory leaves teamId empty, and an empty team is how BoardPermissionGate
// says "no" — the add row would be missing for a reason that has nothing to do
// with what these tests are about.
board.teamId = 'team-1'
const view = TestBlockFactory.createBoardView(board)
const parentCard = TestBlockFactory.createCard(board)
parentCard.id = 'parent-card'

const subCard = TestBlockFactory.createCard(board)
subCard.id = 'sub-card'
subCard.fields.parentCardId = parentCard.id
subCard.fields.depth = 1

const buildState = (cards: Card[], stateBoard: Board = board) => ({
    users: {},
    comments: {comments: {}},
    contents: {contents: {}},
    cards: {
        current: board.id,
        cards: cards.reduce((acc: Record<string, Card>, c) => ({...acc, [c.id]: c}), {}),
    },
    boards: {
        current: stateBoard.id,
        boards: {[stateBoard.id]: stateBoard},
        myBoardMemberships: {[stateBoard.id]: {userId: 'user-1', boardId: stateBoard.id, schemeAdmin: true}},
    },
    teams: {current: {id: board.teamId, title: 'Test Team'}},
    boardPermissions: {
        byBoardId: {
            [board.id]: {
                boardId: board.id,
                effectivePermission: 'edit',
                capabilities: {
                    canView: true,
                    canCommentCard: true,
                    canCreateCard: true,
                    canEditCard: true,
                    canDeleteCard: true,
                    canManageBoard: false,
                    canDeleteBoard: false,
                },
                derivedFrom: 'member',
            },
        },
    },
})

type RenderOptions = {
    board?: Board
    card?: Card
    readonly?: boolean
}

const renderRow = (cards: Card[], options: RenderOptions = {}) => {
    const rowBoard = options.board || board
    const rowCard = options.card || parentCard
    const store = configureStore([])(buildState(cards, rowBoard))

    return render(wrapDNDIntl(
        <ColumnResizeProvider
            columnWidths={{}}
            onResizeColumn={jest.fn()}
        >
            <ReduxProvider store={store}>
                <TableRowExpandable
                    board={rowBoard}
                    activeView={view}
                    card={rowCard}
                    selectedCardIds={[]}
                    readonly={options.readonly || false}
                    isLastCard={true}
                    showCard={jest.fn()}
                    addCard={jest.fn()}
                    addSubCard={jest.fn()}
                    onCardClicked={jest.fn()}
                    onDrop={jest.fn()}
                />
            </ReduxProvider>
        </ColumnResizeProvider>,
    ))
}

describe('components/table/tableRowExpandable', () => {
    test('T-17 opens the row when its first sub-card appears', () => {
        const collapsed = renderRow([parentCard])
        expect(collapsed.container.querySelectorAll('.octo-table-row')).toHaveLength(1)
        collapsed.unmount()

        // The card now has a sub-card, which is the only signal the row gets.
        const expanded = renderRow([parentCard, subCard])
        expect(expanded.container.querySelectorAll('.octo-table-row').length).toBeGreaterThan(1)
    })

    test('closes again when the last sub-card is gone', () => {
        const {container} = renderRow([parentCard])

        expect(container.querySelectorAll('.octo-table-row')).toHaveLength(1)
        expect(container.querySelector('.octo-table-footer')).toBeNull()
    })
})

// On an OKR board the ladder says which rows are meant to hold sub-cards, so a
// row on a rung that has one below it keeps the entry point open from the start
// — an Objective with no Key Results is exactly where the ladder gets built, and
// waiting for a sub-card to appear before showing the way to add one is backwards
// (spec 008 FR-014).
describe('components/table/tableRowExpandable on an OKR board', () => {
    const okrBoard: Board = {
        ...board,
        properties: {
            [OKR_BOARD_KEY]: {propertyId: 'p-type', levels: ['opt-objective', 'opt-key-result', 'opt-task']},
        },
    }

    const cardOnRung = (id: string, option: string, depth = 0): Card => ({
        ...parentCard,
        id,
        fields: {...parentCard.fields, depth, properties: {'p-type': option}},
    })

    const objective = cardOnRung('objective-card', 'opt-objective')
    const keyResult = cardOnRung('key-result-card', 'opt-key-result', 1)
    const task = cardOnRung('task-card', 'opt-task', 2)

    const addRowOf = (container: Element) => container.querySelector('.octo-table-footer')

    test('an Objective with no sub-cards opens on its own', () => {
        const {container} = renderRow([objective], {board: okrBoard, card: objective})

        expect(container.querySelector('.expand-toggle')).not.toBeNull()
        expect(addRowOf(container)?.textContent).toContain('+ New sub-card')
    })

    test('a Key Results card does the same', () => {
        const {container} = renderRow([keyResult], {board: okrBoard, card: keyResult})

        expect(container.querySelector('.expand-toggle')).not.toBeNull()
        expect(addRowOf(container)?.textContent).toContain('+ New sub-card')
    })

    test('a Tasks card is left as it was', () => {
        // The last rung gets no standing invitation. Hanging a card under it by
        // hand — the actions menu, up to the depth limit — still works.
        const {container} = renderRow([task], {board: okrBoard, card: task})

        expect(container.querySelector('.expand-toggle')).toBeNull()
        expect(container.querySelector('.expand-toggle-placeholder')).not.toBeNull()
        expect(addRowOf(container)).toBeNull()
    })

    test('the toggle closes the invitation again', async () => {
        const {container} = renderRow([objective], {board: okrBoard, card: objective})

        await act(async () => {
            await userEvent.click(container.querySelector('.expand-toggle')!)
        })

        expect(addRowOf(container)).toBeNull()
        expect(container.querySelector('.expand-toggle')).not.toBeNull()
    })

    test('a read only view invites nothing', () => {
        const {container} = renderRow([objective], {board: okrBoard, card: objective, readonly: true})

        expect(container.querySelector('.expand-toggle')).toBeNull()
        expect(addRowOf(container)).toBeNull()
    })

    test('an Objective at the depth limit invites nothing', () => {
        // Nothing can hang under it, so a toggle would open onto an empty list.
        const deep = cardOnRung('deep-objective', 'opt-objective', Constants.maxCardDepth)
        const {container} = renderRow([deep], {board: okrBoard, card: deep})

        expect(container.querySelector('.expand-toggle')).toBeNull()
        expect(addRowOf(container)).toBeNull()
    })

    test('a board that is not an OKR board is untouched', () => {
        const {container} = renderRow([objective], {card: objective})

        expect(container.querySelector('.expand-toggle')).toBeNull()
        expect(addRowOf(container)).toBeNull()
    })
})
