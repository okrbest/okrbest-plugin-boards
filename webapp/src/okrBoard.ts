// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {OkrBoardSettings} from './blocks/board'

// The ladder a board follows when it is used as an OKR board.
//
// The same rule also lives in Go (server/model/okr_board.go). Sub-cards are made
// by the server, which is the only side that can read the parent without
// breaking the property inheritance a sub-card depends on, so the two languages
// each carry a copy. Both are held to the same table of cases; the tests beside
// each are what keep them from drifting.

// Where a board keeps the settings. propertyAccess and orgColors already live
// beside it under board.properties.
export const OKR_BOARD_KEY = 'okrBoard'

// The settings a board stored, or undefined when it was never switched on.
//
// Anything that is not a usable settings object is treated as "never switched
// on" rather than passed through: board.properties is free form JSON that other
// features write to as well, and a half read ladder would put cards on the wrong
// rung — worse than putting them on none.
export function okrBoardSettings(properties?: Record<string, unknown>): OkrBoardSettings | undefined {
    const stored = properties?.[OKR_BOARD_KEY]
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return undefined
    }

    const {propertyId, levels} = stored as {propertyId?: unknown, levels?: unknown}
    if (typeof propertyId !== 'string' || !propertyId || !Array.isArray(levels)) {
        return undefined
    }

    // One bad entry discards the whole ladder rather than being skipped:
    // dropping a rung would shift every rung below it, which puts a Tasks card
    // at 2단계 without anything looking wrong.
    if (!levels.every((level) => typeof level === 'string' && level)) {
        return undefined
    }

    return {propertyId, levels}
}

// The option a card at this depth starts with.
//
// An empty string means "fill nothing" and covers every way this comes up
// empty: a board that was never switched on, and a depth that is not a rung.
export function optionForDepth(settings: OkrBoardSettings | undefined, depth: number): string {
    if (!settings || depth < 0 || settings.levels.length === 0) {
        return ''
    }

    if (depth >= settings.levels.length) {
        return settings.levels[settings.levels.length - 1]
    }
    return settings.levels[depth]
}

// What to put on a card the browser is about to create.
//
// Returns an empty object whenever there is nothing to add, so callers can spread
// it unconditionally.
//
// Sub-cards do not come through here. The server makes those, and sending it any
// property at all would make it skip the block that copies the parent's — 본부 and
// 부서 would stop reaching sub-cards (008 research R4).
export function okrPropertiesForNewCard(
    boardProperties: Record<string, unknown> | undefined,
    depth: number,
    decided: Record<string, string | string[]>,
): Record<string, string> {
    const settings = okrBoardSettings(boardProperties)
    if (!settings) {
        return {}
    }

    // A filter, a group or a template that already named the rung said so on
    // purpose. The fill is a starting value, not a rule (FR-009).
    const existing = decided[settings.propertyId]
    if (existing && existing.length > 0) {
        return {}
    }

    const option = optionForDepth(settings, depth)
    if (!option) {
        return {}
    }

    return {[settings.propertyId]: option}
}

// The property this feature looks for when it is switched on, and the names it
// gives the rungs.
//
// Neither is translated. The name is how a board that was set up by hand is
// recognised, and a user who switches the display language would otherwise find
// the ladder stops working on boards they already built.
export const OKR_TYPE_PROPERTY_NAME = '유형'

export const OKR_LEVEL_NAMES = ['Objective', 'Key Results', 'Tasks']
