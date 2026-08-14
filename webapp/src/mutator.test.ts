// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import mutator from './mutator'
import store from './store'
import {removeBoardUsersById} from './store/users'
import {updateBoards} from './store/boards'
import {fetchOrgMaster} from './store/orgMaster'
import {Board, BoardMember, IPropertyOption, IPropertyTemplate, OrgUnit} from './blocks/board'
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

// Colours picked for organisation values go into board.properties beside the
// access rules — never into the property's options array, which is what keeps
// organisation properties out of the card access rules (007 research R1).
describe('Mutator organisation colours', () => {
    const boardPatch = () => {
        const calls = (FetchMock.fn.mock.calls as unknown as Array<[string, RequestInit]>).
            map(([, init]) => init).
            filter((init) => init?.method === 'PATCH')
        if (calls.length === 0) {
            throw new Error('no PATCH request was made')
        }
        return JSON.parse(calls[0].body as string)
    }

    // The board is frozen once the store holds it, so anything the test needs on
    // it has to be set before the dispatch.
    const setupBoard = (properties: Board['properties'] = {}) => {
        // updateBoard reads the response status, so the patch needs one.
        FetchMock.fn.mockReturnValue(Promise.resolve(new Response('{}', {status: 200})))

        const board = TestBlockFactory.createBoard()
        board.cardProperties = [
            {id: 'p-div', name: '본부', type: 'orgDivision', options: []},
        ] as IPropertyTemplate[]
        board.properties = properties
        store.dispatch(updateBoards([board]))
        return board
    }

    test('stores a picked colour under the board', async () => {
        const board = setupBoard()

        await mutator.changeOrgUnitColor(board, 'div-production', 'propColorBlue')

        expect(boardPatch().updatedProperties.orgColors).toEqual({'div-production': 'propColorBlue'})
    })

    test('keeps colours other units already had', async () => {
        const board = setupBoard({orgColors: {'div-admin': 'propColorGreen'}})

        await mutator.changeOrgUnitColor(board, 'div-production', 'propColorBlue')

        expect(boardPatch().updatedProperties.orgColors).toEqual({
            'div-admin': 'propColorGreen',
            'div-production': 'propColorBlue',
        })
    })

    test('clearing drops the key so the automatic colour comes back', async () => {
        const board = setupBoard({orgColors: {'div-admin': 'propColorGreen', 'div-production': 'propColorBlue'}})

        await mutator.clearOrgUnitColor(board, 'div-production')

        expect(boardPatch().updatedProperties.orgColors).toEqual({'div-admin': 'propColorGreen'})
    })

    test('leaves the property options empty — the access rules depend on it', async () => {
        // An organisation property is kept out of the card access rules by its
        // options array being empty. Storing colours there would put 본부, 부서
        // and 직책 into the rule editor and break 006 FR-011.
        const board = setupBoard()

        await mutator.changeOrgUnitColor(board, 'div-production', 'propColorBlue')

        const patch = boardPatch()
        expect(patch.updatedCardProperties ?? []).toEqual([])
        expect(board.cardProperties[0].options).toEqual([])
    })

    test('leaves keys other features own alone', async () => {
        // The patch carries only what changed, so the access rules must simply
        // not be among the keys it deletes.
        const board = setupBoard({propertyAccess: {enabled: true, updatedBy: '', updatedAt: 0, rules: []}})

        await mutator.changeOrgUnitColor(board, 'div-production', 'propColorBlue')

        expect(boardPatch().deletedProperties ?? []).not.toContain('propertyAccess')
    })
})

