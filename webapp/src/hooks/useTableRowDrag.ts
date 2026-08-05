// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useRef} from 'react'
import {useDrag, useDrop} from 'react-dnd'

import {DragItem} from '../components/table/tableDropTarget'
import {useTableDrag} from '../components/table/tableDragContext'

type Result = {

    // 드래그 소스. 핸들에만 붙인다 — 행 본문을 끌어도 카드가 움직이지 않아야
    // 제목 셀에서 텍스트를 선택할 수 있다 (FR-002).
    handleRef: React.RefObject<HTMLDivElement | null>

    // 드롭 타깃 겸 메트릭 측정 대상. 행 전체에 붙인다.
    rowRef: React.RefObject<HTMLDivElement | null>

    isDragging: boolean
}

/**
 * 표 행 하나의 드래그 배선.
 *
 * 칸반이 쓰는 hooks/sortable.tsx는 건드리지 않는다. 그쪽은 행 전체가 드래그
 * 소스이고, 공용 훅에 핸들 분리와 좌표 보고를 넣으면 칸반이 회귀 위험에
 * 노출된다 (FR-030).
 */
export function useTableRowDrag(item: DragItem, enabled: boolean): Result {
    const handleRef = useRef<HTMLDivElement>(null)
    const rowRef = useRef<HTMLDivElement>(null)
    const {startDrag, reportCursor, endDrag, commitDrop} = useTableDrag()

    const [{isDragging}, drag] = useDrag(() => ({
        type: 'card',
        item: () => {
            startDrag(item)
            return item
        },
        end: () => endDrag(),
        collect: (monitor) => ({isDragging: monitor.isDragging()}),
        canDrag: () => enabled,
    }), [item, enabled, startDrag, endDrag])

    const [, drop] = useDrop(() => ({
        accept: 'card',
        hover: (_dragged, monitor) => {
            const offset = monitor.getClientOffset()
            const container = rowRef.current?.closest('.Table')
            if (!offset || !container) {
                return
            }

            // 뷰포트 좌표를 .Table의 콘텐츠 좌표로 옮긴다. 절대 위치 인디케이터가
            // 이 좌표계를 쓰므로 스크롤 보정이 따로 필요 없다.
            const rect = container.getBoundingClientRect()
            reportCursor({
                x: (offset.x - rect.left) + container.scrollLeft,
                y: (offset.y - rect.top) + container.scrollTop,
            })
        },
        drop: () => commitDrop(),
        canDrop: () => enabled,
    }), [enabled, reportCursor, commitDrop])

    // 드래그 소스와 드롭 타깃을 서로 다른 요소에 붙인다.
    useEffect(() => {
        drag(handleRef)
        drop(rowRef)
    }, [drag, drop])

    return {handleRef, rowRef, isDragging}
}
