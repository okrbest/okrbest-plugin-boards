// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Constants} from '../../constants'

import {computeDropIntent, DragItem, RowMetric} from './tableDropTarget'

const ROW_HEIGHT = 44
const TITLE_LEFT = 100

// 깊이 0 행 세 개를 44px 간격으로 세운다.
const flatRows = (): RowMetric[] => [
    {cardId: 'a', depth: 0, parentCardId: '', top: 0, height: ROW_HEIGHT},
    {cardId: 'b', depth: 0, parentCardId: '', top: 44, height: ROW_HEIGHT},
    {cardId: 'c', depth: 0, parentCardId: '', top: 88, height: ROW_HEIGHT},
]

const dragging = (cardId: string, over: Partial<DragItem> = {}): DragItem => ({
    cardId,
    subtreeIds: [cardId],
    subtreeHeight: 0,
    sourceParentId: '',
    sourceDepth: 0,
    selectedCardIds: [],
    ...over,
})

const compute = (rows: RowMetric[], x: number, y: number, item: DragItem) => computeDropIntent({
    rows,
    cursor: {x, y},
    item,
    titleCellLeft: TITLE_LEFT,
    indentStepPx: Constants.tableSubCardIndentPx,
    maxDepth: Constants.maxCardDepth,
})

describe('computeDropIntent — 경계 계산', () => {
    test('첫 행의 위쪽 절반이면 목록 맨 앞 경계', () => {
        const intent = compute(flatRows(), TITLE_LEFT, 5, dragging('c'))

        expect(intent?.boundaryIndex).toBe(0)
        expect(intent?.anchorTop).toBe(0)
    })

    test('마지막 행의 아래쪽 절반이면 목록 맨 끝 경계', () => {
        const intent = compute(flatRows(), TITLE_LEFT, 120, dragging('a'))

        expect(intent?.boundaryIndex).toBe(3)
        expect(intent?.anchorTop).toBe(132)
    })

    test('행 중앙을 지나면 앞에서 뒤로 넘어간다', () => {
        // 자기 자신에 인접한 경계는 놓을 수 없으므로 맨 끝 행을 끈다.
        const rows = [...flatRows(), {cardId: 'd', depth: 0, parentCardId: '', top: 132, height: ROW_HEIGHT}]

        // b행(top 44, height 44)의 위쪽 절반 → b 앞(경계 1)
        expect(compute(rows, TITLE_LEFT, 50, dragging('d'))?.boundaryIndex).toBe(1)

        // b행의 아래쪽 절반 → b 뒤(경계 2)
        expect(compute(rows, TITLE_LEFT, 80, dragging('d'))?.boundaryIndex).toBe(2)
    })

    test('행이 하나도 없으면 놓을 수 없다', () => {
        expect(compute([], TITLE_LEFT, 10, dragging('a'))).toBeNull()
    })

    // FR-007, SC-001. 인디케이터가 멈춘 자리와 카드가 놓이는 깊이가 같은
    // 상수에서 나와야 한다. 이 단언이 없으면 둘이 어긋나도 각각의 테스트는
    // 통과한다.
    test('선의 들여쓰기는 언제나 목표 깊이에서 파생된다 (자리표시)', () => {
        const rows = flatRows()

        for (const x of [TITLE_LEFT, TITLE_LEFT + 30, TITLE_LEFT + 200]) {
            for (const y of [5, 50, 80, 120]) {
                const intent = compute(rows, x, y, dragging('a'))
                if (intent) {
                    expect(intent.indentOffsetPx).toBe(intent.depth * Constants.tableSubCardIndentPx)
                }
            }
        }
    })
})

// 부모 a(depth 0) + 자식 a1(depth 1), 그리고 최상위 b.
const nestedRows = (): RowMetric[] => [
    {cardId: 'a', depth: 0, parentCardId: '', top: 0, height: ROW_HEIGHT},
    {cardId: 'a1', depth: 1, parentCardId: 'a', top: 44, height: ROW_HEIGHT},
    {cardId: 'b', depth: 0, parentCardId: '', top: 88, height: ROW_HEIGHT},
]

