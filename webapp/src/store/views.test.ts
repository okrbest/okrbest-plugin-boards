// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TestBlockFactory} from '../test/testBlockFactory'
import {ViewAccessMode} from '../viewAccess'

import {getCurrentBoardViews, getSortedViews, getViewsByBoard} from './views'

import {RootState} from './index'

// The server never sends another person's private view, so these selectors
// filtering it again is a second line of defence
// (specs/022-view-permission/contracts/private-view-filter.md F4, W-13).
describe('store/views private view filter', () => {
    const board = TestBlockFactory.createBoard()

    const makeView = (id: string, title: string, createdBy: string, mode?: ViewAccessMode) => {
        const view = TestBlockFactory.createBoardView(board)
        view.id = id
        view.title = title
        view.parentId = board.id
        view.createdBy = createdBy
        if (mode) {
            view.fields.accessMode = mode
        }
        return view
    }

    const alicePrivate = makeView('view-alice', 'A alice private', 'alice', 'private')
    const shared = makeView('view-shared', 'B shared', 'alice')
    const bobPrivate = makeView('view-bob', 'C bob private', 'bob', 'private')

    const stateFor = (meId: string | null): RootState => ({
        boards: {current: board.id, boards: {[board.id]: board}, templates: {}, myBoardMemberships: {}},
        views: {current: '', views: {[alicePrivate.id]: alicePrivate, [shared.id]: shared, [bobPrivate.id]: bobPrivate}},
        users: {me: meId ? {id: meId, username: meId, props: {}} : null},
    } as unknown as RootState)

    const ids = (views: Array<{id: string}>) => views.map((v) => v.id)

    test('W-13 bob sees the shared view and his own private view only', () => {
        const state = stateFor('bob')
        expect(ids(getCurrentBoardViews(state))).toEqual(['view-shared', 'view-bob'])
        expect(ids(getSortedViews(state))).toEqual(['view-shared', 'view-bob'])
        expect(ids(getViewsByBoard(state)[board.id])).toEqual(['view-shared', 'view-bob'])
    })

    test('alice keeps her private view', () => {
        const state = stateFor('alice')
        expect(ids(getCurrentBoardViews(state))).toEqual(['view-alice', 'view-shared'])
    })

    test('without a signed-in user nothing is filtered', () => {
        const state = stateFor(null)
        expect(ids(getCurrentBoardViews(state))).toEqual(['view-alice', 'view-shared', 'view-bob'])
    })
})
