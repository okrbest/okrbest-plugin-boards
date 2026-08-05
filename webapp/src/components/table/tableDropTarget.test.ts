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

describe('computeDropIntent — 영역으로 깊이 결정', () => {
    // 깊이는 커서 x가 아니라 "어느 목록에 놓이는가"로 정한다. 화면에 이미
    // 보이는 경계를 그대로 쓰므로 사용자가 눈금을 배울 필요가 없다.

    test('하위 카드 앞에 놓으면 그 카드의 형제가 된다', () => {
        const rows = nestedRows()   // a(0), a1(1), b(0)

        // a1 앞 경계. x를 어디에 두든 결과가 같다.
        for (const x of [TITLE_LEFT, TITLE_LEFT + 200]) {
            const out = compute(rows, x, 50, dragging('b'))
            expect(out?.depth).toBe(1)
            expect(out?.parentCardId).toBe('a')
        }
    })

    test('최상위 카드 앞에 놓으면 최상위가 된다', () => {
        const rows = nestedRows()

        // b 앞 경계
        const out = compute(rows, TITLE_LEFT + 200, 100, dragging('a1', {sourceParentId: 'a', sourceDepth: 1}))
        expect(out?.depth).toBe(0)
        expect(out?.parentCardId).toBe('')
    })

    // 사용자 제안: 하위 목록은 펼쳐져 있을 때만 놓을 수 있다. 접힌 부모의
    // 하위 행은 화면에 없으므로 경계 자체가 생기지 않는다.
    test('보이지 않는 하위 목록에는 놓을 수 없다', () => {
        // a의 하위가 접혀 rows에 a1이 없다.
        const collapsed: RowMetric[] = [
            {cardId: 'a', depth: 0, parentCardId: '', top: 0, height: ROW_HEIGHT},
            {cardId: 'b', depth: 0, parentCardId: '', top: 44, height: ROW_HEIGHT},
        ]

        // a와 b 사이에는 최상위 자리만 있다.
        const out = compute(collapsed, TITLE_LEFT + 500, 50, dragging('c'))
        expect(out?.depth).toBe(0)
        expect(out?.parentCardId).toBe('')
    })

    test('선의 들여쓰기가 목표 깊이와 일치한다', () => {
        const out = compute(nestedRows(), TITLE_LEFT, 50, dragging('b'))
        expect(out?.indentOffsetPx).toBe(1 * Constants.tableSubCardIndentPx)
    })
})

describe('computeDropIntent — 금지 규칙', () => {
    test('자기 자손 사이에는 놓을 수 없다', () => {
        const rows = nestedRows()
        const item = dragging('a', {subtreeIds: ['a', 'a1'], subtreeHeight: 1})

        expect(compute(rows, TITLE_LEFT, 50, item)).toBeNull()
    })

    // FR-012. 서브트리 높이만큼 여유가 없으면 놓을 수 없다.
    test('최대 깊이를 넘기면 놓을 수 없다', () => {
        const deep: RowMetric[] = [
            {cardId: 'p', depth: 3, parentCardId: 'x', top: 0, height: ROW_HEIGHT},
            {cardId: 'q', depth: 4, parentCardId: 'p', top: 44, height: ROW_HEIGHT},
        ]

        // q 앞 = depth 4. 높이 2짜리를 넣으면 4+2 > 5 이므로 불가.
        expect(compute(deep, TITLE_LEFT, 50, dragging('z', {subtreeHeight: 2}))).toBeNull()

        // 높이 0이면 4 <= 5 라 가능.
        expect(compute(deep, TITLE_LEFT, 50, dragging('z'))?.depth).toBe(4)
    })
})
