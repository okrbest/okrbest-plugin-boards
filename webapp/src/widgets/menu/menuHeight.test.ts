// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {menuHeightBelow} from './menuHeight'

// A portal menu opened below its anchor must stay inside the screen, or its
// lower rows — and its own scrollbar — end up off-screen and unreachable. This
// is the budget its scrolling list gets: the room between the anchor and the
// bottom of the window.

describe('src/widgets/menu/menuHeight', () => {
    test('a high anchor gets the room down to the bottom margin', () => {
        expect(menuHeightBelow(100, 800, 8, 120)).toBe(692)
    })

    test('a low anchor never drops below the minimum', () => {
        expect(menuHeightBelow(780, 800, 8, 120)).toBe(120)
    })

    test('the margin is kept clear of the bottom edge', () => {
        expect(menuHeightBelow(200, 800, 40, 120)).toBe(560)
    })
})
