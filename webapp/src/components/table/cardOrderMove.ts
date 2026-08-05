// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

type MoveParams = {

    // 뷰가 저장하고 있는 현재 순서. 여기 없는 카드가 있을 수 있다.
    cardOrder: readonly string[]

    // 보드의 모든 카드 id. 최상위만이 아니라 하위 카드까지 포함해야 한다.
    // 최상위만 넘기면 하위 카드가 순서 목록에서 빠져 삽입 위치가 어긋난다.
    allCardIds: readonly string[]

    // 옮길 카드들. 서브트리라면 부모가 맨 앞, 이어서 깊이우선 자손.
    movingIds: readonly string[]

    // 이 카드를 기준으로 놓는다.
    destCardId: string

    // 기준 카드의 앞인가 뒤인가. 생략하면 끄는 방향으로 추정한다 —
    // 드롭 인디케이터가 없던 시절의 동작이라 그룹 헤더 드롭에만 남겨 둔다.
    // 인디케이터가 있는 경로는 경계를 알고 있으므로 반드시 명시한다.
    place?: 'before' | 'after'
}

/**
 * cardOrder에서 movingIds를 통째로 빼서 destCardId 옆에 다시 끼워 넣는다.
 *
 * 서브트리를 연속 구간으로 유지하는 것이 목적이다. movingIds가 깊이우선
 * 순서로 들어오면 그 순서 그대로 삽입되므로 자손의 상대적 계층이 보존된다.
 *
 * 아래로 끌면 대상 뒤에, 위로 끌면 대상 앞에 놓는다. 판정은 빼내기 전의
 * 위치로 한다 — 빼낸 뒤에 재면 아래로 끄는 경우 인덱스가 한 칸 당겨져
 * 대상 앞에 놓이게 된다.
 */
export function moveInCardOrder({cardOrder, allCardIds, movingIds, destCardId, place}: MoveParams): string[] {
    // 저장된 순서에 없는 카드를 뒤에 채운다. 하위 카드는 여기서 합류하는
    // 경우가 많다 — 이 시드가 최상위 카드만 담으면 하위 카드 id가 통째로
    // 빠져 splice 위치가 어긋난다.
    const seeded = Array.from(new Set([...cardOrder, ...allCardIds]))

    const moving = new Set(movingIds)

    // 경계를 아는 경로는 그대로 쓰고, 모르는 경로만 끄는 방향으로 추정한다.
    const after = place ? place === 'after' : seeded.indexOf(movingIds[0]) <= seeded.indexOf(destCardId)

    const without = seeded.filter((id) => !moving.has(id))

    let destIndex = without.indexOf(destCardId)
    if (destIndex === -1) {
        // 대상이 목록에 없으면 순서를 건드리지 않는다.
        return seeded
    }
    if (after) {
        destIndex += 1
    }

    without.splice(destIndex, 0, ...movingIds)
    return without
}
