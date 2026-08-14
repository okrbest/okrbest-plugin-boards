// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useMemo} from 'react'
import {useIntl} from 'react-intl'

import {IPropertyOption, NamedEntry, OrgColors} from '../blocks/board'
import mutator from '../mutator'
import Label from '../widgets/label'
import ValueSelector from '../widgets/valueSelector'

import {orgColorForId, pickedOrgColors} from './orgLabels'
import {PropertyProps} from './types'

// The editor shared by the 본부, 부서 and 직책 property types. They differ only in
// which entries they offer, so the caller passes those in and everything else —
// storage shape, display, stale value handling — is identical.
//
// It is modelled on the multiselect editor. The one real difference is that the
// choices belong to the organisation master rather than to the board, so
// ValueSelector runs with fixedOptions and offers no create, rename, delete or
// recolour.

// NamedEntry — an id and a name — is everything the editor reads. Typing the
// props that way rather than as OrgUnit is what lets 직책, which carries a rank
// instead of a parent, share the editor without a cast.
type Props = PropertyProps & {

    // Active entries the card may pick from, already narrowed by the caller.
    options: NamedEntry[]

    // Every entry of the team, used to name values that are no longer offered.
    allUnits: NamedEntry[]
}

// Colour is not decided here. orgColorForId owns the three rules — warning,
// picked, derived — so the card editor, the filter list and the group header
// cannot drift apart (007 contract 1절). A value the master dropped comes back
// warned by that same call, which is why the stale branch below no longer names
// a colour of its own.
export function toPropertyOption(unit: NamedEntry, color: string): IPropertyOption {
    return {id: unit.id, value: unit.name, color}
}

// Values currently on the card, named from the master where possible.
//
// Order follows the card's stored order so the chips do not jump around when
// the narrowing changes.
export function selectedOptions(values: string[], allUnits: NamedEntry[], staleSuffix: string, picked?: OrgColors): IPropertyOption[] {
    const byID = new Map(allUnits.map((unit) => [unit.id, unit]))
    return values.map((id) => {
        const color = orgColorForId(id, allUnits, picked)
        const unit = byID.get(id)
        if (unit) {
            return toPropertyOption(unit, color)
        }
        return {id, value: `${id} ${staleSuffix}`, color}
    })
}

// What the dropdown lists: everything allowed, plus anything already on the
// card that the allowed set does not cover (FR-015). One union covers all three
// cases that produce such a value — a retired unit, a narrowing that moved, and
// a unit outside the current 본부 selection.
export function displayOptions(allowed: NamedEntry[], selected: IPropertyOption[], picked?: OrgColors): IPropertyOption[] {
    const options = allowed.map((unit) => toPropertyOption(unit, orgColorForId(unit.id, allowed, picked)))
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

    // Only the colours somebody picked live on the board. An untouched board
    // has no such key at all, and every value falls through to the derived
    // colour (007 data-model 1절).
    const picked = useMemo(() => pickedOrgColors(board?.properties), [board?.properties])

    const selected = useMemo(
        () => selectedOptions(values, allUnits, staleSuffix, picked),
        [values, allUnits, staleSuffix, picked],
    )

    const listed = useMemo(
        () => displayOptions(options, selected, picked),
        [options, selected, picked],
    )

    const onChange = useCallback(
        (newValue: string | string[]) => mutator.changePropertyValue(board.id, card, propertyTemplate.id, newValue),
        [board.id, card, propertyTemplate.id],
    )

    // Colour is the board's to choose even though the organisation is not.
    // The pick is keyed by unit, so it holds for every property that names the
    // same 본부 on this board (007 data-model 1절).
    const onChangeColor = useCallback(
        (option: IPropertyOption, color: string) => mutator.changeOrgUnitColor(board, option.id, color),
        [board],
    )

    const onClearColor = useCallback(
        (option: IPropertyOption) => mutator.clearOrgUnitColor(board, option.id),
        [board],
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
            onChangeColor={onChangeColor}
            onClearColor={onClearColor}
            onDeleteValue={onDeleteValue}
            onBlur={() => setOpen(false)}
        />
    )
}

export default OrgUnitEditor
