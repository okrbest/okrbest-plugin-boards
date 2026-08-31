// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TestBlockFactory} from '../test/testBlockFactory'

import {createPatchesFromBoards, createBoard, IPropertyTemplate, createPatchesFromBoardsAndBlocks} from './board'
import {createBlock} from './block'

/* eslint-disable @typescript-eslint/no-explicit-any */

const sanitizeId = (value: string): string => {
    if (!value) {
        return value
    }
    if (value === 'new-property-id' || value.startsWith('property')) {
        return value
    }
    return '[id]'
}

const sanitizeUpdatedCardProperties = (props: any[] = []): any[] => props.map((prop) => {
    const {options, id, ...rest} = prop
    const sanitizedOptions = (options || []).map((option: any) => {
        const {id: optionId, ...optionRest} = option
        return {
            ...optionRest,
            id: optionId,
        }
    })
    return {
        ...rest,
        id: sanitizeId(id),
        options: sanitizedOptions,
    }
})

const sanitizeBoardPatches = (patches: any[]): any[] => patches.map((patch) => ({
    ...patch,
    updatedCardProperties: sanitizeUpdatedCardProperties(patch.updatedCardProperties),
    deletedCardProperties: (patch.deletedCardProperties || []).map((id: string) => sanitizeId(id)),
}))

const sanitizeBoardsAndBlocksPatches = (patches: any[]): any[] => patches.map((patch) => ({
    ...patch,
    boardPatches: sanitizeBoardPatches(patch.boardPatches || []),
}))

describe('board tests', () => {
    describe('correctly generate patches from two boards', () => {
        it('should generate two empty patches for the same board', () => {
            const board = TestBlockFactory.createBoard()
            const result = createPatchesFromBoards(board, board)
            expect(sanitizeBoardPatches(result)).toMatchSnapshot()
        })

        it('should add properties on the update patch and remove them on the undo', () => {
            const board = TestBlockFactory.createBoard()
            board.properties = {
                prop1: 'val1',
                prop2: 'val2',
            }
            const oldBoard = createBoard(board)
            oldBoard.properties = {
                prop2: 'val2',
            }

            const result = createPatchesFromBoards(board, oldBoard)
            expect(sanitizeBoardPatches(result)).toMatchSnapshot()
        })

        it('should add card properties on the redo and remove them on the undo', () => {
            const board = TestBlockFactory.createBoard()
            const oldBoard = createBoard(board)
            board.cardProperties.push({
                id: 'new-property-id',
                name: 'property-name',
                type: 'select',
                options: [{
                    id: 'opt',
                    value: 'val',
                    color: 'propColorYellow',
                }],
            })

            const result = createPatchesFromBoards(board, oldBoard)
            expect(sanitizeBoardPatches(result)).toMatchSnapshot()
        })

        it('should add card properties on the redo and undo if they exists in both, but differ', () => {
            const cardProperty = {
                id: 'new-property-id',
                name: 'property-name',
                type: 'select',
                options: [{
                    id: 'opt',
                    value: 'val',
                    color: 'propColorYellow',
                }],
            } as IPropertyTemplate

            const board = TestBlockFactory.createBoard()
            const oldBoard = createBoard(board)
            board.cardProperties = [cardProperty]
            oldBoard.cardProperties = [{...cardProperty, name: 'a-different-name'}]

            const result = createPatchesFromBoards(board, oldBoard)
            expect(sanitizeBoardPatches(result)).toMatchSnapshot()
        })

        it('should add card properties on the redo and undo if they exists in both, but their options are different', () => {
            const cardProperty = {
                id: 'new-property-id',
                name: 'property-name',
                type: 'select',
                options: [{
                    id: 'opt',
                    value: 'val',
                    color: 'propColorYellow',
                }],
            } as IPropertyTemplate

            const board = TestBlockFactory.createBoard()
            const oldBoard = createBoard(board)
            board.cardProperties = [cardProperty]
            oldBoard.cardProperties = [{
                ...cardProperty,
                options: [{
                    id: 'another-opt',
                    value: 'val',
                    color: 'propColorBrown',
                }],
            }]

            const result = createPatchesFromBoards(board, oldBoard)
            expect(sanitizeBoardPatches(result)).toMatchSnapshot()
        })
    })

    describe('correctly generate patches for boards and blocks', () => {
        const board = TestBlockFactory.createBoard()
        board.id = 'test-board-id'
        const card = TestBlockFactory.createCard()
        card.id = 'test-card-id'

        it('should generate two empty patches for the same board and block', () => {
            const result = createPatchesFromBoardsAndBlocks(board, board, [card.id], [card], [card])
            expect(sanitizeBoardsAndBlocksPatches(result)).toMatchSnapshot()
        })

        it('should add fields on update and remove it in the undo', () => {
            const oldBlock = TestBlockFactory.createText(card)
            oldBlock.id = 'test-old-block-id'
            const newBlock = createBlock(oldBlock)
            newBlock.fields.newField = 'new field'

            const result = createPatchesFromBoardsAndBlocks(board, board, [newBlock.id], [newBlock], [oldBlock])
            expect(sanitizeBoardsAndBlocksPatches(result)).toMatchSnapshot()
        })
    })

    // createBoard clones card properties field by field, so a flag it does not
    // name is dropped on every save. mutator.updateBoard clones before it
    // patches, which is how the toggle would silently reset itself.
    describe('createBoard org scope flag', () => {
        it('should keep orgScoped false through a clone', () => {
            const board = TestBlockFactory.createBoard()
            board.cardProperties = [{
                id: 'property-person',
                name: 'Owner',
                type: 'person',
                options: [],
                orgScoped: false,
            }]

            const clone = createBoard(board)

            expect(clone.cardProperties[0].orgScoped).toBe(false)
        })

        it('should leave orgScoped unset when the property never had one', () => {
            const board = TestBlockFactory.createBoard()
            board.cardProperties = [{
                id: 'property-person',
                name: 'Owner',
                type: 'person',
                options: [],
            }]

            const clone = createBoard(board)

            expect(clone.cardProperties[0].orgScoped).toBeUndefined()
        })
    })
})

/* eslint-enable @typescript-eslint/no-explicit-any */
