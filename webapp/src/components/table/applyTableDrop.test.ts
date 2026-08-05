// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {mocked} from 'jest-mock'

import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import Mutator from '../../mutator'
import {sendFlashMessage} from '../flashMessages'

import {applyTableDrop} from './applyTableDrop'
import {DragItem, DropIntent, RowMetric} from './tableDropTarget'

jest.mock('../../mutator')
jest.mock('../flashMessages')

const mockedMutator = mocked(Mutator, true)
const mockedFlash = mocked(sendFlashMessage)

const board = {id: 'board-1'} as Board

const view = {
    id: 'view-1',
    fields: {cardOrder: ['a', 'b', 'c']},
} as BoardView

const card = (id: string): Card => ({id} as Card)

const rows: RowMetric[] = [
    {cardId: 'a', depth: 0, parentCardId: '', top: 0, height: 44},
    {cardId: 'b', depth: 0, parentCardId: '', top: 44, height: 44},
    {cardId: 'c', depth: 0, parentCardId: '', top: 88, height: 44},
]

const item = (over: Partial<DragItem> = {}): DragItem => ({
    cardId: 'a',
    subtreeIds: ['a'],
    subtreeHeight: 0,
    sourceParentId: '',
    sourceDepth: 0,
    selectedCardIds: [],
    ...over,
})

const intent = (over: Partial<DropIntent> = {}): DropIntent => ({
    boundaryIndex: 3,
    depth: 0,
    parentCardId: '',
    anchorTop: 132,
    indentOffsetPx: 0,
    ...over,
})

const run = (over: {item?: DragItem, intent?: DropIntent, subCardsByParent?: {[k: string]: Card[]}} = {}) =>
    applyTableDrop({
        intent: over.intent ?? intent(),
        item: over.item ?? item(),
        board,
        activeView: view,
        allCards: [card('a'), card('b'), card('c')],
        rows,
        subCardsByParent: over.subCardsByParent ?? {},
        failureMessage: '옮기지 못했습니다',
    })