describe('computeDropIntent — 깊이 축', () => {
    // 경계는 a1(depth 1)과 b(depth 0) 사이. 상한 = 윗행 depth+1 = 2,
    // 하한 = 아랫행 depth = 0.
    const atBoundary2 = (x: number) => compute(nestedRows(), x, 100, dragging('c'))

    test('커서를 왼쪽 끝에 두면 하한 깊이', () => {
        expect(atBoundary2(TITLE_LEFT)?.depth).toBe(0)
    })

    test('오른쪽으로 밀면 깊이가 오른다', () => {
        expect(atBoundary2(TITLE_LEFT + 22)?.depth).toBe(1)
        expect(atBoundary2(TITLE_LEFT + 44)?.depth).toBe(2)
    })

    test('상한을 넘겨 밀어도 상한에서 멈춘다', () => {
        expect(atBoundary2(TITLE_LEFT + 500)?.depth).toBe(2)
    })

    test('왼쪽으로 더 당겨도 하한 아래로 내려가지 않는다', () => {
        expect(atBoundary2(TITLE_LEFT - 500)?.depth).toBe(0)
    })

    test('목표 깊이에서 부모를 정한다', () => {
        expect(atBoundary2(TITLE_LEFT)?.parentCardId).toBe('')
        expect(atBoundary2(TITLE_LEFT + 22)?.parentCardId).toBe('a')
        expect(atBoundary2(TITLE_LEFT + 44)?.parentCardId).toBe('a1')
    })

    test('선의 들여쓰기가 목표 깊이와 일치한다', () => {
        const intent = atBoundary2(TITLE_LEFT + 22)
        expect(intent?.indentOffsetPx).toBe(1 * Constants.tableSubCardIndentPx)
    })
})

describe('computeDropIntent — 금지 규칙', () => {
    // 자기 자신에 인접한 경계는 막지 않는다. 하위 카드를 최상위로 꺼내거나
    // 상위 카드를 하위로 넣는 조작이 바로 그 자리에서 일어나기 때문이다.
    test('자기 자리에서 깊이만 바꿀 수 있다', () => {
        const rows = nestedRows()   // a(0), a1(1), b(0)

        // a1을 자기 자리에서 왼쪽으로 당기면 최상위가 된다.
        const out = compute(rows, TITLE_LEFT, 50, dragging('a1', {sourceParentId: 'a', sourceDepth: 1}))
        expect(out).not.toBeNull()
        expect(out?.depth).toBe(0)
        expect(out?.parentCardId).toBe('')

        // 오른쪽으로 밀면 a의 하위로 남는다.
        const stay = compute(rows, TITLE_LEFT + 22, 50, dragging('a1', {sourceParentId: 'a', sourceDepth: 1}))
        expect(stay?.depth).toBe(1)
        expect(stay?.parentCardId).toBe('a')
    })

    test('이웃을 찾을 때 함께 움직이는 행은 건너뛴다', () => {
        const rows = nestedRows()
        const item = dragging('a', {subtreeIds: ['a', 'a1'], subtreeHeight: 1})

        // 서브트리 바로 뒤 경계(=b 앞). 위 이웃은 a1이 아니라 a보다 위여야
        // 하는데 위에 아무것도 없으므로 상한은 0이다.
        const out = compute(rows, TITLE_LEFT + 500, 100, item)
        expect(out).not.toBeNull()
        expect(out?.depth).toBe(0)
    })

    test('자기 자손 사이에는 놓을 수 없다', () => {
        const rows = nestedRows()
        const item = dragging('a', {subtreeIds: ['a', 'a1'], subtreeHeight: 1})

        // a와 a1 사이
        expect(compute(rows, TITLE_LEFT, 50, item)).toBeNull()
    })

    // FR-012. 서브트리 높이만큼 상한이 줄어든다.
    test('서브트리 높이가 상한을 깎는다', () => {
        const rows = nestedRows()
        const tall = dragging('c', {subtreeHeight: 3})

        // 원래 상한 2인데 5 − 3 = 2 이므로 그대로 2
        expect(compute(rows, TITLE_LEFT + 500, 100, tall)?.depth).toBe(2)

        const taller = dragging('c', {subtreeHeight: 4})
        expect(compute(rows, TITLE_LEFT + 500, 100, taller)?.depth).toBe(1)
    })

    test('상한이 하한보다 낮으면 놓을 수 없다', () => {
        const rows: RowMetric[] = [
            {cardId: 'p', depth: 3, parentCardId: '', top: 0, height: ROW_HEIGHT},
            {cardId: 'q', depth: 4, parentCardId: 'p', top: 44, height: ROW_HEIGHT},
        ]

        // 경계 1: 상한 = min(3+1, 5−2) = 3, 하한 = 4 → 상한 < 하한
        expect(compute(rows, TITLE_LEFT, 50, dragging('z', {subtreeHeight: 2}))).toBeNull()
    })
})
