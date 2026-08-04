// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {Permission} from '../../constants'

import BoardPermissionGate from '../permissions/boardPermissionGate'

import './table.scss'

type Props = {
    label: string
    onClick: () => void

    // Depth of the cards this row creates. 0 for a group's add row, N for the
    // row that closes the sub-card list of a parent at depth N-1.
    depth?: number
}

// Rows indent by this much per nesting level, inside the title cell. The add
// row copies the figure rather than inventing its own so the two stay aligned.
const indentPerLevel = 22

// TableAddRow is the "+ New …" line that closes a list of table rows.
//
// It draws a row and nothing else. Whether it should appear at all — the group
// is collapsed, the card is at the depth limit, the view is read only — is the
// caller's judgement, because only the caller knows which list it is closing.
//
// The markup is the table's existing footer, not a new one. This row has to be
// indistinguishable from the add row an ungrouped table already has.
const TableAddRow = (props: Props): React.JSX.Element => {
    const depth = props.depth || 0

    return (
        <BoardPermissionGate permissions={[Permission.ManageBoardCards]}>
            <div className='octo-table-footer'>
                <div
                    className='octo-table-cell'
                    onClick={props.onClick}
                >
                    {depth > 0 && (
                        <>
                            <span
                                className='sub-card-indent'
                                style={{width: depth * indentPerLevel}}
                            />
                            {/* Sub-card rows reserve the toggle's width even
                              * when they have no children of their own; without
                              * the same gap the label sits one toggle left of
                              * the titles it belongs with. */}
                            <span className='expand-toggle-placeholder'/>
                        </>
                    )}
                    {props.label}
                </div>
            </div>
        </BoardPermissionGate>
    )
}

export default React.memo(TableAddRow)
