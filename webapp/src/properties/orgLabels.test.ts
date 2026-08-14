// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {NamedEntry, PropertyTypeEnum} from '../blocks/board'

import {orgNamesForIds, isOrgProperty} from './orgLabels'

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
