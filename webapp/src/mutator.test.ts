// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import mutator from './mutator'
import store from './store'
import {removeBoardUsersById} from './store/users'
import {updateBoards} from './store/boards'
import {fetchOrgMaster} from './store/orgMaster'
import {BoardMember, IPropertyTemplate, OrgUnit} from './blocks/board'
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

// Changing 본부 has to tidy the 부서 values it invalidates, and do it in the
// same write. Two writes would persist a card that names a 부서 outside its
// 본부, and would make undo a two step affair (FR-016, FR-017, SC-004).
describe('Mutator organisation narrowing', () => {
    const teamId = 'team-1'

    const orgUnits: OrgUnit[] = [
        {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
        {id: 'div-admin', name: '관리본부', type: 'division', parentId: ''},
        {id: 'dep-production', name: '생산팀', type: 'department', parentId: 'div-production'},
        {id: 'dep-finance', name: '재경전산팀', type: 'department', parentId: 'div-admin'},
    ]

    const setupBoard = () => {
        store.dispatch(fetchOrgMaster.fulfilled(
            {teamId, orgUnits, duties: [], orgProfiles: []},
            'test-request',
            teamId,
        ))

        const board = TestBlockFactory.createBoard()
        board.teamId = teamId
        board.cardProperties = [
            {id: 'p-div', name: '본부', type: 'orgDivision', options: []},
            {id: 'p-dep', name: '부서', type: 'orgDepartment', options: []},
            {id: 'p-person', name: '담당자', type: 'multiPerson', options: []},
        ] as IPropertyTemplate[]

        const card = TestBlockFactory.createCard(board)
        card.fields.properties = {
            'p-div': ['div-admin'],
            'p-dep': ['dep-finance'],
            'p-person': ['user-finance'],
        }

        store.dispatch(updateBoards([board]))
        return {board, card}
    }

    // FetchMock.fn is declared with no parameters, so its recorded calls come
    // back untyped; the cast is what lets a test read the request it made.
    const patchCalls = (): RequestInit[] =>
        (FetchMock.fn.mock.calls as unknown as Array<[string, RequestInit]>).
            map(([, init]) => init).
            filter((init) => init?.method === 'PATCH')

    const patchBody = () => {
        const calls = patchCalls()
        if (calls.length === 0) {
            throw new Error('no PATCH request was made')
        }
        return JSON.parse(calls[0].body as string)
    }

    test('clears a 부서 that the new 본부 does not contain (FR-016)', async () => {
        const {board, card} = setupBoard()

        await mutator.changePropertyValue(board.id, card, 'p-div', ['div-production'])

        const patch = patchBody()
        expect(patch).toBeDefined()
        expect(patch.updatedFields.properties['p-div']).toEqual(['div-production'])
        expect(patch.updatedFields.properties['p-dep']).toEqual([])
    })

    test('keeps a 부서 that the new 본부 does contain', async () => {
        const {board, card} = setupBoard()
        card.fields.properties['p-dep'] = ['dep-finance', 'dep-production']

        await mutator.changePropertyValue(board.id, card, 'p-div', ['div-production'])

        expect(patchBody().updatedFields.properties['p-dep']).toEqual(['dep-production'])
    })

    test('sends 본부 and 부서 in one patch so undo is one step (FR-017)', async () => {
        const {board, card} = setupBoard()

        await mutator.changePropertyValue(board.id, card, 'p-div', ['div-production'])

        expect(patchCalls()).toHaveLength(1)
    })

    test('leaves the assignee alone (FR-018)', async () => {
        // Someone whose 본부 changed is still the person doing the work. Only
        // 부서 is derived from 본부; the assignee is a separate decision.
        const {board, card} = setupBoard()

        await mutator.changePropertyValue(board.id, card, 'p-div', ['div-production'])

        expect(patchBody().updatedFields.properties['p-person']).toEqual(['user-finance'])
    })

    test('clearing 본부 leaves every 부서 in place (FR-008)', async () => {
        // No 본부 means "not narrowed", not "nothing qualifies".
        const {board, card} = setupBoard()

        await mutator.changePropertyValue(board.id, card, 'p-div', [])

        expect(patchBody().updatedFields.properties['p-dep']).toEqual(['dep-finance'])
    })

    test('changing a 부서 does not touch anything else', async () => {
        // The tidy-up hangs off 본부 only. Editing 부서 itself must not start
        // rewriting the card's other organisation values.
        const {board, card} = setupBoard()

        await mutator.changePropertyValue(board.id, card, 'p-dep', [])

        const properties = patchBody().updatedFields.properties
        expect(properties['p-div']).toEqual(['div-admin'])
        expect(properties['p-person']).toEqual(['user-finance'])
    })
})
