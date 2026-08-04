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

// Geometry copied from the row so the label starts exactly where a title of the
// same depth starts. A row's title sits behind four things: the cell padding,
// one indent per nesting level, the expand toggle (kept even when the card has
// no children), and an icon slot that holds its width whether or not the card
// has an icon.
//
// The footer cell pads 15px where a title cell pads 8px, so the padding is set
// here too — otherwise the label lands 7px off no matter what follows it.
//
// All of it is inline rather than left to the stylesheet because the rules for
// these classes live under `.TableRow`, which this row is not. Relying on them
// gave a zero-width toggle gap and a label a full icon to the left of the
// titles it belongs with — and nothing caught it, because the test renderer
// applies no stylesheets.
const cellPadding = 8
const indentPerLevel = 22
const toggleWidth = 20
const iconWidth = 20
const iconGap = 4

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
                    style={{paddingLeft: cellPadding}}
                    onClick={props.onClick}
                >
                    {depth > 0 && (
                        <>
                            <span
                                className='sub-card-indent'
                                style={{width: depth * indentPerLevel, flexShrink: 0}}
                            />
                            <span
                                className='expand-toggle-placeholder'
                                style={{width: toggleWidth, flexShrink: 0}}
                            />
                        </>
                    )}
                    <span
                        className='octo-icon'
                        style={{width: iconWidth, marginRight: iconGap, flexShrink: 0}}
                    />
                    {props.label}
                </div>
            </div>
        </BoardPermissionGate>
    )
}

export default React.memo(TableAddRow)
