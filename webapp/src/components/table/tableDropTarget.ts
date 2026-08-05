// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 드롭 판정. React·Redux·DOM에 의존하지 않는 순수 계산이다.
 *
 * "여기 놓을 수 있는가"의 유일한 판정자다. null을 돌려주면 호출자는 선을 지우고
 * no-drop 커서를 준다 — 놓을 수 없는 자리는 놓을 수 있어 보이지 않는다.
 */

// 화면에 그려진 행 하나. 접힌 그룹의 행은 여기 들어오지 않는다 —
// display:none 요소는 getBoundingClientRect가 전부 0이라 경계 계산이 무너진다.
export type RowMetric = {
    cardId: string
    depth: number
    parentCardId: string

    // .Table 콘텐츠 좌표계의 상단 y
    top: number
    height: number

    // 그룹이 걸려 있을 때 이 행이 속한 그룹 값
    groupValue?: string | string[]
}

// 끌고 있는 것. 드래그 시작 시 한 번 만들어지고 끝까지 바뀌지 않는다.
export type DragItem = {
    cardId: string

    // 부모가 맨 앞, 이어서 깊이우선 자손
    subtreeIds: string[]

    // 이 카드 아래로 몇 단이 더 있는가
    subtreeHeight: number

    sourceParentId: string
    sourceDepth: number

    // 함께 선택돼 있던 카드들. 순서 이동일 때만 함께 옮긴다 (FR-031).
    selectedCardIds: string[]
}

export type DropIntent = {

    // 몇 번째 행 앞의 경계인가. 0 = 첫 행 위, rows.length = 마지막 행 아래
    boundaryIndex: number

    // 클램프를 마친 목표 깊이
    depth: number

    // 그 깊이에서의 새 부모. '' = 최상위
    parentCardId: string

    // 선을 그릴 y (.Table 콘텐츠 좌표)
    anchorTop: number

    // 선의 시작 x = depth × indentStepPx
    indentOffsetPx: number
}

export type DropTargetInput = {
    rows: readonly RowMetric[]
    cursor: {x: number, y: number}
    item: DragItem
    titleCellLeft: number
    indentStepPx: number
    maxDepth: number
}

export function computeDropIntent(input: DropTargetInput): DropIntent | null {
    const {rows, cursor, item, indentStepPx} = input

    if (rows.length === 0) {
        return null
    }

    // 1. 커서 y가 어느 행의 어느 절반에 있는지로 경계를 고른다.
    const boundaryIndex = findBoundary(rows, cursor.y)

    // 2. 서브트리 안쪽 경계만 막는다. 자기 자손 밑으로 들어가면 순환이 된다.
    //
    //    자기 자신에 인접한 경계는 막지 않는다. 깊이만 바꾸는 조작 — 하위
    //    카드를 최상위로 꺼내거나 상위 카드를 하위로 넣는 것 — 이 바로 그
    //    자리에서 일어나기 때문이다. 여기를 막으면 계층 이동 자체가 불가능해진다.
    const moving = new Set(item.subtreeIds)
    const first = rows.findIndex((row) => moving.has(row.cardId))
    if (first !== -1) {
        let last = first
        while (last + 1 < rows.length && moving.has(rows[last + 1].cardId)) {
            last++
        }
        if (boundaryIndex > first && boundaryIndex <= last) {
            return null
        }
    }

    // 이웃은 함께 움직이는 행을 건너뛰고 찾는다. 끌고 있는 카드 자신을 이웃으로
    // 삼으면 제자리 깊이 변경에서 기준이 자기 자신이 되어 버린다.
    let above: RowMetric | undefined
    for (let i = boundaryIndex - 1; i >= 0; i--) {
        if (!moving.has(rows[i].cardId)) {
            above = rows[i]
            break
        }
    }
    let below: RowMetric | undefined
    for (let i = boundaryIndex; i < rows.length; i++) {
        if (!moving.has(rows[i].cardId)) {
            below = rows[i]
            break
        }
    }

    // 3. 커서 x를 깊이 후보로 환산한다. 오른쪽으로 갈수록 깊어진다 (FR-010).
    const candidate = Math.floor((cursor.x - input.titleCellLeft) / indentStepPx)

    // 4. 허용 범위로 자른다 (FR-011, FR-012).
    //
    // 상한은 윗 행보다 한 단계 깊은 값이되, 끌고 있는 서브트리의 높이만큼
    // 줄어든다 — 자손까지 최대 깊이 안에 들어와야 한다. 하한은 아랫 행의
    // 깊이다. 그보다 얕게 놓으면 아랫 행이 부모를 잃는다.
    const upper = Math.min(
        above ? above.depth + 1 : 0,
        input.maxDepth - item.subtreeHeight,
    )
    const lower = below ? below.depth : 0

    // 어떤 깊이로도 놓을 수 없는 경계가 있다. 서버가 거부할 자리를 애초에
    // 놓을 수 있어 보이게 하지 않는다.
    if (upper < lower) {
        return null
    }

    const depth = Math.min(Math.max(candidate, lower), upper)

    return {
        boundaryIndex,
        depth,
        parentCardId: findParent(rows, boundaryIndex, depth),
        anchorTop: boundaryIndex === 0 ? rows[0].top : rows[boundaryIndex - 1].top + rows[boundaryIndex - 1].height,
        indentOffsetPx: depth * indentStepPx,
    }
}

/**
 * 커서 y가 가리키는 경계. 행의 위쪽 절반이면 그 행 앞, 아래쪽 절반이면 뒤다.
 */
function findBoundary(rows: readonly RowMetric[], y: number): number {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (y < row.top + (row.height / 2)) {
            return i
        }
        if (y < row.top + row.height) {
            return i + 1
        }
    }
    return rows.length
}

/**
 * 목표 깊이에서의 새 부모.
 *
 * 경계에서 위로 거슬러 올라가 depth가 목표보다 한 단계 얕은 첫 행이 부모다.
 * 목표가 최상위면 부모가 없다.
 */
function findParent(rows: readonly RowMetric[], boundaryIndex: number, depth: number): string {
    if (depth === 0) {
        return ''
    }

    for (let i = boundaryIndex - 1; i >= 0; i--) {
        if (rows[i].depth === depth - 1) {
            return rows[i].cardId
        }
    }

    return ''
}
