// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react'
import {useIntl} from 'react-intl'

import Switch from '../../widgets/switch'
import Button from '../../widgets/buttons/button'

import {Board, createBoard, PropertyAccessRule, PropertyAccessSettings} from '../../blocks/board'
import {Permission} from '../../constants'
import {Utils} from '../../utils'
import mutator from '../../mutator'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {fetchOrgMaster, isOrgMasterLoaded} from '../../store/orgMaster'
import {getBoardUsers, getMe} from '../../store/users'
import {getClientConfig} from '../../store/clientConfig'

import BoardPermissionGate from '../permissions/boardPermissionGate'

import PropertyAccessRow from './propertyAccessRow'

const PROPERTY_ACCESS_KEY = 'propertyAccess'

type Props = {
    board: Board
}

const emptySettings: PropertyAccessSettings = {
    enabled: false,
    updatedBy: '',
    updatedAt: 0,
    rules: [],
}

// readSettings tolerates a board that has never had rules and a board whose
// stored value is malformed; either way the section opens on an empty rule set.
export const readSettings = (board: Board): PropertyAccessSettings => {
    const stored = board.properties?.[PROPERTY_ACCESS_KEY] as Partial<PropertyAccessSettings> | undefined
    if (!stored) {
        return emptySettings
    }
    return {
        enabled: Boolean(stored.enabled),
        updatedBy: stored.updatedBy || '',
        updatedAt: stored.updatedAt || 0,
        rules: Array.isArray(stored.rules) ? stored.rules : [],
    }
}

// The six axes of a rule row, in the order propertyAccessRow renders them. The
// header exists because six unlabelled dropdowns in a row are unreadable — the
// values alone do not say which axis each one is.
const columnLabels = [
    {id: 'PropertyAccess.selectProperty', defaultMessage: 'Property'},
    {id: 'PropertyAccess.selectValue', defaultMessage: 'Value'},
    {id: 'PropertyAccess.selectDivision', defaultMessage: 'Division'},
    {id: 'PropertyAccess.selectDepartment', defaultMessage: 'Department'},
    {id: 'PropertyAccess.selectDuty', defaultMessage: 'Duty'},
    {id: 'PropertyAccess.selectPermission', defaultMessage: 'Permission'},
]

const isComplete = (rule: PropertyAccessRule): boolean =>
    rule.propertyId !== '' &&
    rule.propertyValueId !== '' &&
    (rule.divisionId !== '' || rule.departmentId !== '' || rule.dutyId !== '')

const PropertyAccessSection = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const dispatch = useAppDispatch()
    const {board} = props

    const settings = readSettings(board)
    const [rules, setRules] = React.useState<PropertyAccessRule[]>(settings.rules)
    const masterLoaded = useAppSelector(isOrgMasterLoaded(board.teamId))
    const boardUsers = useAppSelector(getBoardUsers)
    const me = useAppSelector(getMe)
    const clientConfig = useAppSelector(getClientConfig)

    useEffect(() => {
        setRules(readSettings(board).rules)
    }, [board.id, board.properties])

    useEffect(() => {
        if (board.teamId && !masterLoaded) {
            dispatch(fetchOrgMaster(board.teamId))
        }
    }, [board.teamId, masterLoaded])

    // Half finished rows live in the editor only. Sending one would be rejected
    // by the server's validation, so the save drops them instead.
    const save = (nextEnabled: boolean, nextRules: PropertyAccessRule[]) => {
        const newBoard = createBoard(board)
        newBoard.properties = {
            ...board.properties,
            [PROPERTY_ACCESS_KEY]: {
                enabled: nextEnabled,
                updatedBy: settings.updatedBy,
                updatedAt: settings.updatedAt,
                rules: nextRules.filter(isComplete),
            },
        }
        mutator.updateBoard(newBoard, board, 'update card access rules')
    }

    const onChangeRule = (updated: PropertyAccessRule) => {
        const nextRules = rules.map((rule) => (rule.id === updated.id ? updated : rule))
        setRules(nextRules)
        if (isComplete(updated)) {
            save(settings.enabled, nextRules)
        }
    }

    const onDeleteRule = (ruleId: string) => {
        const removed = rules.find((rule) => rule.id === ruleId)
        const nextRules = rules.filter((rule) => rule.id !== ruleId)
        setRules(nextRules)
        if (removed && isComplete(removed)) {
            save(settings.enabled, nextRules)
        }
    }

    const onAddRule = () => {
        setRules([...rules, {
            id: Utils.createGuid(Utils.blockTypeToIDType('block')),
            propertyId: '',
            propertyValueId: '',
            divisionId: '',
            departmentId: '',
            dutyId: '',
            permission: 'viewer',
        }])
    }

    // The last editor may have left the board, or the team. Falling back to the
    // stored ID keeps the record readable instead of blanking it (FR-034).
    const lastEditor = boardUsers[settings.updatedBy]
    const lastEditorName = lastEditor ?
        Utils.getUserDisplayName(lastEditor, me?.props?.teammateNameDisplay || clientConfig.teammateNameDisplay) :
        settings.updatedBy

    return (
        <BoardPermissionGate permissions={[Permission.ManageBoardRoles]}>
            <div className='tabs-content PropertyAccessSection'>
                <div>
                    <div className='d-flex justify-content-between'>
                        <div className='d-flex flex-column'>
                            <div className='text-heading2'>
                                {intl.formatMessage({id: 'PropertyAccess.title', defaultMessage: 'Card access by property'})}
                            </div>
                            <div className='text-light'>
                                {intl.formatMessage({id: 'PropertyAccess.description', defaultMessage: 'Limit who can see or edit cards based on a property value and the viewer\'s organisation.'})}
                            </div>
                        </div>
                        <div>
                            <Switch
                                isOn={settings.enabled}
                                size='medium'
                                onChanged={(isOn) => save(isOn, rules)}
                            />
                        </div>
                    </div>
                    {settings.updatedAt > 0 &&
                        <div className='text-light PropertyAccessSection__updated'>
                            {intl.formatMessage(
                                {id: 'PropertyAccess.lastUpdated', defaultMessage: 'Last changed by {user} on {date}'},
                                {user: lastEditorName, date: intl.formatDate(settings.updatedAt, {dateStyle: 'medium', timeStyle: 'short'})},
                            )}
                        </div>}
                    {rules.length > 0 &&
                        <div className='PropertyAccessSection__header'>
                            <div className='PropertyAccessRow__axes'>
                                {columnLabels.map((label) => (
                                    <div
                                        key={label.id}
                                        className='text-light PropertyAccessSection__column'
                                    >
                                        {intl.formatMessage(label)}
                                    </div>
                                ))}
                            </div>
                        </div>}
                    <div className='user-items PropertyAccessSection__rules'>
                        {rules.map((rule) => (
                            <PropertyAccessRow
                                key={rule.id}
                                board={board}
                                rule={rule}
                                onChange={onChangeRule}
                                onDelete={onDeleteRule}
                            />
                        ))}
                    </div>
                    <Button
                        className='PropertyAccessSection__add'
                        onClick={onAddRule}
                        emphasis='secondary'
                        size='medium'
                    >
                        {intl.formatMessage({id: 'PropertyAccess.addRule', defaultMessage: 'Add rule'})}
                    </Button>
                </div>
            </div>
        </BoardPermissionGate>
    )
}

export default PropertyAccessSection
