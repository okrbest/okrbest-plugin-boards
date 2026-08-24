// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {useIntl} from 'react-intl'

import MenuWrapper from '../../widgets/menuWrapper'
import Menu from '../../widgets/menu'
import CheckIcon from '../../widgets/icons/check'
import CompassIcon from '../../widgets/icons/compassIcon'
import IconButton from '../../widgets/buttons/iconButton'
import DeleteIcon from '../../widgets/icons/delete'

import {
    Board,
    OrgRelation,
    PropertyAccessPermission,
    PropertyAccessRule,
    cardValueIds,
    orgRelations,
    orgRelationsNeedingProperty,
} from '../../blocks/board'
import {useAppSelector} from '../../store/hooks'
import {getDivisions, getDepartments, getDuties, isOrgMasterLoaded} from '../../store/orgMaster'
import {getDutyTiers} from '../../store/dutyTiers'

import {summarizeSelection} from './selectionSummary'

type Props = {
    board: Board
    rule: PropertyAccessRule
    onChange: (rule: PropertyAccessRule) => void
    onDelete: (ruleId: string) => void
}

type Choice = {
    id: string
    name: string
}

// Selector renders one axis of the rule with the same control the member list
// uses for board roles, so nothing in this dialog is operated two different ways.
const Selector = (props: {
    label: string
    selectedId: string
    choices: Choice[]
    broken: boolean
    onSelect: (id: string) => void
}): React.JSX.Element => {
    const selected = props.choices.find((choice) => choice.id === props.selectedId)
    const className = props.broken ? 'user-item__button PropertyAccessRow__broken' : 'user-item__button'

    return (
        <div className='PropertyAccessRow__axis'>
            {/*
              * The dialog scrolls, so a menu positioned inside it is clipped.
              * The portal is the house pattern for that, and it also puts each
              * menu under its own control — the member list pins every menu to
              * one spot, which reads fine for a single dropdown per row and not
              * at all for six.
              */}
            <MenuWrapper
                usePortal={true}
                menuPosition='bottom'
            >
                <button className={className}>
                    <span className='PropertyAccessRow__label'>{selected ? selected.name : props.label}</span>
                    <CompassIcon
                        icon='chevron-down'
                        className='CompassIcon'
                    />
                </button>
                <Menu position='bottom'>
                    {props.choices.map((choice) => (
                        <Menu.Text
                            key={choice.id || 'any'}
                            id={choice.id || 'any'}
                            check={true}
                            icon={props.selectedId === choice.id ? <CheckIcon/> : <div className='empty-icon'/>}
                            name={choice.name}
                            onClick={() => props.onSelect(choice.id)}
                        />
                    ))}
                </Menu>
            </MenuWrapper>
        </div>
    )
}

// MultiSelector is the same control for an axis that holds several values at
// once. The closed button reports the selection's shape, not its contents —
// listing every name turns a full pick into an unreadable smear — and the menu
// stays open while values are toggled so a set can be built in one pass.
const MultiSelector = (props: {
    label: string
    allLabel: string
    selectedIds: string[]
    choices: Choice[]
    broken: boolean
    onToggle: (id: string) => void
    onSelectAll: () => void
}): React.JSX.Element => {
    const intl = useIntl()
    const summary = summarizeSelection(props.selectedIds, props.choices)

    let labelText = props.label
    switch (summary.kind) {
    case 'all':
        labelText = props.allLabel
        break
    case 'single':
        labelText = summary.name
        break
    case 'count':
        labelText = intl.formatMessage(
            {id: 'PropertyAccess.valuesSelected', defaultMessage: '{count}개 선택'},
            {count: summary.count},
        )
        break
    default:
        labelText = props.label
    }

    const className = props.broken ? 'user-item__button PropertyAccessRow__broken' : 'user-item__button'

    return (
        <div className='PropertyAccessRow__axis'>
            <MenuWrapper
                usePortal={true}
                menuPosition='bottom'
            >
                <button className={className}>
                    <span className='PropertyAccessRow__label'>{labelText}</span>
                    <CompassIcon
                        icon='chevron-down'
                        className='CompassIcon'
                    />
                </button>
                <Menu position='bottom'>
                    <Menu.Text
                        key='__all__'
                        id='__all__'
                        check={true}
                        icon={summary.kind === 'all' ? <CheckIcon/> : <div className='empty-icon'/>}
                        name={props.allLabel}
                        suppressItemClicked={true}
                        onClick={() => props.onSelectAll()}
                    />
                    {props.choices.map((choice) => (
                        <Menu.Text
                            key={choice.id}
                            id={choice.id}
                            check={true}
                            icon={props.selectedIds.includes(choice.id) ? <CheckIcon/> : <div className='empty-icon'/>}
                            name={choice.name}
                            suppressItemClicked={true}
                            onClick={() => props.onToggle(choice.id)}
                        />
                    ))}
                </Menu>
            </MenuWrapper>
        </div>
    )
}

