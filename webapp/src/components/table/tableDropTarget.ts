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

    // 2. 자기 자신·자손 사이에는 놓을 수 없다. 부모를 자기 자손 밑에 넣으면
    //    순환이 된다.
    const moving = new Set(item.subtreeIds)
    const above = rows[boundaryIndex - 1]
    const below = rows[boundaryIndex]
    if ((above && moving.has(above.cardId)) || (below && moving.has(below.cardId))) {
        return null
    }

    // 3~5. 깊이는 다음 단계에서 붙인다. 지금은 최상위로만 놓는다.
    const depth = 0

    return {
        boundaryIndex,
        depth,
        parentCardId: '',
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
