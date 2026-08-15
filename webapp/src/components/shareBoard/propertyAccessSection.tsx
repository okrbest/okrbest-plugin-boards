// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react'
import {useIntl} from 'react-intl'

import Switch from '../../widgets/switch'
import Button from '../../widgets/buttons/button'

import {Board, IPropertyOption, createBoard, PropertyAccessRule, PropertyAccessSettings, cardValueIds} from '../../blocks/board'
import {Permission} from '../../constants'
import {Utils} from '../../utils'
import mutator from '../../mutator'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {fetchOrgMaster, isOrgMasterLoaded} from '../../store/orgMaster'
import {areDutyTiersLoaded, fetchDutyTiers, getDutyTiers} from '../../store/dutyTiers'
import {okrBoardSettings} from '../../okrBoard'
import {getBoardUsers, getMe} from '../../store/users'
import {getClientConfig} from '../../store/clientConfig'

import BoardPermissionGate from '../permissions/boardPermissionGate'

import PropertyAccessRow from './propertyAccessRow'
import DutyTierEditor from './dutyTierEditor'
import AccessMatrixTable from './accessMatrixTable'
import {MatrixCells, matrixToRules, rulesToMatrix, standardMatrix} from './accessMatrix'

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
// The third column holds either a relation or a named organisation, and the
// fourth holds whatever that choice still needs — a department for a named
// division, a property to read for a relation. The headers say what the column
// is for rather than naming one of the two things it can hold.
const columnLabels = [
    {id: 'PropertyAccess.selectProperty', defaultMessage: 'Property'},
    {id: 'PropertyAccess.selectValue', defaultMessage: 'Value'},
    {id: 'PropertyAccess.selectOrgCondition', defaultMessage: 'Organisation'},
    {id: 'PropertyAccess.selectBasis', defaultMessage: 'Measured against'},
    {id: 'PropertyAccess.selectDuty', defaultMessage: 'Duty'},
    {id: 'PropertyAccess.selectPermission', defaultMessage: 'Permission'},
]

// A row the server would accept: one card condition and one subject condition.
//
// Both sides now have two shapes. The card side may name a single value or a
// list; the subject side may name an organisation outright or a relation, and a
// duty outright or a duty group. Missing any of the new shapes here does not
// show up as a validation message — the save silently drops the row.
const isComplete = (rule: PropertyAccessRule): boolean =>
    rule.propertyId !== '' &&
    cardValueIds(rule).length > 0 &&
    (Boolean(rule.relation) ||
        (rule.tierIds || []).length > 0 ||
        rule.divisionId !== '' ||
        rule.departmentId !== '' ||
        rule.dutyId !== '')

