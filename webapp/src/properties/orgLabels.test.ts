// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {NamedEntry, PropertyTypeEnum} from '../blocks/board'
import {Constants} from '../constants'

import {orgNamesForIds, isOrgProperty, orgColorForId, pickedOrgColors, orgGroupColor, ORG_COLORS_KEY} from './orgLabels'

// Cards store organisation IDs; group headers and CSV rows have to show names.
// Both used to build their own map, which is why 직책 needed a third copy —
// hence this one function (research R2).
describe('properties/orgLabels', () => {
    const labels: NamedEntry[] = [
        {id: 'div-production', name: '생산본부'},
        {id: 'dep-production', name: '생산팀'},
        {id: 'duty-lead', name: '팀장'},
    ]

    test('names an organisation unit', () => {
        expect(orgNamesForIds(['div-production'], labels)).toEqual(['생산본부'])
    })

    test('names a duty from the same call', () => {
        // 본부, 부서 and 직책 IDs come from different tables and never collide,
        // so one lookup covers all three.
        expect(orgNamesForIds(['duty-lead'], labels)).toEqual(['팀장'])
    })

    test('keeps the order the card stored', () => {
        expect(orgNamesForIds(['duty-lead', 'div-production'], labels)).toEqual(['팀장', '생산본부'])
    })

    test('falls back to the ID when the master no longer carries it (FR-006)', () => {
        // Showing the raw ID is deliberate: the master belongs to the main
        // server, so a value it dropped is not this plugin's to discard or to
        // rename into "unknown".
        expect(orgNamesForIds(['duty-retired'], labels)).toEqual(['duty-retired'])
    })

    test('drops empty entries rather than emitting blanks', () => {
        expect(orgNamesForIds(['', 'duty-lead'], labels)).toEqual(['팀장'])
    })

    test('returns nothing for no IDs', () => {
        expect(orgNamesForIds([], labels)).toEqual([])
    })
})

// Group headers and the CSV export both have to ask "is this an organisation
// property?" before resolving names. Asking in one place is what keeps a fourth
// organisation property from needing a fourth edit.
describe('properties/orgLabels — isOrgProperty', () => {
    test('recognises all three organisation properties', () => {
        expect(isOrgProperty('orgDivision')).toBe(true)
        expect(isOrgProperty('orgDepartment')).toBe(true)
        expect(isOrgProperty('orgDuty')).toBe(true)
    })

    test('rejects properties whose choices live on the board', () => {
        const others: PropertyTypeEnum[] = ['select', 'multiSelect', 'person', 'multiPerson', 'text', 'date']
        others.forEach((type) => expect(isOrgProperty(type)).toBe(false))
    })
})

