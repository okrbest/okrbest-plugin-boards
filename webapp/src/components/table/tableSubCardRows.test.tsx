// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import {thunk} from 'redux-thunk'
import '@testing-library/jest-dom'

import {Card} from '../../blocks/card'
import {Constants} from '../../constants'
import {TestBlockFactory} from '../../test/testBlockFactory'
import {mockStateStore, wrapDNDIntl} from '../../testUtils'

import {ColumnResizeProvider} from './tableColumnResizeContext'
import TableSubCardRows from './tableSubCardRows'

// Contract tests T-09 ~ T-11 and T-18 from
// specs/003-table-add-row/contracts/component-contracts.md §5.

const board = TestBlockFactory.createBoard()
board.id = 'board-1'
board.teamId = 'team-id'

const parentCard = TestBlockFactory.createCard(board)
parentCard.id = 'parent-card'

const subCard = TestBlockFactory.createCard(board)
subCard.id = 'sub-card'
subCard.fields.parentCardId = parentCard.id
subCard.fields.depth = 1

const state = {
    teams: {current: {id: 'team-id', title: 'Test Team'}},
    boards: {
        current: board.id,
        boards: {[board.id]: board},
        myBoardMemberships: {[board.id]: {userId: 'user-1', boardId: board.id, schemeAdmin: true}},
    },
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
    cards: {cards: {}, subCardsByParent: {}},
    comments: {comments: {}, commentsByCard: {}},
    contents: {contents: {}, contentsByCard: {}},
    users: {me: {id: 'user-1'}, boardUsers: {}, blockSubscriptions: []},
    clientConfig: {value: {teammateNameDisplay: 'username'}},
}

const renderSubRows = (parent: Card, cardIdToFocusOnRender = '') => {
    const view = TestBlockFactory.createBoardView(board)
    const addSubCard = jest.fn()
    const store = mockStateStore([thunk], state)

    const result = render(
        wrapDNDIntl(
            <ReduxProvider store={store}>
                <ColumnResizeProvider
                    columnWidths={{}}
                    onResizeColumn={jest.fn()}
                >
                    <TableSubCardRows
                        board={board}
                        activeView={view}
                        parentCard={parent}
                        subCards={[subCard]}
                        selectedCardIds={[]}
                        readonly={false}
                        cardIdToFocusOnRender={cardIdToFocusOnRender}
                        showCard={jest.fn()}
                        addCard={jest.fn()}
                        addSubCard={addSubCard}
                        onCardClicked={jest.fn()}
                        onDrop={jest.fn()}
                    />
                </ColumnResizeProvider>
            </ReduxProvider>,
        ),
    )
    return {...result, addSubCard}
}

describe('components/table/tableSubCardRows', () => {
    test('T-09 closes the sub-card list with an add row', () => {
        const {container} = renderSubRows(parentCard)

        const addRow = container.querySelector('.octo-table-footer')
        expect(addRow).not.toBeNull()
        expect(addRow!.textContent).toContain('+ New sub-card')

        // Indented to the level of the sub-cards it creates, so it is obvious
        // which parent it belongs to when several levels are open at once.
        const indent = addRow!.querySelector('.sub-card-indent') as HTMLElement
        expect(indent).not.toBeNull()
        expect(indent.style.width).toBe('22px')
    })

    test('the add row follows the parent down the nesting levels', () => {
        const deepParent = TestBlockFactory.createCard(board)
        deepParent.id = 'deep-parent'
        deepParent.fields.depth = 2

        const {container} = renderSubRows(deepParent)

        const indent = container.querySelector('.octo-table-footer .sub-card-indent') as HTMLElement
        expect(indent.style.width).toBe('66px')
    })

    test('T-10 drops the add row once the parent is at the depth limit', () => {
        const deepParent = TestBlockFactory.createCard(board)
        deepParent.id = 'deep-parent'
        deepParent.fields.depth = Constants.maxCardDepth

        const {container} = renderSubRows(deepParent)

        expect(container.querySelector('.octo-table-footer')).toBeNull()
    })

    test('T-11 asks for a sub-card of this parent', async () => {
        const {container, addSubCard} = renderSubRows(parentCard)

        await userEvent.click(container.querySelector('.octo-table-footer .octo-table-cell')!)

        expect(addSubCard).toHaveBeenCalledWith(parentCard)
    })

    test('T-18 passes the focus target down to the sub-card rows', async () => {
        // Without this the cursor cannot land in a newly created sub-card's
        // title, which is the whole point of the inline entry point. The row
        // focuses on a short timer, so the assertion waits for it.
        const {container} = renderSubRows(parentCard, subCard.id)

        const title = container.querySelector('input') as HTMLInputElement | null
        expect(title).not.toBeNull()

        await waitFor(() => expect(document.activeElement).toBe(title))
    })

    test('leaves the sub-card unfocused when it is not the focus target', async () => {
        const {container} = renderSubRows(parentCard, 'some-other-card')

        const title = container.querySelector('input') as HTMLInputElement | null
        await waitFor(() => expect(document.activeElement).not.toBe(title))
    })
})