const PropertyAccessSection = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const dispatch = useAppDispatch()
    const {board} = props

    const settings = readSettings(board)
    const [rules, setRules] = React.useState<PropertyAccessRule[]>(settings.rules)
    const masterLoaded = useAppSelector(isOrgMasterLoaded(board.teamId))
    const tiersLoaded = useAppSelector(areDutyTiersLoaded(board.teamId))
    const tiers = useAppSelector(getDutyTiers(board.teamId))

    // The table needs rows, and the rows are the rungs of the OKR ladder. A board
    // that never set one has nothing to put down the side, so it gets the rule
    // list instead (FR-022).
    const okr = okrBoardSettings(board.properties)
    const typeProperty = board.cardProperties.find((property) => property.id === okr?.propertyId)
    const canShowMatrix = Boolean(okr && typeProperty)

    // Until the user picks a view, follow the board. Freezing the choice at the
    // first render would leave the table hidden on a board that becomes an OKR
    // board while the dialog is open — which is exactly the order someone sets
    // one up in.
    const [viewChoice, setViewChoice] = React.useState<'auto' | 'table' | 'rules'>('auto')
    const showMatrix = viewChoice === 'auto' ? canShowMatrix : viewChoice === 'table'

    const matrixContext = {
        typeProperty: okr?.propertyId || '',
        levels: okr?.levels || [],
        orgProperty: board.cardProperties.find((property) => property.type === 'orgDivision')?.id || '',
        departmentProperty: board.cardProperties.find((property) => property.type === 'orgDepartment')?.id || '',
        personProperty: board.cardProperties.find((property) => property.type === 'person' || property.type === 'multiPerson')?.id || '',
    }

    // The rungs in ladder order, dropping any the property no longer carries —
    // a value someone deleted should leave a gap, not an unnamed row.
    const matrixLevels = (okr?.levels || [])
        .map((valueId) => (typeProperty?.options || []).find((option) => option.id === valueId))
        .filter((option): option is IPropertyOption => Boolean(option))

    // Rows the table does not own. Saying how many there are is what keeps the
    // table from looking like the whole truth (FR-021).
    const outsideMatrix = rules.filter((rule) => rule.source !== 'matrix').length

    const onChangeMatrix = (cells: MatrixCells) => {
        const nextRules = matrixToRules(cells, matrixContext, rules)
        setRules(nextRules)
        save(settings.enabled, nextRules)
    }
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

    // Tiers come from the team, so they are fetched beside the organisation
    // master rather than read off the board.
    useEffect(() => {
        if (board.teamId && !tiersLoaded) {
            dispatch(fetchDutyTiers(board.teamId))
        }
    }, [board.teamId, tiersLoaded])

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
                    {/*
                      * The tiers sit above the rules because a rule points at
                      * one. Reading the rule list without knowing who "C-Level"
                      * is leaves the reader guessing, so this is shown even to
                      * those who may not change it (FR-011c).
                      */}
                    {settings.enabled && <DutyTierEditor teamId={board.teamId}/>}

                    {/*
                      * Two views of one thing. The table is the default because
                      * it matches the document the rules were written from; the
                      * rule list stays for the exceptions a table cannot hold.
                      */}
                    {settings.enabled && canShowMatrix &&
                        <div className='PropertyAccessSection__views'>
                            <Button
                                active={showMatrix}
                                onClick={() => setViewChoice('table')}
                            >
                                {intl.formatMessage({id: 'AccessMatrix.tableView', defaultMessage: 'Table'})}
                            </Button>
                            <Button
                                active={!showMatrix}
                                onClick={() => setViewChoice('rules')}
                            >
                                {intl.formatMessage({id: 'AccessMatrix.ruleView', defaultMessage: 'Rules'})}
                            </Button>
                            {outsideMatrix > 0 &&
                                <span className='PropertyAccessSection__outside'>
                                    {intl.formatMessage(
                                        {id: 'AccessMatrix.outsideTable', defaultMessage: '{count} rules live outside the table'},
                                        {count: outsideMatrix},
                                    )}
                                </span>}
                        </div>}

                    {settings.enabled && canShowMatrix && showMatrix && tiers.length === 0 &&
                        <div className='PropertyAccessSection__needTiers'>
                            {intl.formatMessage({
                                id: 'AccessMatrix.needTiers',
                                defaultMessage: 'Set up duty groups first — the table has no columns without them.',
                            })}
                        </div>}

                    {/*
                      * A division relation has to read a card property, and a
                      * board with none can only produce rules the server will
                      * refuse. Saying so here is the difference between "this
                      * board is not ready" and an unexplained failed save.
                      */}
                    {settings.enabled && canShowMatrix && showMatrix &&
                        (!matrixContext.orgProperty || !matrixContext.departmentProperty) &&
                        <div className='PropertyAccessSection__needTiers'>
                            {intl.formatMessage({
                                id: 'AccessMatrix.needOrgProperty',
                                defaultMessage: 'Add 본부 and 부서 properties to this board — the table compares each card against them.',
                            })}
                        </div>}

                    {/*
                      * The standard is offered rather than applied. Four duty
                      * groups have to exist first, and which of them is C-Level
                      * cannot be guessed from a name — so the button appears
                      * once the groups do, and only when the table is empty.
                      */}
                    {settings.enabled && canShowMatrix && showMatrix && tiers.length >= 4 &&
                        matrixContext.orgProperty !== '' && matrixContext.departmentProperty !== '' &&
                        Object.keys(rulesToMatrix(rules, matrixContext)).length === 0 &&
                        <Button
                            className='PropertyAccessSection__preset'
                            onClick={() => onChangeMatrix(standardMatrix(matrixContext.levels, {
                                ceo: tiers[0].id,
                                cLevel: tiers[1].id,
                                lead: tiers[2].id,
                                member: tiers[3].id,
                            }))}
                            emphasis='secondary'
                            size='medium'
                        >
                            {intl.formatMessage({id: 'AccessMatrix.applyStandard', defaultMessage: 'Apply the standard matrix'})}
                        </Button>}

                    {settings.enabled && canShowMatrix && showMatrix && tiers.length > 0 &&
                        <AccessMatrixTable
                            levels={matrixLevels}
                            tiers={tiers}
                            cells={rulesToMatrix(rules, matrixContext)}
                            onChange={onChangeMatrix}
                        />}

                    {(!showMatrix || !canShowMatrix) && rules.length > 0 &&
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
                    {(!showMatrix || !canShowMatrix) &&
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
                    </div>}
                    {(!showMatrix || !canShowMatrix) &&
                    <Button
                        className='PropertyAccessSection__add'
                        onClick={onAddRule}
                        emphasis='secondary'
                        size='medium'
                    >
                        {intl.formatMessage({id: 'PropertyAccess.addRule', defaultMessage: 'Add rule'})}
                    </Button>}
                </div>
            </div>
        </BoardPermissionGate>
    )
}

export default PropertyAccessSection
