// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {moveInCardOrder} from './cardOrderMove'

describe('moveInCardOrder', () => {
    test('아래로 끌면 대상 뒤에 놓인다', () => {
        const result = moveInCardOrder({
            cardOrder: ['a', 'b', 'c'],
            allCardIds: ['a', 'b', 'c'],
            movingIds: ['a'],
            destCardId: 'c',
        })

        expect(result).toEqual(['b', 'c', 'a'])
    })

    test('위로 끌면 대상 앞에 놓인다', () => {
        const result = moveInCardOrder({
            cardOrder: ['a', 'b', 'c'],
            allCardIds: ['a', 'b', 'c'],
            movingIds: ['c'],
            destCardId: 'a',
        })

        expect(result).toEqual(['c', 'a', 'b'])
    })

    // B1. 시드를 최상위 카드로만 채우면 하위 카드 id가 순서 목록에서 빠지고
    // 삽입 위치가 어긋난다. 보드 전체 카드로 채워야 한다.
    test('저장된 순서에 없는 하위 카드도 시드에 들어간다', () => {
        const result = moveInCardOrder({
            cardOrder: ['a', 'c'],                    // sub-a 가 빠져 있다
            allCardIds: ['a', 'sub-a', 'c'],
            movingIds: ['c'],
            destCardId: 'a',
        })

        expect(result).toContain('sub-a')
        expect(result).toEqual(['c', 'a', 'sub-a'])
    })

    // FR-017. 서브트리는 연속 구간으로 움직이고 자손의 상대 순서가 유지된다.
    test('서브트리를 통째로 옮기며 내부 순서를 유지한다', () => {
        const result = moveInCardOrder({
            cardOrder: ['p', 'p1', 'p2', 'x', 'y'],
            allCardIds: ['p', 'p1', 'p2', 'x', 'y'],
            movingIds: ['p', 'p1', 'p2'],
            destCardId: 'y',
        })

        expect(result).toEqual(['x', 'y', 'p', 'p1', 'p2'])
    })

    // FR-031. 여러 카드를 선택해 옮기면 전부 함께 간다.
    test('여러 카드를 한 덩어리로 옮긴다', () => {
        const result = moveInCardOrder({
            cardOrder: ['a', 'b', 'c', 'd'],
            allCardIds: ['a', 'b', 'c', 'd'],
            movingIds: ['a', 'c'],
            destCardId: 'd',
        })

        expect(result).toEqual(['b', 'd', 'a', 'c'])
    })

    test('대상이 목록에 없으면 순서를 건드리지 않는다', () => {
        const result = moveInCardOrder({
            cardOrder: ['a', 'b'],
            allCardIds: ['a', 'b'],
            movingIds: ['a'],
            destCardId: 'ghost',
        })

        expect(result).toEqual(['a', 'b'])
    })
})
