// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Card} from '../../blocks/card'

import {collectSubtree} from './subtree'

// 하위 카드 맵만 세운다. 수집 함수는 펼침 상태도 화면도 모른다.
const byParent = (pairs: {[parentId: string]: string[]}): {[parentId: string]: Card[]} => {
    const map: {[parentId: string]: Card[]} = {}
    for (const [parentId, childIds] of Object.entries(pairs)) {
        map[parentId] = childIds.map((id) => ({id} as Card))
    }
    return map
}

describe('collectSubtree', () => {
    test('자손이 없으면 자기 자신만, 높이는 0', () => {
        const result = collectSubtree('a', byParent({}))

        expect(result.subtreeIds).toEqual(['a'])
        expect(result.subtreeHeight).toBe(0)
    })

    test('1단 자손을 부모 다음에 놓고 높이는 1', () => {
        const result = collectSubtree('a', byParent({a: ['b', 'c']}))

        expect(result.subtreeIds).toEqual(['a', 'b', 'c'])
        expect(result.subtreeHeight).toBe(1)
    })

    test('3단은 깊이우선 순서로 펼쳐지고 높이는 3', () => {
        const result = collectSubtree('a', byParent({a: ['b'], b: ['c'], c: ['d']}))

        expect(result.subtreeIds).toEqual(['a', 'b', 'c', 'd'])
        expect(result.subtreeHeight).toBe(3)
    })

    // 부모 바로 뒤에 그 부모의 자손이 이어져야 cardOrder에서 연속 구간이 된다.
    test('형제가 여럿이면 각자의 자손이 자기 뒤에 붙는다', () => {
        const result = collectSubtree('a', byParent({a: ['b', 'e'], b: ['c', 'd'], e: ['f']}))

        expect(result.subtreeIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
        expect(result.subtreeHeight).toBe(2)
    })

    // FR-018. 접힘은 화면 상태이고 수집 함수는 그걸 모른다. 접힌 자손도
    // 똑같이 딸려 나온다는 것을 여기서 못 박는다.
    test('접힘 여부와 무관하게 모든 자손이 포함된다', () => {
        const map = byParent({a: ['b'], b: ['c']})

        // 화면에서 b가 접혀 있든 말든 입력은 같다.
        expect(collectSubtree('a', map).subtreeIds).toEqual(['a', 'b', 'c'])
    })

    test('맵에 없는 카드도 자기 자신은 돌려준다', () => {
        expect(collectSubtree('ghost', byParent({a: ['b']})).subtreeIds).toEqual(['ghost'])
    })
})
