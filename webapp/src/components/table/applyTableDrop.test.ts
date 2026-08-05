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
