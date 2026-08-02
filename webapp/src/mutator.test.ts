// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import mutator from './mutator'
import store from './store'
import {removeBoardUsersById} from './store/users'
import {BoardMember} from './blocks/board'
import {IUser} from './user'
import {TestBlockFactory} from './test/testBlockFactory'
import 'isomorphic-fetch'
import {FetchMock} from './test/fetchMock'
import {mockDOM} from './testUtils'

global.fetch = FetchMock.fn

beforeEach(() => {
    FetchMock.fn.mockReset()
})

beforeAll(() => {
    mockDOM()
})

describe('Mutator', () => {
    test('changePropertyValue', async () => {
        const board = TestBlockFactory.createBoard()
        const card = TestBlockFactory.createCard()
        card.boardId = board.id
        card.fields.properties.property_1 = 'hello'

        await mutator.changePropertyValue(board.id, card, 'property_1', 'hello')

        // No API call should be made as property value DIDN'T CHANGE
        expect(FetchMock.fn).toBeCalledTimes(0)

        await mutator.changePropertyValue(board.id, card, 'property_1', 'hello world')

        // 1 API call should be made as property value DID CHANGE
        expect(FetchMock.fn).toBeCalledTimes(1)
    })

    test('duplicateCard', async () => {
        const board = TestBlockFactory.createBoard()
        const card = TestBlockFactory.createCard(board)

        FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify([card])))
        const [newBlocks, newCardID] = await mutator.duplicateCard(card.id, board.id)

        expect(newBlocks).toHaveLength(1)

        const duplicatedCard = newBlocks[0]
        expect(duplicatedCard.type).toBe('card')
        expect(duplicatedCard.id).toBe(newCardID)
        expect(duplicatedCard.fields.icon).toBe(card.fields.icon)
        expect(duplicatedCard.fields.contentOrder?.length ?? 0).toBe(card.fields.contentOrder?.length ?? 0)
        expect(duplicatedCard.boardId).toBe(board.id)
    })
})

describe('Mutator board members', () => {
    const boardId = 'board-members-1'
    const user = {id: 'user-1', username: 'auser'} as IUser

    beforeEach(() => {
        store.dispatch(removeBoardUsersById([user.id]))
    })

    test('createBoardMember stores the created member in the board members state', async () => {
        const created = {boardId, userId: user.id, schemeViewer: true} as BoardMember
        FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(created)))

        await mutator.createBoardMember({boardId, userId: user.id} as BoardMember, user)

        expect(store.getState().boards.membersInBoards[boardId][user.id]).toEqual(created)
    })

    test('createBoardMember adds the user to the board users list', async () => {
        const created = {boardId, userId: user.id, schemeViewer: true} as BoardMember
        FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(created)))

        await mutator.createBoardMember({boardId, userId: user.id} as BoardMember, user)

        expect(store.getState().users.boardUsers[user.id]).toEqual(user)
    })

    test('createBoardMember leaves state untouched when the request fails', async () => {
        FetchMock.fn.mockReturnValueOnce(Promise.resolve(new Response('', {status: 403})))

        await mutator.createBoardMember({boardId, userId: user.id} as BoardMember, user)

        expect(store.getState().users.boardUsers[user.id]).toBeUndefined()
    })

    test('updateBoardMember stores the new role in the board members state', async () => {
        const oldMember = {boardId, userId: user.id, schemeViewer: true} as BoardMember
        const newMember = {boardId, userId: user.id, schemeEditor: true} as BoardMember
        FetchMock.fn.mockReturnValueOnce(Promise.resolve(new Response('', {status: 200})))

        await mutator.updateBoardMember(newMember, oldMember)

        expect(store.getState().boards.membersInBoards[boardId][user.id]).toEqual(newMember)
    })
})
