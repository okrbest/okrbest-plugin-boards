// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Card} from '../../blocks/card'

export type Subtree = {

    // 부모가 맨 앞, 이어서 깊이우선 자손. 이 순서가 곧 cardOrder에 끼워 넣을
    // 순서이고, 그래서 자손의 상대적 계층이 유지된다 (FR-017).
    subtreeIds: string[]

    // 이 카드 아래로 몇 단이 더 있는가. 자손이 없으면 0.
    // 드롭 가능한 깊이 상한이 maxDepth - subtreeHeight로 줄어든다 (FR-012).
    subtreeHeight: number
}

/**
 * 카드 하나와 그 모든 자손을 모은다.
 *
 * 화면 상태(접힘 여부)를 보지 않는다. 접힌 자손도 똑같이 딸려 나오며, 이것이
 * FR-018이 요구하는 동작이다.
 *
 * 순환 참조는 서버의 LinkCardAsSubCard가 막으므로 방문 표시를 두지 않는다.
 */
export function collectSubtree(cardId: string, subCardsByParent: {[parentCardId: string]: Card[]}): Subtree {
    const subtreeIds: string[] = [cardId]
    let subtreeHeight = 0

    const walk = (parentId: string, depthBelow: number) => {
        const children = subCardsByParent[parentId]
        if (!children?.length) {
            return
        }

        if (depthBelow > subtreeHeight) {
            subtreeHeight = depthBelow
        }

        for (const child of children) {
            subtreeIds.push(child.id)
            walk(child.id, depthBelow + 1)
        }
    }

    walk(cardId, 1)

    return {subtreeIds, subtreeHeight}
}
