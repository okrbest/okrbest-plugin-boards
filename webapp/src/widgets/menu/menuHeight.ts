// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// menuHeightBelow is the height budget for a portal menu that opens below its
// anchor. The menu's list scrolls within it, so however low the anchor sits the
// last row and the scrollbar stay on screen. A floor keeps a menu opened right
// at the bottom edge from collapsing to nothing.
export function menuHeightBelow(
    anchorBottom: number,
    viewportHeight: number,
    margin = 8,
    min = 120,
): number {
    const available = viewportHeight - anchorBottom - margin
    return Math.max(min, available)
}
