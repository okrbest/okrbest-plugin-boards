// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TestBlockFactory} from '../../test/testBlockFactory'
import {Board} from '../../blocks/board'
import {CategoryBoards} from '../../store/sidebar'

import {
    getHiddenCategoryBoards,
    getSortedCategoryBoards,
    getVisibleCategoryBoards,
    insertVisibleBoard,
    moveVisibleBoard,
    withRecoveredBoards,
} from './categoryBoards'

const makeBoard = (id: string, isTemplate = false): Board => {
    const board = TestBlockFactory.createBoard()
    board.id = id
    board.title = id
    board.isTemplate = isTemplate
    return board
}

const makeCategory = (id: string, name: string, boardMetadata: CategoryBoards['boardMetadata']): CategoryBoards => {
    const category = TestBlockFactory.createCategoryBoards()
    category.id = id
    category.name = name
    category.boardMetadata = boardMetadata
    return category
}

describe('components/sidebar/categoryBoards', () => {
    const a = makeBoard('a')
    const b = makeBoard('b')
    const c = makeBoard('c')
    const tpl = makeBoard('tpl', true)
    const boards = [a, b, c, tpl]

    describe('withRecoveredBoards', () => {
        test('appends boards that belong to no category to the Boards category', () => {
            const custom = makeCategory('cat1', 'Custom', [{boardID: a.id, hidden: false}])
            const defaultCategory = makeCategory('cat0', 'Boards', [{boardID: b.id, hidden: false}])

            const resolved = withRecoveredBoards(defaultCategory, [custom, defaultCategory], boards)

            expect(resolved.boardMetadata).toEqual([
                {boardID: b.id, hidden: false},
                {boardID: c.id, hidden: false},
                {boardID: tpl.id, hidden: false},
            ])
        })

        test('leaves other categories untouched', () => {
            const custom = makeCategory('cat1', 'Custom', [{boardID: a.id, hidden: false}])
            expect(withRecoveredBoards(custom, [custom], boards)).toBe(custom)
        })

        test('returns the same object when nothing is missing', () => {
            const defaultCategory = makeCategory('cat0', 'Boards', boards.map((board) => ({boardID: board.id, hidden: false})))
            expect(withRecoveredBoards(defaultCategory, [defaultCategory], boards)).toBe(defaultCategory)
        })
    })

    describe('getSortedCategoryBoards', () => {
        test('follows the category order and drops unknown boards', () => {
            const category = makeCategory('cat', 'Boards', [
                {boardID: c.id, hidden: false},
                {boardID: 'deleted', hidden: false},
                {boardID: a.id, hidden: true},
            ])
            expect(getSortedCategoryBoards(category, boards).map((board) => board.id)).toEqual([c.id, a.id])
        })
    })

    describe('getVisibleCategoryBoards', () => {
        test('hides hidden boards and templates', () => {
            const category = makeCategory('cat', 'Boards', [
                {boardID: a.id, hidden: true},
                {boardID: tpl.id, hidden: false},
                {boardID: b.id, hidden: false},
                {boardID: c.id, hidden: false},
            ])
            expect(getVisibleCategoryBoards(category, boards).map((board) => board.id)).toEqual([b.id, c.id])
        })
    })

    describe('moveVisibleBoard', () => {
        test('moves by visible index and keeps invisible entries after the visible ones', () => {
            const category = makeCategory('cat', 'Boards', [
                {boardID: a.id, hidden: true},
                {boardID: b.id, hidden: false},
                {boardID: 'deleted', hidden: false},
                {boardID: c.id, hidden: false},
            ])

            // 보이는 목록은 [b, c]. c를 0번으로 옮긴다.
            expect(moveVisibleBoard(category, boards, c.id, 0)).toEqual([
                {boardID: c.id, hidden: false},
                {boardID: b.id, hidden: false},
                {boardID: a.id, hidden: true},
                {boardID: 'deleted', hidden: false},
            ])
        })

        test('returns null when the board is not visible in the category', () => {
            const category = makeCategory('cat', 'Boards', [{boardID: a.id, hidden: true}])
            expect(moveVisibleBoard(category, boards, a.id, 0)).toBeNull()
            expect(moveVisibleBoard(category, boards, 'nope', 0)).toBeNull()
        })

        test('never produces holes when the index runs past the end', () => {
            const category = makeCategory('cat', 'Boards', [{boardID: a.id, hidden: false}, {boardID: b.id, hidden: false}])
            const result = moveVisibleBoard(category, boards, a.id, 5)
            expect(result).toEqual([{boardID: b.id, hidden: false}, {boardID: a.id, hidden: false}])
        })
    })

    describe('insertVisibleBoard', () => {
        test('inserts at the visible index and keeps invisible entries after', () => {
            const category = makeCategory('cat', 'Custom', [
                {boardID: a.id, hidden: true},
                {boardID: b.id, hidden: false},
            ])
            expect(insertVisibleBoard(category, boards, {boardID: c.id, hidden: false}, 0)).toEqual([
                {boardID: c.id, hidden: false},
                {boardID: b.id, hidden: false},
                {boardID: a.id, hidden: true},
            ])
        })
    })
    describe('getHiddenCategoryBoards', () => {
        test('lists hidden boards in category order, skipping unknown boards and templates', () => {
            const category = makeCategory('cat', 'Boards', [
                {boardID: c.id, hidden: true},
                {boardID: 'deleted', hidden: true},
                {boardID: b.id, hidden: false},
                {boardID: tpl.id, hidden: true},
                {boardID: a.id, hidden: true},
            ])
            expect(getHiddenCategoryBoards(category, boards).map((board) => board.id)).toEqual([c.id, a.id])
        })

        test('returns an empty list when nothing is hidden', () => {
            const category = makeCategory('cat', 'Boards', [
                {boardID: a.id, hidden: false},
                {boardID: b.id, hidden: false},
            ])
            expect(getHiddenCategoryBoards(category, boards)).toEqual([])
        })
    })
})
