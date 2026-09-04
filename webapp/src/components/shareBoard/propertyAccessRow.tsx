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
} from '../../blocks/board'
import {useAppSelector} from '../../store/hooks'
import {getDivisions, getDepartments, getDuties, isOrgMasterLoaded} from '../../store/orgMaster'
import {getDutyTiers} from '../../store/dutyTiers'

import {orgPropertyForRelation} from './orgProperty'
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
    allSelected: boolean
    choices: Choice[]
    broken: boolean
    onToggle: (id: string) => void
    onSelectAll: () => void
}): React.JSX.Element => {
    const intl = useIntl()

    // "전체" is stored as an intent rather than as the list of values that
    // existed when it was chosen, so it cannot be read back off the selection.
    const summary = props.allSelected ? {kind: 'all'} as const : summarizeSelection(props.selectedIds, props.choices)
    const isChecked = (id: string) => props.allSelected || props.selectedIds.includes(id)

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
                            icon={isChecked(choice.id) ? <CheckIcon/> : <div className='empty-icon'/>}
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

// DutySelector is the duty axis, which holds a set rather than a single answer.
//
// A row may name several duty groups — `팀장 또는 팀원` is one row, not two
// (009 FR-011) — and the matrix editor writes exactly such rows. Reading only
// the first one made those rows lie: the screen said 팀장 while the server was
// letting 팀원 through as well, and any edit to the row saved the single group
// the screen was showing, dropping the rest without a word.
//
// It is not MultiSelector because "Any" is not "every group". Any places no duty
// condition at all, and a team can hold duties no group lists — the dialog says
// as much under the group editor. Naming all four groups is a narrower rule than
// naming none, so the two must not read back as the same thing.
const DutySelector = (props: {
    label: string
    anyLabel: string
    tierIds: string[]
    dutyId: string
    tiers: Choice[]
    duties: Choice[]
    broken: boolean
    onToggleTier: (tierId: string) => void
    onPickDuty: (dutyId: string) => void
    onClear: () => void
}): React.JSX.Element => {
    const intl = useIntl()

    const usesTiers = props.tierIds.length > 0
    const selectedDuty = props.duties.find((duty) => duty.id === props.dutyId)
    const countLabel = (count: number) => intl.formatMessage(
        {id: 'PropertyAccess.valuesSelected', defaultMessage: '{count}개 선택'},
        {count},
    )

    let labelText = props.anyLabel
    if (usesTiers) {
        const summary = summarizeSelection(props.tierIds, props.tiers)
        switch (summary.kind) {
        case 'single':
            labelText = summary.name
            break

        // Every group named is still a count, not "Any". The two mean different
        // things and the label has to keep them apart.
        case 'all':
            labelText = countLabel(props.tiers.length)
            break
        case 'count':
            labelText = countLabel(summary.count)
            break

        // Every group it names is gone. The row matches nobody, and reading the
        // axis as unset would hide that.
        default:
            labelText = props.label
        }
    } else if (selectedDuty) {
        labelText = selectedDuty.name
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
                        key='any'
                        id='any'
                        check={true}
                        icon={!usesTiers && props.dutyId === '' ? <CheckIcon/> : <div className='empty-icon'/>}
                        name={props.anyLabel}
                        suppressItemClicked={true}
                        onClick={() => props.onClear()}
                    />
                    {props.tiers.map((tier) => (
                        <Menu.Text
                            key={tier.id}
                            id={tier.id}
                            check={true}
                            icon={props.tierIds.includes(tier.id) ? <CheckIcon/> : <div className='empty-icon'/>}
                            name={tier.name}
                            suppressItemClicked={true}
                            onClick={() => props.onToggleTier(tier.id)}
                        />
                    ))}

                    {/*
                      * The single duty an older row may still name. One duty is
                      * one answer rather than a set, so picking one replaces
                      * whatever the axis held.
                      */}
                    {props.duties.map((duty) => (
                        <Menu.Text
                            key={duty.id}
                            id={duty.id}
                            check={true}
                            icon={props.dutyId === duty.id ? <CheckIcon/> : <div className='empty-icon'/>}
                            name={duty.name}
                            suppressItemClicked={true}
                            onClick={() => props.onPickDuty(duty.id)}
                        />
                    ))}
                </Menu>
            </MenuWrapper>
        </div>
    )
}

// toggleTier adds or removes one duty group, keeping the rest. Replacing the
// list is what silently narrowed a `팀장 또는 팀원` row to whichever group the
// screen happened to be showing.
const toggleTier = (tierIds: string[], tierId: string): string[] =>
    (tierIds.includes(tierId) ? tierIds.filter((id) => id !== tierId) : [...tierIds, tierId])

// toggleCardValues adds or removes one value from the rule's value set, always
// writing the list form and clearing the legacy single field so the two never
// disagree about what the rule restricts.
const toggleCardValues = (rule: PropertyAccessRule, valueId: string, allOptionIds: string[]): PropertyAccessRule => {
    // Every value showed a check while the row meant "all", so switching off one
    // of them leaves the other values on. Keeping only the clicked value would
    // throw away the rest without the screen ever saying so.
    if (rule.allValues) {
        return {
            ...rule,
            allValues: false,
            propertyValueIds: allOptionIds.filter((id) => id !== valueId),
            propertyValueId: '',
        }
    }

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
    const brokenValue = !rule.allValues &&
        cardValueIds(rule).some((valueId) => !propertyValues.some((option) => option.id === valueId))
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
            orgPropertyId: orgPropertyForRelation(picked, board.cardProperties, rule.orgPropertyId || ''),
        })
    }

    const selectedOrgId = usesRelation ? `relation:${relation}` : rule.divisionId

    // The duty axis: the team's duty groups, or the single duty an older rule
    // names. The two are offered in one control and stored in separate fields,
    // so they are kept as separate lists here rather than flattened behind a
    // prefix — the control has to know which kind it is toggling.
    const usesTiers = (rule.tierIds || []).length > 0
    const tierChoices: Choice[] = tiers.map((tier) => ({id: tier.id, name: tier.name}))
    const dutyChoices: Choice[] = duties.map((duty) => ({id: duty.id, name: duty.name}))

    // A rule can outlive a tier: tiers belong to the team, rules to the board.
    // Such a row matches nobody, and saying so on the row is the only way an
    // admin finds out (FR-024).
    //
    // Every group the row names is checked, not just the first. A row reading
    // `팀장 또는 팀원` whose second group was deleted still stops matching half
    // of who it says it covers.
    const brokenTier = usesTiers && (rule.tierIds || []).some(
        (tierId) => !tiers.some((tier) => tier.id === tierId))

    const hasCardCondition = rule.propertyId !== '' &&
        (Boolean(rule.allValues) || rule.propertyValueId !== '' || (rule.propertyValueIds || []).length > 0)
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
                    onSelect={(id) => props.onChange({...rule, propertyId: id, propertyValueId: '', propertyValueIds: [], allValues: false})}
                />
                <MultiSelector
                    label={intl.formatMessage({id: 'PropertyAccess.selectValue', defaultMessage: 'Value'})}
                    allLabel={intl.formatMessage({id: 'PropertyAccess.allValues', defaultMessage: '전체'})}
                    selectedIds={cardValueIds(rule)}
                    allSelected={Boolean(rule.allValues)}
                    choices={propertyValues.map((option) => ({id: option.id, name: option.value}))}
                    broken={brokenValue}
                    onToggle={(id) => props.onChange(toggleCardValues(rule, id, propertyValues.map((option) => option.id)))}
                    onSelectAll={() => props.onChange({...rule, allValues: true, propertyValueIds: [], propertyValueId: ''})}
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
                  * may still name. Groups accumulate — one row can cover several
                  * — while a single duty replaces whatever the axis held: the row
                  * has one duty axis, and two kinds of answer to it would leave
                  * the row unable to say which it means.
                  */}
                <DutySelector
                    label={intl.formatMessage({id: 'PropertyAccess.selectDuty', defaultMessage: 'Duty'})}
                    anyLabel={anyLabel}
                    tierIds={rule.tierIds || []}
                    dutyId={rule.dutyId}
                    tiers={tierChoices}
                    duties={dutyChoices}
                    broken={brokenDuty || brokenTier}
                    onToggleTier={(tierId) => props.onChange({
                        ...rule,
                        tierIds: toggleTier(rule.tierIds || [], tierId),
                        dutyId: '',
                    })}
                    onPickDuty={(dutyId) => props.onChange({
                        ...rule,
                        tierIds: [],
                        dutyId: rule.dutyId === dutyId ? '' : dutyId,
                    })}
                    onClear={() => props.onChange({...rule, tierIds: [], dutyId: ''})}
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
