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
    test('선의 들여쓰기는 언제나 목표 깊이에서 파생된다', () => {
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
