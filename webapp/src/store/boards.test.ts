// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TestBlockFactory} from '../test/testBlockFactory'
import {getMySortedBoards} from './boards'

describe('boards selectors', () => {
    test('getMySortedBoards includes accessible boards without direct membership', () => {
        const memberBoard = TestBlockFactory.createBoard()
        memberBoard.id = 'board-member'
        memberBoard.title = 'B Board'

        const aclBoard = TestBlockFactory.createBoard()
        aclBoard.id = 'board-acl'
        aclBoard.title = 'A Board'

        const state = {
            boards: {
                boards: {
                    [memberBoard.id]: memberBoard,
                    [aclBoard.id]: aclBoard,
                },
                myBoardMemberships: {
                    [memberBoard.id]: {boardId: memberBoard.id},
                },
            },
        } as any

        const sortedBoards = getMySortedBoards(state)
        expect(sortedBoards.map((board) => board.id)).toEqual(['board-acl', 'board-member'])
    })
})