describe('applyTableDrop', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockedMutator.performAsUndoGroup.mockImplementation(async (actions) => {
            await actions()
        })
    })

    test('부모가 그대로면 계층 API를 호출하지 않는다', async () => {
        await run()

        expect(mockedMutator.linkCardAsSubCard).not.toBeCalled()
        expect(mockedMutator.unlinkSubCard).not.toBeCalled()
        expect(mockedMutator.changeViewCardOrder).toBeCalledTimes(1)
    })

    // FR-028. 순서·계층·그룹이 한 번의 되돌리기로 돌아와야 한다.
    test('되돌리기 그룹을 한 번만 연다', async () => {
        await run()

        expect(mockedMutator.performAsUndoGroup).toBeCalledTimes(1)
    })

    test('경계 아래 행 앞에 놓는다', async () => {
        await run({intent: intent({boundaryIndex: 2, anchorTop: 88})})

        const newOrder = mockedMutator.changeViewCardOrder.mock.calls[0][3]
        expect(newOrder).toEqual(['b', 'a', 'c'])
    })

    test('목록 맨 끝이면 마지막 행 뒤에 놓는다', async () => {
        await run()

        const newOrder = mockedMutator.changeViewCardOrder.mock.calls[0][3]
        expect(newOrder).toEqual(['b', 'c', 'a'])
    })

    // FR-017. 서브트리는 연속 구간으로 움직인다.
    test('서브트리를 통째로 옮긴다', async () => {
        await applyTableDrop({
            intent: intent({boundaryIndex: 3}),
            item: item({cardId: 'a', subtreeIds: ['a', 'a1']}),
            board,
            activeView: {id: 'view-1', fields: {cardOrder: ['a', 'a1', 'b', 'c']}} as BoardView,
            allCards: [card('a'), card('a1'), card('b'), card('c')],
            rows,
            subCardsByParent: {},
            failureMessage: '옮기지 못했습니다',
        })

        expect(mockedMutator.changeViewCardOrder.mock.calls[0][3]).toEqual(['b', 'c', 'a', 'a1'])
    })

    // FR-031. 드롭 핸들러를 갈아끼우면서 잃기 쉬운 기존 동작이다.
    test('여러 카드를 선택했으면 각자의 서브트리와 함께 전부 옮긴다', async () => {
        await applyTableDrop({
            intent: intent({boundaryIndex: 0, anchorTop: 0}),
            item: item({cardId: 'b', subtreeIds: ['b'], selectedCardIds: ['b', 'c']}),
            board,
            activeView: {id: 'view-1', fields: {cardOrder: ['a', 'b', 'c', 'c1']}} as BoardView,
            allCards: [card('a'), card('b'), card('c'), card('c1')],
            rows,
            subCardsByParent: {c: [card('c1')]},
            failureMessage: '옮기지 못했습니다',
        })

        expect(mockedMutator.changeViewCardOrder.mock.calls[0][3]).toEqual(['b', 'c', 'c1', 'a'])
    })

    // FR-014. 최상위 → 하위
    test('부모가 생기면 하위 카드로 연결한다', async () => {
        await run({intent: intent({boundaryIndex: 2, parentCardId: 'b', depth: 1})})

        expect(mockedMutator.linkCardAsSubCard).toBeCalledWith('a', 'b')
        expect(mockedMutator.unlinkSubCard).not.toBeCalled()
    })

    // FR-015. 하위 → 최상위
    test('부모가 없어지면 최상위로 분리한다', async () => {
        await run({
            item: item({sourceParentId: 'b'}),
            intent: intent({parentCardId: ''}),
        })

        expect(mockedMutator.unlinkSubCard).toBeCalledWith('a', 'b')
        expect(mockedMutator.linkCardAsSubCard).not.toBeCalled()
    })

    // FR-022, FR-023. 새 부모의 그룹 값을 따라가되 자손은 건드리지 않는다.
    test('다른 그룹의 하위로 가면 끄는 카드만 그룹 값을 바꾼다', async () => {
        await applyTableDrop({
            intent: intent({boundaryIndex: 2, parentCardId: 'b', depth: 1}),
            item: item({cardId: 'a', subtreeIds: ['a', 'a1']}),
            board,
            activeView: {id: 'view-1', fields: {cardOrder: ['a', 'a1', 'b', 'c'], groupById: 'gp'}} as unknown as BoardView,
            allCards: [
                {id: 'a', fields: {properties: {gp: 'old'}}} as unknown as Card,
                {id: 'a1', fields: {properties: {gp: 'old'}}} as unknown as Card,
                {id: 'b', fields: {properties: {gp: 'new'}}} as unknown as Card,
                card('c'),
            ],
            rows,
            subCardsByParent: {},
            groupByPropertyId: 'gp',
            failureMessage: '옮기지 못했습니다',
        })

        const calls = mockedMutator.changePropertyValue.mock.calls
        expect(calls).toHaveLength(1)
        expect((calls[0][1] as Card).id).toBe('a')
        expect(calls[0][3]).toBe('new')
    })

    // 서버는 depth > 0 인 카드의 link 를 "card is already a sub-card"로 거부한다.
    // 부모를 바꾸는 것은 갈아끼우기가 아니라 떼었다 붙이기다.
    test('다른 부모로 옮길 때 먼저 떼어내고 붙인다', async () => {
        const order: string[] = []
        mockedMutator.unlinkSubCard.mockImplementation(async () => {
            order.push('unlink')
            return undefined
        })
        mockedMutator.linkCardAsSubCard.mockImplementation(async () => {
            order.push('link')
            return undefined
        })

        await run({
            item: item({sourceParentId: 'old'}),
            intent: intent({boundaryIndex: 2, parentCardId: 'b', depth: 1}),
        })

        expect(order).toEqual(['unlink', 'link'])
    })

    // FR-022. 그룹이 걸린 표에서 다른 그룹으로 순서 이동하면 그룹 값이 따라와야
    // 한다. 칸반이 그렇게 동작하고 표도 같아야 한다. 기존 onDropToGroup이 하던
    // 일인데 새 경로가 물려받지 않아 회귀였다.
    test('다른 그룹으로 순서 이동하면 그룹 값이 이웃을 따라간다', async () => {
        await applyTableDrop({
            intent: intent({boundaryIndex: 2, parentCardId: '', depth: 0}),
            item: item({cardId: 'a'}),
            board,
            activeView: {id: 'view-1', fields: {cardOrder: ['a', 'b', 'c'], groupById: 'gp'}} as unknown as BoardView,
            allCards: [
                {id: 'a', fields: {properties: {gp: 'left'}}} as unknown as Card,
                {id: 'b', fields: {properties: {gp: 'right'}}} as unknown as Card,
                {id: 'c', fields: {properties: {gp: 'right'}}} as unknown as Card,
            ],
            rows: [
                {cardId: 'a', depth: 0, parentCardId: '', top: 0, height: 44, groupValue: 'left'},
                {cardId: 'b', depth: 0, parentCardId: '', top: 44, height: 44, groupValue: 'right'},
                {cardId: 'c', depth: 0, parentCardId: '', top: 88, height: 44, groupValue: 'right'},
            ],
            subCardsByParent: {},
            groupByPropertyId: 'gp',
            failureMessage: '옮기지 못했습니다',
        })

        const calls = mockedMutator.changePropertyValue.mock.calls
        expect(calls).toHaveLength(1)
        expect((calls[0][1] as Card).id).toBe('a')
        expect(calls[0][3]).toBe('right')
    })

    // FR-029. performAsUndoGroup은 예외를 삼키므로 try/catch가 콜백 안쪽에
    // 있어야 한다. 바깥에 두면 이 테스트가 실패한다.
    test('서버가 거부하면 사용자에게 알린다', async () => {
        mockedMutator.changeViewCardOrder.mockRejectedValueOnce(new Error('거부'))
        mockedMutator.performAsUndoGroup.mockImplementation(async (actions) => {
            try {
                await actions()
            } catch {
                // 실제 구현과 같이 삼킨다
            }
        })

        await run()

        expect(mockedFlash).toBeCalledWith(expect.objectContaining({severity: 'high'}))
    })
})
