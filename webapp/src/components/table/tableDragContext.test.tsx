// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, act} from '@testing-library/react'

import {TableDragProvider, useTableDrag} from './tableDragContext'
import {DragItem, RowMetric} from './tableDropTarget'

const metric = (cardId: string, top: number): RowMetric => ({
    cardId, depth: 0, parentCardId: '', top, height: 44,
})

const item = (cardId: string): DragItem => ({
    cardId,
    subtreeIds: [cardId],
    subtreeHeight: 0,
    sourceParentId: '',
    sourceDepth: 0,
    selectedCardIds: [],
})

// 컨텍스트를 훅 그대로 노출해 테스트에서 직접 호출한다.
let ctx: ReturnType<typeof useTableDrag>

const Probe = () => {
    ctx = useTableDrag()
    return null
}

const renderCtx = () => render(
    <TableDragProvider titleCellLeft={100}>
        <Probe/>
    </TableDragProvider>,
)

describe('TableDragContext', () => {
    beforeEach(() => {
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb(0)
            return 0
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    test('행 메트릭을 등록 순서대로 유지한다', () => {
        renderCtx()

        act(() => {
            ctx.registerRow(metric('a', 0))
            ctx.registerRow(metric('b', 44))
        })

        expect(ctx.rows.map((r) => r.cardId)).toEqual(['a', 'b'])
    })

    test('등록을 해제하면 목록에서 빠진다', () => {
        renderCtx()

        act(() => {
            ctx.registerRow(metric('a', 0))
            ctx.registerRow(metric('b', 44))
            ctx.unregisterRow('a')
        })

        expect(ctx.rows.map((r) => r.cardId)).toEqual(['b'])
    })

    // FR-024. 접힌 그룹의 행은 언마운트되지 않고 display:none으로 남는다.
    // getBoundingClientRect가 전부 0이라 그대로 등록하면 경계 계산이 무너진다.
    // 보이는 행만 넘기면 접힌 그룹에는 경계 자체가 생기지 않는다.
    test('보이지 않는 행은 등록하지 않는다', () => {
        renderCtx()

        act(() => {
            ctx.registerRow(metric('a', 0))
            ctx.registerRow({...metric('hidden', 0), height: 0})
        })

        expect(ctx.rows.map((r) => r.cardId)).toEqual(['a'])
    })

    test('드래그가 끝나면 판정과 서브트리 표시가 비워진다', () => {
        renderCtx()

        act(() => {
            ctx.registerRow(metric('a', 0))
            ctx.registerRow(metric('b', 44))
            ctx.startDrag(item('b'))
            ctx.reportCursor({x: 100, y: 5})
        })

        expect(ctx.intent).not.toBeNull()
        expect(ctx.draggingSubtree.has('b')).toBe(true)

        act(() => {
            ctx.endDrag()
        })

        expect(ctx.intent).toBeNull()
        expect(ctx.draggingSubtree.size).toBe(0)
    })

    test('드래그 중이 아니면 좌표를 보고해도 판정하지 않는다', () => {
        renderCtx()

        act(() => {
            ctx.registerRow(metric('a', 0))
            ctx.reportCursor({x: 100, y: 5})
        })

        expect(ctx.intent).toBeNull()
    })
})
