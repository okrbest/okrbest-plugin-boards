// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {NamedEntry, PropertyTypeEnum} from '../blocks/board'

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