// A card stores an organisation ID and the screen has to pick a background for
// it. Three rules decide, and they have to agree across the card editor, the
// filter list and the group header — so they live in one function.
describe('properties/orgLabels — orgColorForId', () => {
    const known: NamedEntry[] = [
        {id: 'div-production', name: '생산본부'},
        {id: 'div-sales', name: '영업본부'},
        {id: 'duty-lead', name: '팀장'},
    ]

    test('gives the same ID the same colour every time', () => {
        // Not merely equal within one run: the value is what a user sees after a
        // refresh, on another board, in another account.
        const first = orgColorForId('div-production', known)
        const second = orgColorForId('div-production', known)

        expect(first).toBe(second)
        expect(first).toBe(orgColorForId('div-production', [{id: 'div-production', name: '이름이 달라도'}]))
    })

    test('never assigns the default grey on its own', () => {
        // Grey is what "no colour" looks like. An automatic pick landing on it
        // would be indistinguishable from a value nothing has coloured.
        const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']
        const assigned = ids.map((id) => orgColorForId(id, [{id, name: id}]))

        expect(assigned).not.toContain('propColorDefault')
    })

    test('assigns only colours the palette carries', () => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
        const assigned = ids.map((id) => orgColorForId(id, [{id, name: id}]))

        assigned.forEach((color) => expect(Object.keys(Constants.menuColors)).toContain(color))
    })

    test('a picked colour wins over the automatic one', () => {
        const auto = orgColorForId('div-production', known)
        const picked = orgColorForId('div-production', known, {'div-production': 'propColorBlue'})

        expect(picked).toBe('propColorBlue')
        expect(picked).not.toBe(auto)
    })

    test('a pick for one unit leaves the others alone', () => {
        const picks = {'div-production': 'propColorBlue'}

        expect(orgColorForId('div-sales', known, picks)).toBe(orgColorForId('div-sales', known))
    })

    test('a value the master no longer carries is warned about, pick or not', () => {
        // The warning outranks the pick: that the value disappeared matters more
        // than the colour someone chose for it (FR-009).
        expect(orgColorForId('div-retired', known)).toBe('propColorRed')
        expect(orgColorForId('div-retired', known, {'div-retired': 'propColorBlue'})).toBe('propColorRed')
    })

    test('falls back to the automatic colour when the stored value is not a palette key', () => {
        // board.properties is free form JSON. A hand edit or an older client can
        // leave anything there, and a broken label is worse than a plain one.
        const auto = orgColorForId('div-production', known)

        expect(orgColorForId('div-production', known, {'div-production': 'chartreuse'})).toBe(auto)
    })

    test('grey is allowed when someone picks it deliberately', () => {
        expect(orgColorForId('div-production', known, {'div-production': 'propColorDefault'})).toBe('propColorDefault')
    })
})

// board.properties is free form JSON shared with other features. Reading it has
// to survive a hand edit and a key another feature owns.
describe('properties/orgLabels — pickedOrgColors', () => {
    test('reads the picks a board stored', () => {
        expect(pickedOrgColors({[ORG_COLORS_KEY]: {'div-1': 'propColorBlue'}})).toEqual({'div-1': 'propColorBlue'})
    })

    test('an untouched board has no picks', () => {
        expect(pickedOrgColors(undefined)).toEqual({})
        expect(pickedOrgColors({})).toEqual({})
    })

    test('ignores a stored value that is not a map', () => {
        expect(pickedOrgColors({[ORG_COLORS_KEY]: 'blue'})).toEqual({})
        expect(pickedOrgColors({[ORG_COLORS_KEY]: ['blue']})).toEqual({})
    })

    test('drops entries whose colour is not a string', () => {
        expect(pickedOrgColors({[ORG_COLORS_KEY]: {'div-1': 7, 'div-2': 'propColorBlue'}})).toEqual({'div-2': 'propColorBlue'})
    })

    test('leaves keys other features own alone', () => {
        expect(pickedOrgColors({propertyAccess: {enabled: true}, [ORG_COLORS_KEY]: {'div-1': 'propColorBlue'}})).toEqual({'div-1': 'propColorBlue'})
    })
})

// A group header stands for a set of values, so it has to settle on one colour.
describe('properties/orgLabels — orgGroupColor', () => {
    const known: NamedEntry[] = [
        {id: 'div-production', name: '생산본부'},
        {id: 'div-sales', name: '영업본부'},
    ]

    test('takes the first value colour, the way a select group does', () => {
        expect(orgGroupColor(['div-production', 'div-sales'], known)).toBe(orgColorForId('div-production', known))
    })

    test('honours a pick on the first value', () => {
        expect(orgGroupColor(['div-production'], known, {'div-production': 'propColorBlue'})).toBe('propColorBlue')
    })

    test('leaves the "no value" group uncoloured', () => {
        // That group is not an organisation unit, so colouring it would suggest
        // it is one.
        expect(orgGroupColor([], known)).toBe('')
    })

    test('ignores empty entries the group key leaves behind', () => {
        // Group keys arrive comma joined, so splitting an empty one yields ['']
        expect(orgGroupColor([''], known)).toBe('')
    })
})
