// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IPropertyTemplate} from './blocks/board'
import {Card} from './blocks/card'

import {getGroupOptionIDForCard, getVisibleAndHiddenGroups} from './boardUtils'

// Grouping routes on the property registry's capabilities rather than on type
// names, which is what lets the organisation types work without their own
// branch. These cases pin that down — both that the existing types keep their
// paths and that the new ones land on the multi-value path.
describe('boardUtils grouping', () => {
    const template = (type: string): IPropertyTemplate => ({
        id: 'p-1',
        name: 'prop',
        type,
        options: [],
    } as IPropertyTemplate)

    const cardWith = (value: string | string[]): Card => ({
        id: 'card-1',
        fields: {properties: {'p-1': value}},
    } as unknown as Card)

    describe('getGroupOptionIDForCard', () => {
        test('sorts and joins the values of a multi-value property', () => {
            expect(getGroupOptionIDForCard(cardWith(['b', 'a']), template('multiSelect'))).toBe('a,b')
        })

        test('treats an organisation property the same way', () => {
            // Same key shape as multiSelect, so two cards naming the same units
            // in a different order land in one group.
            expect(getGroupOptionIDForCard(cardWith(['div-b', 'div-a']), template('orgDivision'))).toBe('div-a,div-b')
            expect(getGroupOptionIDForCard(cardWith(['dep-b', 'dep-a']), template('orgDepartment'))).toBe('dep-a,dep-b')
        })

        test('keeps a single-value property as a bare value', () => {
            expect(getGroupOptionIDForCard(cardWith('opt-1'), template('select'))).toBe('opt-1')
        })

        test('is empty when the property has no value', () => {
            expect(getGroupOptionIDForCard(cardWith([]), template('orgDivision'))).toBe('')
        })
    })

    describe('getVisibleAndHiddenGroups', () => {
        test('groups organisation cards by their value set', () => {
            const cards = [
                {id: 'c1', fields: {properties: {'p-1': ['div-a']}}},
                {id: 'c2', fields: {properties: {'p-1': ['div-a']}}},
                {id: 'c3', fields: {properties: {'p-1': ['div-b']}}},
            ] as unknown as Card[]

            const {visible} = getVisibleAndHiddenGroups(cards, [], [], template('orgDivision'))
            const byKey = new Map(visible.map((group) => [group.option.id, group.cards.length]))

            expect(byKey.get('div-a')).toBe(2)
            expect(byKey.get('div-b')).toBe(1)
        })

        test('a card naming several units forms its own group, as multiSelect does', () => {
            // Matching multiSelect rather than multiPerson is deliberate: the
            // existing multi-value behaviour is what the spec says to follow.
            const cards = [
                {id: 'c1', fields: {properties: {'p-1': ['div-a', 'div-b']}}},
                {id: 'c2', fields: {properties: {'p-1': ['div-a']}}},
            ] as unknown as Card[]

            const {visible} = getVisibleAndHiddenGroups(cards, [], [], template('orgDivision'))
            const keys = visible.map((group) => group.option.id).sort()

            expect(keys).toContain('div-a')
            expect(keys).toContain('div-a,div-b')
        })

        test('multiPerson still takes the person path, not the multi-select one', () => {
            // isPersonLike and isMultiValue are both true for multiPerson. Split
            // on the wrong one and its group labels stop resolving to names.
            const cards = [
                {id: 'c1', fields: {properties: {'p-1': ['user-b', 'user-a']}}},
            ] as unknown as Card[]

            const {visible} = getVisibleAndHiddenGroups(cards, [], [], template('multiPerson'))

            expect(visible.map((group) => group.option.id)).toEqual(['user-a,user-b'])
        })

        test('person still takes the single-person path', () => {
            const cards = [
                {id: 'c1', fields: {properties: {'p-1': 'user-a'}}},
            ] as unknown as Card[]

            const {visible} = getVisibleAndHiddenGroups(cards, [], [], template('person'))

            expect(visible.map((group) => group.option.id)).toEqual(['user-a'])
        })
    })
})
