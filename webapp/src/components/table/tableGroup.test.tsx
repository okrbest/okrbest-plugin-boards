// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import {thunk} from 'redux-thunk'
import '@testing-library/jest-dom'

import {BoardGroup} from '../../blocks/board'
import {TestBlockFactory} from '../../test/testBlockFactory'
import {mockStateStore, wrapDNDIntl} from '../../testUtils'

import {ColumnResizeProvider} from './tableColumnResizeContext'
import TableGroup from './tableGroup'

// Contract tests T-05 ~ T-08 from
// specs/003-table-add-row/contracts/component-contracts.md §5.

const board = TestBlockFactory.createBoard()
board.id = 'board-1'
board.teamId = 'team-id'

const groupProperty = board.cardProperties[0]

const state = {
    teams: {
        current: {id: 'team-id', title: 'Test Team'},
    },
    boards: {
        current: board.id,
        boards: {[board.id]: board},
        myBoardMemberships: {
            [board.id]: {userId: 'user-1', boardId: board.id, schemeAdmin: true},
        },
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
                    canAddSubCard: true,
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

const renderGroup = (group: BoardGroup, collapsed: boolean, addCard = jest.fn()) => {
    const view = TestBlockFactory.createBoardView(board)
    view.fields.groupById = groupProperty.id
    view.fields.collapsedOptionIds = collapsed ? [group.option.id || 'undefined'] : []

    const store = mockStateStore([thunk], state)

    const result = render(
        wrapDNDIntl(
            <ReduxProvider store={store}>
                <ColumnResizeProvider
                    columnWidths={{}}
                    onResizeColumn={jest.fn()}
                >
                    <TableGroup
                        board={board}
                        activeView={view}
                        groupByProperty={groupProperty}
                        group={group}
                        readonly={false}
                        selectedCardIds={[]}
                        cardIdToFocusOnRender=''
                        hideGroup={jest.fn()}
                        addCard={addCard}
                    addSubCard={jest.fn()}
                        showCard={jest.fn()}
                        propertyNameChanged={jest.fn()}
                        onCardClicked={jest.fn()}
                        onDropToGroupHeader={jest.fn()}
                        onDropToCard={jest.fn()}
                        onDropToGroup={jest.fn()}
                    />
                </ColumnResizeProvider>
            </ReduxProvider>,
        ),
    )
    return {...result, addCard}
}

const groupWithCards = (): BoardGroup => {
    const card = TestBlockFactory.createCard(board)
    card.id = 'card-1'
    return {
        option: {id: 'option-1', value: 'Option 1', color: 'propColorBrown'},
        cards: [card],
    }
}

const emptyGroup = (): BoardGroup => ({
    option: {id: 'option-empty', value: 'Empty', color: 'propColorBrown'},
    cards: [],
})

// The add row is the last footer in the group; the group header renders none.
const addRows = (container: Element) => container.querySelectorAll('.octo-table-footer')

describe('components/table/tableGroup', () => {
    test('T-05 puts exactly one add row at the end of a group that has cards', () => {
        const {container} = renderGroup(groupWithCards(), false)

        expect(addRows(container)).toHaveLength(1)
    })

    test('T-06 shows the add row on a group with no cards', () => {
        const {container} = renderGroup(emptyGroup(), false)

        expect(addRows(container)).toHaveLength(1)
    })

    test('T-07 hides the add row on a collapsed group', () => {
        const {container} = renderGroup(groupWithCards(), true)

        expect(addRows(container)).toHaveLength(0)
    })

    test('T-08 asks for a card in this group, not the board at large', async () => {
        const group = groupWithCards()
        const {container, addCard} = renderGroup(group, false)

        await userEvent.click(container.querySelector('.octo-table-footer .octo-table-cell')!)

        expect(addCard).toHaveBeenCalledWith(group.option.id)
    })
})
