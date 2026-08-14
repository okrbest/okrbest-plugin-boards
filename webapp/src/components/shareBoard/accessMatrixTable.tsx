// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {useIntl} from 'react-intl'

import MenuWrapper from '../../widgets/menuWrapper'
import Menu from '../../widgets/menu'
import CheckIcon from '../../widgets/icons/check'
import CompassIcon from '../../widgets/icons/compassIcon'

import {DutyTier, IPropertyOption, OrgRelation, PropertyAccessPermission, orgRelations} from '../../blocks/board'

import {MatrixCells, MatrixEntry, cellKey} from './accessMatrix'

type Props = {
    levels: IPropertyOption[]
    tiers: DutyTier[]
    cells: MatrixCells
    onChange: (cells: MatrixCells) => void
}

// The requirement image, made operable.
//
// Rows are card types and columns are duty groups, so those two axes are read
// off the table's shape instead of being picked per rule. A cell answers what is
// left: how the viewer's organisation compares to the card's, and what that
// earns. That is the whole reduction — four choices per rule become two.
//
// A cell can hold more than one entry because the standard matrix needs it: a
// C-Level officer edits inside their own division and comments outside it, which
// is one cell in the image and two answers underneath.
const AccessMatrix = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const {levels, tiers, cells} = props

    const relationNames: Record<Exclude<OrgRelation, ''>, string> = {
        any: intl.formatMessage({id: 'PropertyAccess.relationAny', defaultMessage: '전체'}),
        sameDivision: intl.formatMessage({id: 'PropertyAccess.relationSameDivision', defaultMessage: '같은 본부'}),
        otherDivision: intl.formatMessage({id: 'PropertyAccess.relationOtherDivision', defaultMessage: '다른 본부'}),
        sameDepartment: intl.formatMessage({id: 'PropertyAccess.relationSameDepartment', defaultMessage: '같은 부서'}),
        mine: intl.formatMessage({id: 'PropertyAccess.relationMine', defaultMessage: '본인'}),
    }

    const permissionNames: Record<PropertyAccessPermission, string> = {
        viewer: intl.formatMessage({id: 'BoardMember.schemeViewer', defaultMessage: 'Viewer'}),
        commenter: intl.formatMessage({id: 'BoardMember.schemeCommenter', defaultMessage: 'Commenter'}),
        editor: intl.formatMessage({id: 'BoardMember.schemeEditor', defaultMessage: 'Editor'}),
    }

    const replaceCell = (key: string, entries: MatrixEntry[]) => {
        const next = {...cells}
        if (entries.length === 0) {
            delete next[key]
        } else {
            next[key] = entries
        }
        props.onChange(next)
    }

    const setEntry = (key: string, index: number, entry: MatrixEntry) => {
        const entries = [...(cells[key] || [])]
        entries[index] = entry
        replaceCell(key, entries)
    }

    const renderEntry = (key: string, entry: MatrixEntry, index: number) => (
        <div
            key={`${entry.relation}-${index}`}
            className='AccessMatrix__entry'
        >
            <MenuWrapper
                usePortal={true}
                menuPosition='bottom'
            >
                <button className='AccessMatrix__pick'>
                    <span>{relationNames[(entry.relation || 'any') as Exclude<OrgRelation, ''>]}</span>
                    <CompassIcon
                        icon='chevron-down'
                        className='CompassIcon'
                    />
                </button>
                <Menu position='bottom'>
                    {orgRelations.map((relation) => (
                        <Menu.Text
                            key={relation}
                            id={relation}
                            check={true}
                            icon={entry.relation === relation ? <CheckIcon/> : <div className='empty-icon'/>}
                            name={relationNames[relation as Exclude<OrgRelation, ''>]}
                            onClick={() => setEntry(key, index, {...entry, relation})}
                        />
                    ))}
                </Menu>
            </MenuWrapper>

            <MenuWrapper
                usePortal={true}
                menuPosition='bottom'
            >
                <button className='AccessMatrix__pick'>
                    <span>{permissionNames[entry.permission]}</span>
                    <CompassIcon
                        icon='chevron-down'
                        className='CompassIcon'
                    />
                </button>
                <Menu position='bottom'>
                    {(['viewer', 'commenter', 'editor'] as PropertyAccessPermission[]).map((permission) => (
                        <Menu.Text
                            key={permission}
                            id={permission}
                            check={true}
                            icon={entry.permission === permission ? <CheckIcon/> : <div className='empty-icon'/>}
                            name={permissionNames[permission]}
                            onClick={() => setEntry(key, index, {...entry, permission})}
                        />
                    ))}
                </Menu>
            </MenuWrapper>

            <button
                className='AccessMatrix__clear'
                title={intl.formatMessage({id: 'AccessMatrix.clear', defaultMessage: 'Remove'})}
                onClick={() => replaceCell(key, (cells[key] || []).filter((_, at) => at !== index))}
            >
                <CompassIcon icon='close'/>
            </button>
        </div>
    )

    return (
        <div className='AccessMatrix'>
            <div className='AccessMatrix__row AccessMatrix__row--head'>
                <div className='AccessMatrix__corner'/>
                {tiers.map((tier) => (
                    <div
                        key={tier.id}
                        className='AccessMatrix__column'
                    >
                        {tier.name}
                    </div>
                ))}
            </div>

            {levels.map((level) => (
                <div
                    key={level.id}
                    className='AccessMatrix__row'
                >
                    <div className='AccessMatrix__rowLabel'>{level.value}</div>
                    {tiers.map((tier) => {
                        const key = cellKey(level.id, tier.id)
                        const entries = cells[key] || []

                        return (
                            <div
                                key={tier.id}
                                className='AccessMatrix__cell'
                            >
                                {entries.map((entry, index) => renderEntry(key, entry, index))}

                                {/*
                                  * An empty cell is a real answer — the blank
                                  * cells of the requirement image mean no access
                                  * — so adding an entry is deliberate rather
                                  * than the cell defaulting to something.
                                  */}
                                <button
                                    className='AccessMatrix__add'
                                    onClick={() => replaceCell(key, [...entries, {relation: 'sameDivision', permission: 'viewer'}])}
                                >
                                    {intl.formatMessage({id: 'AccessMatrix.add', defaultMessage: '+'})}
                                </button>
                            </div>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}

export default AccessMatrix
