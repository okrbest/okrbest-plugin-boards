// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {Permission} from '../../constants'

import BoardPermissionGate from '../permissions/boardPermissionGate'

import './table.scss'

type Props = {
    label: string
    onClick: () => void
    indented?: boolean
}

// TableAddRow is the "+ New …" line that closes a list of table rows.
//
// It draws a row and nothing else. Whether it should appear at all — the group
// is collapsed, the card is at the depth limit, the view is read only — is the
// caller's judgement, because only the caller knows which list it is closing.
//
// The markup is the table's existing footer, not a new one. This row has to be
// indistinguishable from the add row an ungrouped table already has.
const TableAddRow = (props: Props): React.JSX.Element => {
    const className = props.indented ? 'octo-table-footer octo-table-footer--indented' : 'octo-table-footer'

    return (
        <BoardPermissionGate permissions={[Permission.ManageBoardCards]}>
            <div className={className}>
                <div
                    className='octo-table-cell'
                    onClick={props.onClick}
                >
                    {props.label}
                </div>
            </div>
        </BoardPermissionGate>
    )
}

export default React.memo(TableAddRow)
