// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {NamedEntry, OrgColors, PropertyTypeEnum} from '../blocks/board'
import {Constants} from '../constants'

// Naming the organisation values a card carries.
//
// A card stores IDs — 본부, 부서 and 직책 alike — and every screen that shows one
// has to put a name next to it. The group headers and the CSV export each used
// to build their own map, so adding a third organisation property meant a third
// copy. This is that map, once (research R2).
//
// PropertyType.exportValue cannot do this itself: it is a pure function with no
// way to reach the organisation master, which is the same reason person values
// are resolved by their callers.

// The property types whose choices live in the organisation master rather than
// on the board. Their options array is always empty, which is why the generic
// paths — group headers, CSV export — have to be told about them.
const orgPropertyTypes = new Set<PropertyTypeEnum>(['orgDivision', 'orgDepartment', 'orgDuty'])

export function isOrgProperty(type: PropertyTypeEnum): boolean {
    return orgPropertyTypes.has(type)
}

// Names for the IDs in the order the card stored them.
//
// An ID the master no longer carries comes back as the ID rather than as
// "unknown" or as nothing: the master belongs to the main server, so a value it
// dropped is not this plugin's to discard (FR-006).
export function orgNamesForIds(ids: string[], labels: NamedEntry[]): string[] {
    const byID = new Map(labels.map((entry) => [entry.id, entry.name]))
    return ids.filter((id) => Boolean(id)).map((id) => byID.get(id) || id)
}

// ---- Colour ----

// A value the master no longer carries is shown in the warning colour wherever
// it appears. It outranks a picked colour: that the value disappeared matters
// more than the colour someone chose for it (FR-009).
const staleColor = 'propColorRed'

// The colours an unpicked value can land on. Grey is left out on purpose — it is
// what "no colour" looks like, so an automatic pick landing there would be
// indistinguishable from a value nothing has coloured. A user who picks grey
// deliberately still gets it.
const autoColors = Object.keys(Constants.menuColors).filter((key) => key !== 'propColorDefault')

// djb2. The colour a user sees must survive refreshes, other boards and other
// machines, so the hash cannot come from anything the platform is free to change
// between runs.
function hashString(value: string): number {
    let hash = 5381
    for (let index = 0; index < value.length; index++) {
        hash = (((hash << 5) + hash) ^ value.charCodeAt(index)) | 0
    }
    return Math.abs(hash)
}

// The background an organisation value is drawn with.
//
// Three rules, in order:
//
//   1. the master no longer carries the ID → warning colour
//   2. the board picked a colour for it    → that colour
//   3. otherwise                           → derived from the ID
//
// Rule 3 is a calculation rather than a stored default, which is why an
// untouched board stores nothing and why the same 본부 keeps its colour
// everywhere (research R2).
export function orgColorForId(id: string, known: NamedEntry[], picked?: OrgColors): string {
    if (!known.some((entry) => entry.id === id)) {
        return staleColor
    }

    // A stored value that is not a palette key is ignored rather than passed
    // through: board.properties is free form JSON, and a broken label reads as a
    // bug where a plain one reads as "nobody picked this yet".
    const choice = picked?.[id]
    if (choice && choice in Constants.menuColors) {
        return choice
    }

    return autoColors[hashString(id) % autoColors.length]
}

// Where a board keeps the colours somebody picked. propertyAccess already lives
// beside it under board.properties, which is why the picks go here rather than
// into the property's options array — an organisation property's options being
// empty is what keeps it out of the card access rules (research R1).
export const ORG_COLORS_KEY = 'orgColors'

// The picks a board carries, with anything unusable dropped.
//
// The store is free form JSON that other features write to as well, so a hand
// edit or an older client can leave a string, an array or a number here. None of
// that should reach the screen: a value that is not a colour is treated as a
// value nobody picked.
export function pickedOrgColors(properties?: Record<string, unknown>): OrgColors {
    const stored = properties?.[ORG_COLORS_KEY]
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return {}
    }

    const picks: OrgColors = {}
    Object.entries(stored).forEach(([id, color]) => {
        if (typeof color === 'string') {
            picks[id] = color
        }
    })
    return picks
}

// The colour a group header is drawn with.
//
// A group can stand for several values, and it takes the first one's colour —
// the same rule a select property's group already follows. The group that holds
// cards with no value has no colour: it is not an organisation unit, and
// painting it would suggest otherwise.
export function orgGroupColor(ids: string[], known: NamedEntry[], picked?: OrgColors): string {
    const first = ids.filter((id) => Boolean(id))[0]
    return first ? orgColorForId(first, known, picked) : ''
}
