// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Board, OrgUnit, PropertyTypeEnum} from '../blocks/board'
import {Card} from '../blocks/card'

// Narrowing the organisation choices on a card, as pure functions.
//
// Everything here computes from state the screen already holds — the card, the
// board and the cached organisation master. Nothing round trips to the server,
// because the person selector reads redux synchronously and an async narrowing
// would have to reshape it (research R1).
//
// The narrowing is an input convenience, not access control. The server accepts
// whatever it is given; spec 002 owns who may write what.

// Every organisation ID the card carries for one property type, unioned across
// all values and all properties of that type (FR-009, FR-010).
export function selectedUnitIds(card: Card, board: Board, type: PropertyTypeEnum): Set<string> {
    const ids = new Set<string>()

    board.cardProperties?.forEach((template) => {
        if (template.type !== type) {
            return
        }
        const value = card.fields?.properties?.[template.id]
        if (Array.isArray(value)) {
            value.forEach((id) => {
                if (typeof id === 'string' && id !== '') {
                    ids.add(id)
                }
            })
        } else if (typeof value === 'string' && value !== '') {
            // Property values are free form JSON; a bare string can arrive from
            // an import or a hand edit even though nothing writes one.
            ids.add(value)
        }
    })

    return ids
}

// Departments the card may pick, given the divisions it already names.
//
// No divisions means no narrowing rather than no choices (FR-008): an empty
// division is "not said yet", not "said nothing qualifies".
export function allowedDepartments(divisionIds: Set<string>, units: OrgUnit[]): OrgUnit[] {
    return units.filter((unit) => {
        if (unit.type !== 'department') {
            return false
        }
        return divisionIds.size === 0 || divisionIds.has(unit.parentId)
    })
}

// What a list actually shows: the allowed set widened by whatever the card
// already holds (FR-015).
//
// null means "do not narrow" and passes straight through. Keeping it distinct
// from the empty set matters — an empty set is a real answer ("nobody
// qualifies") and collapsing the two would blank every list on a card that
// names no organisation.
export function displayedIds(allowed: Set<string> | null, current: string[]): Set<string> | null {
    if (allowed === null) {
        return null
    }
    const shown = new Set(allowed)
    current.forEach((id) => {
        if (id !== '') {
            shown.add(id)
        }
    })
    return shown
}
