// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'
import configureStore from 'redux-mock-store'
import '@testing-library/jest-dom'

import {Card} from '../../blocks/card'
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
const view = TestBlockFactory.createBoardView(board)
const parentCard = TestBlockFactory.createCard(board)
parentCard.id = 'parent-card'

const subCard = TestBlockFactory.createCard(board)
subCard.id = 'sub-card'
subCard.fields.parentCardId = parentCard.id
subCard.fields.depth = 1

const buildState = (cards: Card[]) => ({
    users: {},
    comments: {comments: {}},
    contents: {contents: {}},
    cards: {
        current: board.id,
        cards: cards.reduce((acc: Record<string, Card>, c) => ({...acc, [c.id]: c}), {}),
    },
    boards: {
        current: board.id,
        boards: {[board.id]: board},
        myBoardMemberships: {[board.id]: {userId: 'user-1', boardId: board.id, schemeAdmin: true}},
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

const renderRow = (cards: Card[]) => {
    const store = configureStore([])(buildState(cards))

    return render(wrapDNDIntl(
        <ColumnResizeProvider
            columnWidths={{}}
            onResizeColumn={jest.fn()}
        >
            <ReduxProvider store={store}>
                <TableRowExpandable
                    board={board}
                    activeView={view}
                    card={parentCard}
                    selectedCardIds={[]}
                    readonly={false}
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
