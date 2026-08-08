// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useMemo} from 'react'
import {useIntl} from 'react-intl'

import {IPropertyOption, OrgUnit} from '../blocks/board'
import mutator from '../mutator'
import Label from '../widgets/label'
import ValueSelector from '../widgets/valueSelector'

import {PropertyProps} from './types'

// The editor shared by the 본부 and 부서 property types. They differ only in
// which units they offer, so the caller passes those in and everything else —
// storage shape, display, stale value handling — is identical.
//
// It is modelled on the multiselect editor. The one real difference is that the
// choices belong to the organisation master rather than to the board, so
// ValueSelector runs with fixedOptions and offers no create, rename, delete or
// recolour.

type Props = PropertyProps & {

    // Active units the card may pick from, already narrowed by the caller.
    options: OrgUnit[]

    // Every unit of the team, used to name values that are no longer offered.
    allUnits: OrgUnit[]
}

const orgOptionColor = 'propColorDefault'

// A value the master no longer offers is shown rather than dropped: the master
// belongs to the main server, so this plugin is not in a position to decide
// that a card's history is wrong (FR-006).
const staleOptionColor = 'propColorRed'

export function toPropertyOption(unit: OrgUnit): IPropertyOption {
    return {id: unit.id, value: unit.name, color: orgOptionColor}
}

// Values currently on the card, named from the master where possible.
//
// Order follows the card's stored order so the chips do not jump around when
// the narrowing changes.
export function selectedOptions(values: string[], allUnits: OrgUnit[], staleSuffix: string): IPropertyOption[] {
    const byID = new Map(allUnits.map((unit) => [unit.id, unit]))
    return values.map((id) => {
        const unit = byID.get(id)
        if (unit) {
            return toPropertyOption(unit)
        }
        return {id, value: `${id} ${staleSuffix}`, color: staleOptionColor}
    })
}

// What the dropdown lists: everything allowed, plus anything already on the
// card that the allowed set does not cover (FR-015). One union covers all three
// cases that produce such a value — a retired unit, a narrowing that moved, and
// a unit outside the current 본부 selection.
export function displayOptions(allowed: OrgUnit[], selected: IPropertyOption[]): IPropertyOption[] {
    const options = allowed.map(toPropertyOption)
    const listed = new Set(options.map((option) => option.id))
    selected.forEach((option) => {
        if (!listed.has(option.id)) {
            options.push(option)
            listed.add(option.id)
        }
    })
    return options
}

const OrgUnitEditor = (props: Props): React.JSX.Element => {
    const {propertyTemplate, propertyValue, board, card, options, allUnits} = props
    const isEditable = !props.readOnly && Boolean(board)
    const [open, setOpen] = useState(false)
    const intl = useIntl()

    const emptyDisplayValue = props.showEmptyPlaceholder ? intl.formatMessage({
        id: 'PropertyValueElement.empty',
        defaultMessage: 'Empty',
    }) : ''

    const staleSuffix = intl.formatMessage({
        id: 'OrgProperty.unknownUnit',
        defaultMessage: '(removed)',
    })

    const values = useMemo(
        () => (Array.isArray(propertyValue) ? propertyValue.filter((v): v is string => typeof v === 'string' && v !== '') : []),
        [propertyValue],
    )

    const selected = useMemo(
        () => selectedOptions(values, allUnits, staleSuffix),
        [values, allUnits, staleSuffix],
    )

    const listed = useMemo(
        () => displayOptions(options, selected),
        [options, selected],
    )

    const onChange = useCallback(
        (newValue: string | string[]) => mutator.changePropertyValue(board.id, card, propertyTemplate.id, newValue),
        [board.id, card, propertyTemplate.id],
    )

    const onDeleteValue = useCallback(
        (valueToDelete: IPropertyOption) => {
            mutator.changePropertyValue(
                board.id,
                card,
                propertyTemplate.id,
                values.filter((id) => id !== valueToDelete.id),
            )
        },
        [board.id, card, propertyTemplate.id, values],
    )

    if (!isEditable || !open) {
        return (
            <div
                className={props.property.valueClassName(!isEditable)}
                tabIndex={0}
                data-testid='org-unit-non-editable'
                onClick={() => setOpen(true)}
            >
                {selected.map((option) => (
                    <Label
                        key={option.id}
                        color={option.color}
                    >
                        {option.value}
                    </Label>
                ))}
                {selected.length === 0 && <Label color='empty'>{emptyDisplayValue}</Label>}
            </div>
        )
    }

    return (
        <ValueSelector
            isMulti={true}
            fixedOptions={true}
            emptyValue={emptyDisplayValue}
            options={listed}
            value={selected}
            onChange={onChange}
            onDeleteValue={onDeleteValue}
            onBlur={() => setOpen(false)}
        />
    )
}

export default OrgUnitEditor