// toggleCardValues adds or removes one value from the rule's value set, always
// writing the list form and clearing the legacy single field so the two never
// disagree about what the rule restricts.
const toggleCardValues = (rule: PropertyAccessRule, valueId: string): PropertyAccessRule => {
    const current = cardValueIds(rule)
    const next = current.includes(valueId) ?
        current.filter((id) => id !== valueId) :
        [...current, valueId]
    return {...rule, propertyValueIds: next, propertyValueId: ''}
}

const PropertyAccessRow = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const {board, rule} = props

    const divisions = useAppSelector(getDivisions(board.teamId))
    const departments = useAppSelector(getDepartments(board.teamId, rule.divisionId))
    const duties = useAppSelector(getDuties(board.teamId))
    const tiers = useAppSelector(getDutyTiers(board.teamId))
    const orgMasterLoaded = useAppSelector(isOrgMasterLoaded(board.teamId))

    // Only properties that carry a fixed set of options can name a value, so
    // free text and date properties are not offered.
    const selectableProperties = board.cardProperties.filter((property) => (property.options || []).length > 0)
    const selectedProperty = selectableProperties.find((property) => property.id === rule.propertyId)
    const propertyValues = selectedProperty ? selectedProperty.options : []

    const anyLabel = intl.formatMessage({id: 'PropertyAccess.any', defaultMessage: 'Any'})
    const withAny = (choices: Choice[]): Choice[] => [{id: '', name: anyLabel}, ...choices]

    const permissions: Choice[] = [
        {id: 'viewer', name: intl.formatMessage({id: 'BoardMember.schemeViewer', defaultMessage: 'Viewer'})},
        {id: 'commenter', name: intl.formatMessage({id: 'BoardMember.schemeCommenter', defaultMessage: 'Commenter'})},
        {id: 'editor', name: intl.formatMessage({id: 'BoardMember.schemeEditor', defaultMessage: 'Editor'})},
    ]

    // A rule may outlive the property or organisation entry it points at. Such a
    // row stops matching any card, and saying so on the row is the only way an
    // admin finds out (FR-036).
    const brokenProperty = rule.propertyId !== '' && !selectedProperty
    const brokenValue = cardValueIds(rule).some((valueId) => !propertyValues.some((option) => option.id === valueId))
    const brokenDivision = orgMasterLoaded && rule.divisionId !== '' && !divisions.some((unit) => unit.id === rule.divisionId)
    const brokenDepartment = orgMasterLoaded && rule.departmentId !== '' && !departments.some((unit) => unit.id === rule.departmentId)
    const brokenDuty = orgMasterLoaded && rule.dutyId !== '' && !duties.some((duty) => duty.id === rule.dutyId)

    const relation: OrgRelation = rule.relation || ''
    const usesRelation = relation !== ''

    // The organisation axis takes one cell, not two. A relation and a named
    // organisation are two answers to the same question, so offering both at
    // once would leave the row unable to say which one it means.
    const relationNames: Record<Exclude<OrgRelation, ''>, string> = {
        any: intl.formatMessage({id: 'PropertyAccess.relationAny', defaultMessage: '전체'}),
        sameDivision: intl.formatMessage({id: 'PropertyAccess.relationSameDivision', defaultMessage: '같은 본부'}),
        otherDivision: intl.formatMessage({id: 'PropertyAccess.relationOtherDivision', defaultMessage: '다른 본부'}),
        sameDepartment: intl.formatMessage({id: 'PropertyAccess.relationSameDepartment', defaultMessage: '같은 부서'}),
        mine: intl.formatMessage({id: 'PropertyAccess.relationMine', defaultMessage: '본인'}),
    }

    const orgChoices: Choice[] = [
        ...withAny([]),
        ...orgRelations.map((value) => ({id: `relation:${value}`, name: relationNames[value as Exclude<OrgRelation, ''>]})),
        ...divisions.map((unit) => ({id: unit.id, name: unit.name})),
    ]

    // Which card property the relation reads. Offered only when the relation
    // needs one, and filled in without asking when the board has exactly one —
    // a board with a single 본부 property has nothing to choose between.
    const orgPropertyChoices = board.cardProperties.filter((property) =>
        property.type === 'orgDivision' || property.type === 'orgDepartment')
    const personPropertyChoices = board.cardProperties.filter((property) =>
        property.type === 'person' || property.type === 'multiPerson')

    // Each relation reads one kind of property off the card: the division
    // relations read a 본부 property, the department one a 부서 property. Counting
    // both kinds as one pool left a board carrying one of each — the ordinary
    // shape — with nothing to fall back on, and the server refuses a division
    // relation that names no property. Picking by kind gives every such board an
    // answer; a board with several of one kind still offers the choice, and
    // whatever the row already names is kept when it is of the right kind.
    const orgPropertyFor = (relation: OrgRelation, current: string): string => {
        const wanted = relation === 'sameDepartment' ? 'orgDepartment' : 'orgDivision'
        const matching = board.cardProperties.filter((property) => property.type === wanted)
        if (matching.some((property) => property.id === current)) {
            return current
        }
        return matching.length > 0 ? matching[0].id : ''
    }

    const onPickOrgCondition = (id: string) => {
        if (!id.startsWith('relation:')) {
            // A named organisation. The relation goes, so the row keeps one answer.
            props.onChange({...rule, relation: '', divisionId: id, departmentId: ''})
            return
        }

        const picked = id.slice('relation:'.length) as OrgRelation
        props.onChange({
            ...rule,
            relation: picked,
            divisionId: '',
            departmentId: '',
            orgPropertyId: orgRelationsNeedingProperty.includes(picked) ? orgPropertyFor(picked, rule.orgPropertyId || '') : '',
        })
    }

    const selectedOrgId = usesRelation ? `relation:${relation}` : rule.divisionId

    // The duty axis: a team duty group, or the single duty an older rule names.
    const usesTiers = (rule.tierIds || []).length > 0
    const dutyChoices: Choice[] = [
        ...withAny([]),
        ...tiers.map((tier) => ({id: `tier:${tier.id}`, name: tier.name})),
        ...duties.map((duty) => ({id: duty.id, name: duty.name})),
    ]

    // A rule can outlive a tier: tiers belong to the team, rules to the board.
    // Such a row matches nobody, and saying so on the row is the only way an
    // admin finds out (FR-024).
    const brokenTier = usesTiers && !tiers.some((tier) => tier.id === rule.tierIds![0])

    const hasCardCondition = rule.propertyId !== '' && (rule.propertyValueId !== '' || (rule.propertyValueIds || []).length > 0)
    const hasSubjectCondition = usesRelation || usesTiers ||
        rule.divisionId !== '' || rule.departmentId !== '' || rule.dutyId !== ''
    const invalid = !hasCardCondition || !hasSubjectCondition

    const className = `user-item PropertyAccessRow${invalid ? ' PropertyAccessRow--invalid' : ''}`

    return (
        <div className={className}>
            <div className='PropertyAccessRow__axes'>
                <Selector
                    label={intl.formatMessage({id: 'PropertyAccess.selectProperty', defaultMessage: 'Property'})}
                    selectedId={rule.propertyId}
                    choices={selectableProperties.map((property) => ({id: property.id, name: property.name}))}
                    broken={brokenProperty}
                    onSelect={(id) => props.onChange({...rule, propertyId: id, propertyValueId: '', propertyValueIds: []})}
                />
                <MultiSelector
                    label={intl.formatMessage({id: 'PropertyAccess.selectValue', defaultMessage: 'Value'})}
                    allLabel={intl.formatMessage({id: 'PropertyAccess.allValues', defaultMessage: '전체'})}
                    selectedIds={cardValueIds(rule)}
                    choices={propertyValues.map((option) => ({id: option.id, name: option.value}))}
                    broken={brokenValue}
                    onToggle={(id) => props.onChange(toggleCardValues(rule, id))}
                    onSelectAll={() => props.onChange({...rule, propertyValueIds: propertyValues.map((option) => option.id), propertyValueId: ''})}
                />
                <Selector
                    label={intl.formatMessage({id: 'PropertyAccess.selectOrgCondition', defaultMessage: 'Organisation'})}
                    selectedId={selectedOrgId}
                    choices={orgChoices}
                    broken={brokenDivision}
                    onSelect={(id) => {
                        if (id === '' || id.startsWith('relation:')) {
                            onPickOrgCondition(id)
                            return
                        }

                        // The department list is scoped to the division, so a
                        // department left over from the previous one would be a
                        // condition the admin can no longer see.
                        const keepDepartment = departments.some((unit) => unit.id === rule.departmentId && unit.parentId === id)
                        props.onChange({
                            ...rule,
                            relation: '',
                            divisionId: id,
                            departmentId: keepDepartment ? rule.departmentId : '',
                        })
                    }}
                />
                {/*
                  * The cell after the organisation one answers "measured against
                  * what". A named division asks which department; a relation asks
                  * which property to read. Same slot, because the question only
                  * exists once the cell before it has been answered.
                  */}
                {usesRelation ? (
                    <Selector
                        label={intl.formatMessage({id: 'PropertyAccess.selectOrgProperty', defaultMessage: 'Property to compare'})}
                        selectedId={relation === 'mine' ? (rule.assigneePropertyId || '') : (rule.orgPropertyId || '')}
                        choices={withAny((relation === 'mine' ? personPropertyChoices : orgPropertyChoices)
                            .map((property) => ({id: property.id, name: property.name})))}
                        broken={false}
                        onSelect={(id) => props.onChange(relation === 'mine' ?
                            {...rule, assigneePropertyId: id} :
                            {...rule, orgPropertyId: id})}
                    />
                ) : (
                    <Selector
                        label={intl.formatMessage({id: 'PropertyAccess.selectDepartment', defaultMessage: 'Department'})}
                        selectedId={rule.departmentId}
                        choices={withAny(departments.map((unit) => ({id: unit.id, name: unit.name})))}
                        broken={brokenDepartment}
                        onSelect={(id) => props.onChange({...rule, departmentId: id})}
                    />
                )}
                {/*
                  * Duty groups first, then the individual duties an older rule
                  * may still name. Picking either one clears the other — the row
                  * has one duty axis, and two answers to it would leave the row
                  * unable to say which it means.
                  */}
                <Selector
                    label={intl.formatMessage({id: 'PropertyAccess.selectDuty', defaultMessage: 'Duty'})}
                    selectedId={usesTiers ? `tier:${rule.tierIds![0]}` : rule.dutyId}
                    choices={dutyChoices}
                    broken={brokenDuty || brokenTier}
                    onSelect={(id) => {
                        if (id.startsWith('tier:')) {
                            props.onChange({...rule, tierIds: [id.slice('tier:'.length)], dutyId: ''})
                            return
                        }
                        props.onChange({...rule, tierIds: [], dutyId: id})
                    }}
                />
                <Selector
                    label={intl.formatMessage({id: 'PropertyAccess.selectPermission', defaultMessage: 'Permission'})}
                    selectedId={rule.permission}
                    choices={permissions}
                    broken={false}
                    onSelect={(id) => props.onChange({...rule, permission: id as PropertyAccessPermission})}
                />
                {/*
                  * A row missing either half of its condition is never sent to
                  * the server — the save drops it. Dimming the row said only
                  * that something was off; this says what is missing and that
                  * nothing has been stored yet.
                  */}
                {invalid &&
                    <div className='PropertyAccessRow__pending'>
                        {hasCardCondition ?
                            intl.formatMessage({
                                id: 'PropertyAccess.pendingSubject',
                                defaultMessage: 'Pick an organisation or duty — this row is not saved yet.',
                            }) :
                            intl.formatMessage({
                                id: 'PropertyAccess.pendingCard',
                                defaultMessage: 'Pick a property and value — this row is not saved yet.',
                            })}
                    </div>}
            </div>
            <IconButton
                className='PropertyAccessRow__delete'
                onClick={() => props.onDelete(rule.id)}
                icon={<DeleteIcon/>}
                title={intl.formatMessage({id: 'PropertyAccess.removeRule', defaultMessage: 'Remove rule'})}
            />
        </div>
    )
}

export default PropertyAccessRow
