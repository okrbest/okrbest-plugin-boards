// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// A multi-value axis (속성값, 직책) can hold anything from one value to all of
// them. Listing every name in the closed control turns a full selection into an
// unreadable smear, so the label carries the state, not the contents: one name
// when it is the only one, "전체" when it is all of them, a count otherwise.
//
// The component turns this into text — the words stay there so translation does
// too. Here we only decide which of the three shapes the selection is.

export type SelectionSummary =
    | {kind: 'none'}
    | {kind: 'all'}
    | {kind: 'single'; name: string}
    | {kind: 'count'; count: number}

// A stale id — one the property no longer offers — names nothing, so it neither
// shows nor counts. Only ids the option list still knows about are summarised.
export function summarizeSelection(
    selectedIds: string[],
    options: Array<{id: string; name: string}>,
): SelectionSummary {
    const present = options.filter((option) => selectedIds.includes(option.id))

    if (present.length === 0) {
        return {kind: 'none'}
    }
    if (options.length > 0 && present.length === options.length) {
        return {kind: 'all'}
    }
    if (present.length === 1) {
        return {kind: 'single', name: present[0].name}
    }
    return {kind: 'count', count: present.length}
}
