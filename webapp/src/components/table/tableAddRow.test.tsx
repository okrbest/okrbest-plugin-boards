// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Provider as ReduxProvider} from 'react-redux'
import {thunk} from 'redux-thunk'
import '@testing-library/jest-dom'

import {TestBlockFactory} from '../../test/testBlockFactory'
import {mockStateStore, wrapDNDIntl} from '../../testUtils'

import TableAddRow from './tableAddRow'

// Contract tests T-01 ~ T-04 from
// specs/003-table-add-row/contracts/component-contracts.md §1.

const board = TestBlockFactory.createBoard()
board.id = 'board-1'
board.teamId = 'team-id'

const buildState = (canEditCard: boolean) => ({
    teams: {
        current: {id: 'team-id', title: 'Test Team'},
    },
    boards: {
        current: board.id,
        boards: {[board.id]: board},
        myBoardMemberships: {
            [board.id]: {userId: 'user-1', boardId: board.id, schemeAdmin: canEditCard},
        },
    },
    boardPermissions: {
        byBoardId: {
            [board.id]: {
                boardId: board.id,
                effectivePermission: canEditCard ? 'edit' : 'view',
                capabilities: {
                    canView: true,
                    canCommentCard: canEditCard,
                    canCreateCard: canEditCard,
                    canEditCard,
                    canDeleteCard: canEditCard,
                    canManageBoard: false,
                    canDeleteBoard: false,
                },
                derivedFrom: 'member',
            },
        },
    },
})

const renderRow = (props: {label: string, onClick: () => void, indented?: boolean}, canEditCard = true) => {
    const store = mockStateStore([thunk], buildState(canEditCard))
    return render(
        wrapDNDIntl(
            <ReduxProvider store={store}>
                <TableAddRow {...props}/>
            </ReduxProvider>,
        ),
    )
}

describe('components/table/tableAddRow', () => {
    test('T-01 displays the label it is given', () => {
        const {container} = renderRow({label: '+ 새 카드', onClick: jest.fn()})

        expect(container.textContent).toContain('+ 새 카드')
    })

    test('T-02 calls onClick when pressed', async () => {
        const onClick = jest.fn()
        const {container} = renderRow({label: '+ 새 카드', onClick})

        const cell = container.querySelector('.octo-table-cell')
        expect(cell).not.toBeNull()
        await userEvent.click(cell!)

        expect(onClick).toHaveBeenCalledTimes(1)
    })

    test('T-03 renders nothing without the card management permission', () => {
        const {container} = renderRow({label: '+ 새 카드', onClick: jest.fn()}, false)

        expect(container.querySelector('.octo-table-footer')).toBeNull()
        expect(container.textContent).not.toContain('+ 새 카드')
    })

    test('T-04 reflects the indented flag in the class list', () => {
        const plain = renderRow({label: '+ 새 카드', onClick: jest.fn()})
        expect(plain.container.querySelector('.octo-table-footer--indented')).toBeNull()

        const indented = renderRow({label: '+ 새 하위 카드', onClick: jest.fn(), indented: true})
        expect(indented.container.querySelector('.octo-table-footer--indented')).not.toBeNull()
    })

    test('borrows the existing footer markup rather than inventing its own', () => {
        const {container} = renderRow({label: '+ 새 카드', onClick: jest.fn()})

        // The row has to look identical to the table's existing add row, which
        // means using the same two classes and adding none of its own.
        expect(container.querySelector('.octo-table-footer')).not.toBeNull()
        expect(container.querySelector('.octo-table-footer > .octo-table-cell')).not.toBeNull()
    })
})
