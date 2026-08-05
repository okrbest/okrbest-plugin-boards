// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render} from '@testing-library/react'
import {DndProvider} from 'react-dnd'
import {HTML5Backend} from 'react-dnd-html5-backend'

import {TableDragProvider} from '../components/table/tableDragContext'
import {DragItem} from '../components/table/tableDropTarget'

import {useTableRowDrag} from './useTableRowDrag'

const item: DragItem = {
    cardId: 'a',
    subtreeIds: ['a'],
    subtreeHeight: 0,
    sourceParentId: '',
    sourceDepth: 0,
    selectedCardIds: [],
}

const Row = ({enabled}: {enabled: boolean}) => {
    const {handleRef, rowRef} = useTableRowDrag(item, enabled)
    return (
        <div
            ref={rowRef}
            data-testid='row'
        >
            <div
                ref={handleRef}
                data-testid='handle'
            />
        </div>
    )
}

const renderRow = (enabled = true) => render(
    <DndProvider backend={HTML5Backend}>
        <TableDragProvider
            titleCellLeft={0}
            onDrop={() => undefined}
        >
            <Row enabled={enabled}/>
        </TableDragProvider>
    </DndProvider>,
)

describe('useTableRowDrag', () => {
    // FR-002. 드래그 소스는 핸들에만 붙는다. 행 본문이 드래그 소스면 제목
    // 글자를 끌 때 카드가 딸려 나온다.
    test('드래그 소스와 드롭 타깃이 서로 다른 요소에 붙는다', () => {
        const {getByTestId} = renderRow()

        const handle = getByTestId('handle')
        const row = getByTestId('row')

        expect(handle.getAttribute('draggable')).toBe('true')
        expect(row.getAttribute('draggable')).not.toBe('true')
    })

    // 비활성일 때 draggable 속성은 확인하지 않는다. react-dnd는 canDrag를
    // 드래그 시작 시점에만 평가하므로 속성은 그대로 붙는다. 권한이 없을 때
    // 핸들 자체를 그리지 않는 것은 tableRow 쪽에서 검증한다 (FR-004).
    test('비활성이어도 훅은 오류 없이 붙는다', () => {
        const {getByTestId} = renderRow(false)

        expect(getByTestId('handle')).toBeTruthy()
        expect(getByTestId('row')).toBeTruthy()
    })
})
