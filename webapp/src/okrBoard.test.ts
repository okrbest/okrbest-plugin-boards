// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {okrBoardSettings, optionForDepth, okrPropertiesForNewCard, OKR_BOARD_KEY} from './okrBoard'

// The ladder a board follows when it is used as an OKR board.
//
// The same rule lives in Go for sub-cards, because the server is what reads the
// parent when one is made. Nothing can share the code across the two languages,
// so both sides are held to the same table — server/model/okr_board_test.go is
// the other half of this file.
describe('okrBoard — settings', () => {
    test('a board that was never switched on has no settings', () => {
        expect(okrBoardSettings(undefined)).toBeUndefined()
        expect(okrBoardSettings({})).toBeUndefined()
    })

    test('reads what a board stored', () => {
        const settings = okrBoardSettings({
            [OKR_BOARD_KEY]: {propertyId: 'prop-type', levels: ['opt-objective', 'opt-key-result', 'opt-task']},
        })

        expect(settings).toEqual({propertyId: 'prop-type', levels: ['opt-objective', 'opt-key-result', 'opt-task']})
    })

    test('leaves keys other features own alone', () => {
        const settings = okrBoardSettings({
            propertyAccess: {enabled: true},
            [OKR_BOARD_KEY]: {propertyId: 'prop-type', levels: ['opt-objective']},
        })

        expect(settings?.propertyId).toBe('prop-type')
    })

    test('ignores a stored value that is not a settings object', () => {
        // board.properties is free form JSON shared with other features, so a
        // hand edit or an older client can leave anything here.
        expect(okrBoardSettings({[OKR_BOARD_KEY]: 'on'})).toBeUndefined()
        expect(okrBoardSettings({[OKR_BOARD_KEY]: {propertyId: 'prop-type'}})).toBeUndefined()
        expect(okrBoardSettings({[OKR_BOARD_KEY]: {levels: ['a']}})).toBeUndefined()
        expect(okrBoardSettings({[OKR_BOARD_KEY]: {propertyId: 'prop-type', levels: 'a'}})).toBeUndefined()
    })

    test('drops levels that are not strings rather than shifting the ladder', () => {
        // A rung index that silently moves would put a Tasks card at 2단계.
        expect(okrBoardSettings({[OKR_BOARD_KEY]: {propertyId: 'p', levels: ['a', 7, 'c']}})).toBeUndefined()
    })
})

describe('okrBoard — optionForDepth', () => {
    const settings = {propertyId: 'prop-type', levels: ['opt-objective', 'opt-key-result', 'opt-task']}

    test('each depth takes its own level', () => {
        expect(optionForDepth(settings, 0)).toBe('opt-objective')
        expect(optionForDepth(settings, 1)).toBe('opt-key-result')
        expect(optionForDepth(settings, 2)).toBe('opt-task')
    })

    test('past the end takes the last level', () => {
        // 3단계 and deeper share one value, so the shape does not have to know
        // how deep cards are allowed to go.
        expect(optionForDepth(settings, 3)).toBe('opt-task')
        expect(optionForDepth(settings, 4)).toBe('opt-task')
    })

    test('a negative depth is not a level', () => {
        expect(optionForDepth(settings, -1)).toBe('')
    })

    test('no settings fill nothing', () => {
        expect(optionForDepth(undefined, 0)).toBe('')
    })
})

// What the browser puts on a card it is about to create. Sub-cards are the
// server's business — sending properties with one would make the server skip the
// parent inheritance a sub-card depends on (008 research R4).
describe('okrBoard — okrPropertiesForNewCard', () => {
    const settings = {propertyId: 'p-type', levels: ['opt-objective', 'opt-key-result', 'opt-task']}
    const properties = {[OKR_BOARD_KEY]: settings}

    test('a board that was never switched on gets nothing', () => {
        expect(okrPropertiesForNewCard({}, 0, {})).toEqual({})
    })

    test('a card at the top starts on the first rung', () => {
        expect(okrPropertiesForNewCard(properties, 0, {})).toEqual({'p-type': 'opt-objective'})
    })

    test('depth decides the rung, not the way the card was made', () => {
        // A template made from a 3단계 card carries that depth, so a card made
        // from it is a Tasks card (FR-006a).
        expect(okrPropertiesForNewCard(properties, 2, {})).toEqual({'p-type': 'opt-task'})
        expect(okrPropertiesForNewCard(properties, 4, {})).toEqual({'p-type': 'opt-task'})
    })

    test('a value already decided wins', () => {
        // A filter, a group or a template that names the rung is an explicit
        // choice; the fill is only a starting value (FR-009).
        expect(okrPropertiesForNewCard(properties, 0, {'p-type': 'opt-key-result'})).toEqual({})
    })

    test('an empty existing value is not a decision', () => {
        expect(okrPropertiesForNewCard(properties, 0, {'p-type': ''})).toEqual({'p-type': 'opt-objective'})
    })

    test('leaves other properties alone', () => {
        expect(okrPropertiesForNewCard(properties, 1, {'p-div': 'div-1'})).toEqual({'p-type': 'opt-key-result'})
    })
})