// Turning a board into an OKR board prepares one select property and remembers
// which option means which rung. It is one board write: splitting it would make
// undo a five step affair and could persist a board with the property but no
// settings (008 research R2).
describe('Mutator OKR board mode', () => {
    const TYPE_NAME = '유형'

    const boardPatch = () => {
        const calls = (FetchMock.fn.mock.calls as unknown as Array<[string, RequestInit]>).
            map(([, init]) => init).
            filter((init) => init?.method === 'PATCH')
        if (calls.length === 0) {
            throw new Error('no PATCH request was made')
        }
        return {body: JSON.parse(calls[0].body as string), count: calls.length}
    }

    // The board is frozen once the store holds it, so the test sets everything
    // before dispatching.
    const setupBoard = (cardProperties: IPropertyTemplate[] = [], properties: Board['properties'] = {}) => {
        FetchMock.fn.mockReturnValue(Promise.resolve(new Response('{}', {status: 200})))

        const board = TestBlockFactory.createBoard()
        board.cardProperties = cardProperties
        board.properties = properties
        store.dispatch(updateBoards([board]))
        return board
    }

    test('creates the property and its three values when the board has none', async () => {
        const board = setupBoard([])

        await mutator.enableOkrBoard(board)

        const {body, count} = boardPatch()
        expect(count).toBe(1)

        const created = body.updatedCardProperties.find((p: IPropertyTemplate) => p.name === TYPE_NAME)
        expect(created.type).toBe('select')
        expect(created.options.map((o: IPropertyOption) => o.value)).toEqual(['Objective', 'Key Results', 'Tasks'])
        expect(body.updatedProperties.okrBoard.propertyId).toBe(created.id)
        expect(body.updatedProperties.okrBoard.levels).toEqual(created.options.map((o: IPropertyOption) => o.id))
    })

    test('reuses a 유형 select the board already has', async () => {
        const existing = {
            id: 'p-type',
            name: TYPE_NAME,
            type: 'select',
            options: [{id: 'opt-object', value: 'Object', color: 'propColorRed'}],
        } as IPropertyTemplate
        const board = setupBoard([existing])

        await mutator.enableOkrBoard(board)

        const {body} = boardPatch()
        const types = body.updatedCardProperties.filter((p: IPropertyTemplate) => p.name === TYPE_NAME)
        expect(types).toHaveLength(1)
        expect(body.updatedProperties.okrBoard.propertyId).toBe('p-type')
    })

    test('renames a differently named value instead of replacing it', async () => {
        // Cards store the option ID. Dropping the option and adding a new one
        // would empty every card that used it (SC-002).
        const existing = {
            id: 'p-type',
            name: TYPE_NAME,
            type: 'select',
            options: [{id: 'opt-object', value: 'Object', color: 'propColorRed'}],
        } as IPropertyTemplate
        const board = setupBoard([existing])

        await mutator.enableOkrBoard(board)

        const {body} = boardPatch()
        const type = body.updatedCardProperties.find((p: IPropertyTemplate) => p.id === 'p-type')
        expect(type.options[0].id).toBe('opt-object')
        expect(type.options[0].value).toBe('Objective')
        expect(type.options[0].color).toBe('propColorRed')
        expect(body.updatedProperties.okrBoard.levels[0]).toBe('opt-object')
    })

    test('fills only the rungs that are missing', async () => {
        const existing = {
            id: 'p-type',
            name: TYPE_NAME,
            type: 'select',
            options: [
                {id: 'opt-a', value: 'Object', color: ''},
                {id: 'opt-b', value: 'Key Results', color: ''},
            ],
        } as IPropertyTemplate
        const board = setupBoard([existing])

        await mutator.enableOkrBoard(board)

        const {body} = boardPatch()
        const type = body.updatedCardProperties.find((p: IPropertyTemplate) => p.id === 'p-type')
        expect(type.options).toHaveLength(3)
        expect(type.options[2].value).toBe('Tasks')
        expect(body.updatedProperties.okrBoard.levels).toEqual(['opt-a', 'opt-b', type.options[2].id])
    })

    test('ignores a 유형 property that is not a select', async () => {
        // A rung cannot be stored in a text or date property.
        const existing = {id: 'p-text', name: TYPE_NAME, type: 'text', options: []} as IPropertyTemplate
        const board = setupBoard([existing])

        await mutator.enableOkrBoard(board)

        const {body} = boardPatch()
        expect(body.updatedProperties.okrBoard.propertyId).not.toBe('p-text')
        expect(body.updatedCardProperties.find((p: IPropertyTemplate) => p.id === 'p-text').type).toBe('text')
    })

    test('turning it off drops the settings and leaves the property', async () => {
        const existing = {
            id: 'p-type',
            name: TYPE_NAME,
            type: 'select',
            options: [{id: 'opt-a', value: 'Objective', color: ''}],
        } as IPropertyTemplate
        const board = setupBoard([existing], {okrBoard: {propertyId: 'p-type', levels: ['opt-a']}})

        await mutator.disableOkrBoard(board)

        const {body} = boardPatch()
        expect(body.deletedProperties ?? []).toContain('okrBoard')
        expect(body.updatedCardProperties ?? []).toEqual([])
    })

    test('switching it off and on again reuses the same property and options', async () => {
        const existing = {
            id: 'p-type',
            name: TYPE_NAME,
            type: 'select',
            options: [
                {id: 'opt-a', value: 'Objective', color: ''},
                {id: 'opt-b', value: 'Key Results', color: ''},
                {id: 'opt-c', value: 'Tasks', color: ''},
            ],
        } as IPropertyTemplate
        const board = setupBoard([existing])

        await mutator.enableOkrBoard(board)

        const {body} = boardPatch()
        expect(body.updatedProperties.okrBoard.levels).toEqual(['opt-a', 'opt-b', 'opt-c'])
        expect(body.updatedCardProperties ?? []).toEqual([])
    })

    test('leaves keys other features own alone', async () => {
        const board = setupBoard([], {propertyAccess: {enabled: true, updatedBy: '', updatedAt: 0, rules: []}})

        await mutator.enableOkrBoard(board)

        expect(boardPatch().body.deletedProperties ?? []).not.toContain('propertyAccess')
    })
})
