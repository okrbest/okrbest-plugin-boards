// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Board, IPropertyTemplate, OrgUnit} from '../blocks/board'
import {Card} from '../blocks/card'

import {selectedUnitIds, allowedDepartments, displayedIds, allowedUserIds} from './orgScope'

// The four derived sets of specs/005-org-scoped-properties/data-model.md §3.
describe('store/orgScope', () => {
    const units: OrgUnit[] = [
        {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
        {id: 'div-sales', name: '영업본부', type: 'division', parentId: ''},
        {id: 'div-admin', name: '관리본부', type: 'division', parentId: ''},
        {id: 'dep-production', name: '생산팀', type: 'department', parentId: 'div-production'},
        {id: 'dep-quality', name: '품질팀', type: 'department', parentId: 'div-production'},
        {id: 'dep-sales', name: '영업팀', type: 'department', parentId: 'div-sales'},
        {id: 'dep-finance', name: '재경전산팀', type: 'department', parentId: 'div-admin'},
    ]

    const boardWith = (templates: Array<[string, string]>): Board => ({
        cardProperties: templates.map(([id, type]) => ({
            id,
            name: id,
            type,
            options: [],
        })) as IPropertyTemplate[],
    } as Board)

    const cardWith = (properties: Record<string, string | string[]>): Card => ({
        fields: {properties},
    } as unknown as Card)

    describe('selectedUnitIds', () => {
        test('collects the values of one property', () => {
            const board = boardWith([['p-div', 'orgDivision']])
            const card = cardWith({'p-div': ['div-production']})

            expect(selectedUnitIds(card, board, 'orgDivision')).toEqual(new Set(['div-production']))
        })

        test('unions several values on one property (FR-009)', () => {
            const board = boardWith([['p-div', 'orgDivision']])
            const card = cardWith({'p-div': ['div-production', 'div-admin']})

            expect(selectedUnitIds(card, board, 'orgDivision')).toEqual(new Set(['div-production', 'div-admin']))
        })

        test('unions across several properties of the same type (FR-010)', () => {
            const board = boardWith([['p-div-a', 'orgDivision'], ['p-div-b', 'orgDivision']])
            const card = cardWith({'p-div-a': ['div-production'], 'p-div-b': ['div-sales']})

            expect(selectedUnitIds(card, board, 'orgDivision')).toEqual(new Set(['div-production', 'div-sales']))
        })

        test('ignores properties of the other organisation type', () => {
            const board = boardWith([['p-div', 'orgDivision'], ['p-dep', 'orgDepartment']])
            const card = cardWith({'p-div': ['div-production'], 'p-dep': ['dep-production']})

            expect(selectedUnitIds(card, board, 'orgDivision')).toEqual(new Set(['div-production']))
            expect(selectedUnitIds(card, board, 'orgDepartment')).toEqual(new Set(['dep-production']))
        })

        test('is empty when nothing is chosen', () => {
            const board = boardWith([['p-div', 'orgDivision']])

            expect(selectedUnitIds(cardWith({}), board, 'orgDivision').size).toBe(0)
            expect(selectedUnitIds(cardWith({'p-div': []}), board, 'orgDivision').size).toBe(0)
        })

        test('tolerates a value stored as a bare string', () => {
            // Nothing writes this shape today, but property values are free form
            // JSON and a hand edited or imported card can carry one.
            const board = boardWith([['p-div', 'orgDivision']])

            expect(selectedUnitIds(cardWith({'p-div': 'div-production'}), board, 'orgDivision')).
                toEqual(new Set(['div-production']))
        })
    })

    describe('allowedDepartments', () => {
        test('offers every active department when no division is chosen (FR-008)', () => {
            const allowed = allowedDepartments(new Set<string>(), units)

            expect(allowed.map((u) => u.id)).toEqual(['dep-production', 'dep-quality', 'dep-sales', 'dep-finance'])
        })

        test('offers only the departments of the chosen division (FR-007)', () => {
            const allowed = allowedDepartments(new Set(['div-production']), units)

            expect(allowed.map((u) => u.id)).toEqual(['dep-production', 'dep-quality'])
        })

        test('unions the departments of several divisions (FR-009, FR-010)', () => {
            const allowed = allowedDepartments(new Set(['div-production', 'div-admin']), units)

            expect(allowed.map((u) => u.id)).toEqual(['dep-production', 'dep-quality', 'dep-finance'])
        })

        test('is empty when the chosen division has no departments', () => {
            const allowed = allowedDepartments(new Set(['div-empty']), units)

            expect(allowed).toEqual([])
        })
    })

    describe('displayedIds', () => {
        test('adds values already on the card that the allowed set misses (FR-015)', () => {
            const shown = displayedIds(new Set(['dep-production']), ['dep-finance'])

            expect(shown).toEqual(new Set(['dep-production', 'dep-finance']))
        })

        test('leaves the allowed set alone when the card adds nothing new', () => {
            const shown = displayedIds(new Set(['dep-production']), ['dep-production'])

            expect(shown).toEqual(new Set(['dep-production']))
        })

        test('null means do not narrow, which is not the same as an empty set', () => {
            // An empty set is "nobody qualifies"; null is "the question does not
            // apply". Collapsing them would silently empty every list.
            expect(displayedIds(null, ['dep-finance'])).toBeNull()
            expect(displayedIds(new Set<string>(), ['dep-finance'])).toEqual(new Set(['dep-finance']))
        })
    })

    describe('allowedUserIds', () => {
        const profiles = [
            {userId: 'u-prod-head', orgUnitId: 'div-production'},
            {userId: 'u-prod-lead', orgUnitId: 'dep-production'},
            {userId: 'u-quality', orgUnitId: 'dep-quality'},
            {userId: 'u-sales', orgUnitId: 'dep-sales'},
            {userId: 'u-admin-head', orgUnitId: 'div-admin'},
        ]

        test('department wins when both are named — it is the narrower scope (FR-011)', () => {
            const allowed = allowedUserIds(
                new Set(['div-production']),
                new Set(['dep-production']),
                units,
                profiles,
            )

            expect(allowed).toEqual(new Set(['u-prod-lead']))
        })

        test('a division alone also covers the people under its departments (FR-012)', () => {
            // 본부장 sit on the division, 팀장 and 팀원 on a department. Asking for
            // a division and getting only the 본부장 would be useless.
            const allowed = allowedUserIds(new Set(['div-production']), new Set(), units, profiles)

            expect(allowed).toEqual(new Set(['u-prod-head', 'u-prod-lead', 'u-quality']))
        })

        test('neither named means do not narrow, signalled by null (FR-013)', () => {
            expect(allowedUserIds(new Set(), new Set(), units, profiles)).toBeNull()
        })

        test('null and an empty set are different answers', () => {
            // "do not narrow" versus "narrowed, and nobody qualifies".
            const nobody = allowedUserIds(new Set(), new Set(['dep-empty']), units, profiles)

            expect(nobody).not.toBeNull()
            expect(nobody?.size).toBe(0)
        })

        test('users with no organisation are left out (FR-014)', () => {
            const allowed = allowedUserIds(new Set(['div-production']), new Set(), units, profiles)

            expect(allowed?.has('u-no-org')).toBe(false)
        })

        test('unions several departments', () => {
            const allowed = allowedUserIds(
                new Set(),
                new Set(['dep-production', 'dep-sales']),
                units,
                profiles,
            )

            expect(allowed).toEqual(new Set(['u-prod-lead', 'u-sales']))
        })

        test('unions several divisions with their departments', () => {
            const allowed = allowedUserIds(
                new Set(['div-production', 'div-admin']),
                new Set(),
                units,
                profiles,
            )

            expect(allowed).toEqual(new Set(['u-prod-head', 'u-prod-lead', 'u-quality', 'u-admin-head']))
        })
    })
})
