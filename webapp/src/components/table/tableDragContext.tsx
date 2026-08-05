// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {createContext, useCallback, useContext, useMemo, useRef, useState} from 'react'

import {Constants} from '../../constants'

import {computeDropIntent, DragItem, DropIntent, RowMetric} from './tableDropTarget'

type TableDragValue = {

    // 화면에 보이는 행. 등록 순서 = 보이는 순서다.
    rows: RowMetric[]

    // 지금 놓으면 어떻게 되는가. 놓을 수 없으면 null.
    intent: DropIntent | null

    // 반투명 처리할 카드들 (FR-019)
    draggingSubtree: Set<string>

    registerRow: (metric: RowMetric) => void
    unregisterRow: (cardId: string) => void
    startDrag: (item: DragItem) => void
    reportCursor: (point: {x: number, y: number}) => void
    endDrag: () => void

    // 놓는 순간 호출한다. 지금 판정을 그대로 위로 넘긴다 — 행은 자기가 어디
    // 놓이는지 모르고, 판정은 컨텍스트만 알고 있다.
    commitDrop: () => void
}

const noop = () => undefined

const TableDragContext = createContext<TableDragValue>({
    rows: [],
    intent: null,
    draggingSubtree: new Set(),
    registerRow: noop,
    unregisterRow: noop,
    startDrag: noop,
    reportCursor: noop,
    endDrag: noop,
    commitDrop: noop,
})

export const useTableDrag = (): TableDragValue => useContext(TableDragContext)

type Props = {
    titleCellLeft: number

    // 판정과 끌던 것을 받아 실제 변경으로 옮긴다.
    onDrop: (intent: DropIntent, item: DragItem, rows: readonly RowMetric[]) => void

    children: React.ReactNode
}

export const TableDragProvider = (props: Props): React.JSX.Element => {
    const [rows, setRows] = useState<RowMetric[]>([])
    const [intent, setIntent] = useState<DropIntent | null>(null)
    const [dragItem, setDragItem] = useState<DragItem | null>(null)

    // 커서 좌표는 ref에 적는다. hover는 픽셀마다 호출되므로 여기서 setState를
    // 하면 판정과 리렌더가 픽셀마다 돈다. 판정은 rAF에서 프레임당 한 번만 한다.
    const cursorRef = useRef<{x: number, y: number} | null>(null)
    const frameRef = useRef<number | null>(null)
    const rowsRef = useRef<RowMetric[]>([])
    const itemRef = useRef<DragItem | null>(null)
    const intentRef = useRef<DropIntent | null>(null)

    const registerRow = useCallback((metric: RowMetric) => {
        // 접힌 그룹의 행은 언마운트되지 않고 display:none으로 남는다. 그 행의
        // getBoundingClientRect는 전부 0이라, 등록하면 경계 계산이 좌표 0
        // 근처로 무너진다. 보이는 행만 넘기면 접힌 그룹에는 경계 자체가
        // 생기지 않아 FR-024가 분기 없이 만족된다.
        if (metric.height <= 0) {
            return
        }

        // ref가 원본이고 상태는 렌더용 미러다. 등록 직후 같은 프레임에 hover가
        // 들어올 수 있는데, 그때 렌더는 아직 돌지 않았다.
        const next = rowsRef.current.filter((row) => row.cardId !== metric.cardId)
        next.push(metric)
        next.sort((a, b) => a.top - b.top)
        rowsRef.current = next
        setRows(next)
    }, [])

    const unregisterRow = useCallback((cardId: string) => {
        rowsRef.current = rowsRef.current.filter((row) => row.cardId !== cardId)
        setRows(rowsRef.current)
    }, [])

    const startDrag = useCallback((item: DragItem) => {
        // ref를 먼저 세운다. hover는 이 호출 직후 같은 프레임에 들어올 수 있고,
        // 그때 렌더는 아직 돌지 않아 렌더 중 대입만으로는 늦는다.
        itemRef.current = item
        setDragItem(item)
    }, [])

    const endDrag = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current)
            frameRef.current = null
        }
        cursorRef.current = null
        itemRef.current = null
        intentRef.current = null
        setDragItem(null)
        setIntent(null)
    }, [])

    const reportCursor = useCallback((point: {x: number, y: number}) => {
        cursorRef.current = point

        if (frameRef.current !== null) {
            return
        }

        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null

            const cursor = cursorRef.current
            const item = itemRef.current
            if (!cursor || !item) {
                return
            }

            const next = computeDropIntent({
                rows: rowsRef.current,
                cursor,
                item,
                titleCellLeft: props.titleCellLeft,
                indentStepPx: Constants.tableSubCardIndentPx,
                maxDepth: Constants.maxCardDepth,
            })
            intentRef.current = next
            setIntent(next)
        })
    }, [props.titleCellLeft])

    const commitDrop = useCallback(() => {
        const currentIntent = intentRef.current
        const currentItem = itemRef.current

        // 놓을 수 없는 자리면 아무 일도 일어나지 않는다.
        if (currentIntent && currentItem) {
            props.onDrop(currentIntent, currentItem, rowsRef.current)
        }
    }, [props.onDrop])

    const draggingSubtree = useMemo(
        () => new Set(dragItem?.subtreeIds ?? []),
        [dragItem],
    )

    const value = useMemo(() => ({
        rows,
        intent,
        draggingSubtree,
        registerRow,
        unregisterRow,
        startDrag,
        reportCursor,
        endDrag,
        commitDrop,
    }), [rows, intent, draggingSubtree, registerRow, unregisterRow, startDrag, reportCursor, endDrag, commitDrop])

    return (
        <TableDragContext.Provider value={value}>
            {props.children}
        </TableDragContext.Provider>
    )
}
