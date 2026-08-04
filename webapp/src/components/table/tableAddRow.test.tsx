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

const renderRow = (props: {label: string, onClick: () => void, depth?: number}, canEditCard = true) => {
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

    test('T-04 indents to the depth of the cards it creates', () => {
        // The row has to sit where its future siblings sit. Rows indent inside
        // the title cell by 22px per level, so this one does the same — a fixed
        // offset would stack every level's add row in one column and there
        // would be no telling which parent an add row belongs to.
        const top = renderRow({label: '+ 새 카드', onClick: jest.fn()})
        expect(top.container.querySelector('.sub-card-indent')).toBeNull()

        const first = renderRow({label: '+ 새 하위 카드', onClick: jest.fn(), depth: 1})
        expect((first.container.querySelector('.sub-card-indent') as HTMLElement).style.width).toBe('22px')

        const third = renderRow({label: '+ 새 하위 카드', onClick: jest.fn(), depth: 3})
        expect((third.container.querySelector('.sub-card-indent') as HTMLElement).style.width).toBe('66px')
    })

    test('lines the label up with the titles of the rows above it', () => {
        // Sub-card rows reserve the expand toggle's width even when they have
        // no children. Without the same gap the "+" sits one toggle to the left
        // of the titles it belongs with.
        const {container} = renderRow({label: '+ 새 하위 카드', onClick: jest.fn(), depth: 1})

        const placeholder = container.querySelector('.expand-toggle-placeholder') as HTMLElement
        expect(placeholder).not.toBeNull()
        expect(placeholder.style.width).toBe('20px')
    })

    test('carries its own geometry rather than borrowing the row stylesheet', () => {
        // The width rules for these two spans live under .TableRow, which this
        // row is not. Relying on them silently produced a zero-width toggle gap
        // and a misaligned label — and no test could see it, because the test
        // renderer does not apply stylesheets. So the sizes are set here.
        const {container} = renderRow({label: '+ 새 하위 카드', onClick: jest.fn(), depth: 2})

        const indent = container.querySelector('.sub-card-indent') as HTMLElement
        const placeholder = container.querySelector('.expand-toggle-placeholder') as HTMLElement

        expect(indent.style.width).toBe('44px')
        expect(indent.style.flexShrink).toBe('0')
        expect(placeholder.style.width).toBe('20px')
        expect(placeholder.style.flexShrink).toBe('0')
    })

    test('borrows the existing footer markup rather than inventing its own', () => {
        const {container} = renderRow({label: '+ 새 카드', onClick: jest.fn()})

        // The row has to look identical to the table's existing add row, which
        // means using the same two classes and adding none of its own.
        expect(container.querySelector('.octo-table-footer')).not.toBeNull()
        expect(container.querySelector('.octo-table-footer > .octo-table-cell')).not.toBeNull()
    })
})
