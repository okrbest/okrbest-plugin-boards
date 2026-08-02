// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {BoardMember} from '../blocks/board'

import {TestBlockFactory} from '../test/testBlockFactory'
import {getMySortedBoards, reducer, updateMembers} from './boards'

describe('boards members reducer', () => {
    test('updateMembers stores a member for a board that has no members entry yet', () => {
        const member = {
            boardId: 'board-1',
            userId: 'user-1',
            schemeViewer: true,
        } as BoardMember

        const state = reducer(undefined, updateMembers([member]))

        expect(state.membersInBoards['board-1']['user-1']).toEqual(member)
    })
})

describe('boards selectors', () => {
    test('getMySortedBoards includes accessible boards without direct membership', () => {
        const memberBoard = TestBlockFactory.createBoard()
        memberBoard.id = 'board-member'
        memberBoard.title = 'B Board'

        const altBoard = TestBlockFactory.createBoard()
        altBoard.id = 'board-alt'
        altBoard.title = 'A Board'

        const state = {
            boards: {
                boards: {
                    [memberBoard.id]: memberBoard,
                    [altBoard.id]: altBoard,
                },
                myBoardMemberships: {
                    [memberBoard.id]: {boardId: memberBoard.id},
                },
            },
        } as any

        const sortedBoards = getMySortedBoards(state)
        expect(sortedBoards.map((board) => board.id)).toEqual(['board-alt', 'board-member'])
    })
})
