// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render} from '@testing-library/react'
import '@testing-library/jest-dom'

import 'isomorphic-fetch'
import {wrapDNDIntl} from '../../testUtils'

import {TestBlockFactory} from '../../test/testBlockFactory'

import {ColumnResizeProvider} from './tableColumnResizeContext'
import TableHeader from './tableHeader'

describe('components/table/TableHeaderMenu', () => {
    const board = TestBlockFactory.createBoard()
    const view = TestBlockFactory.createBoardView(board)

    const view2 = TestBlockFactory.createBoardView(board)
    view2.fields.sortOptions = []

    test('should match snapshot, title column', async () => {
        const onAutoSizeColumn = jest.fn()
        const component = wrapDNDIntl(
            <ColumnResizeProvider
                columnWidths={{}}
                onResizeColumn={jest.fn()}
            >
                <TableHeader
                    readonly={false}
                    sorted={'none'}
                    name={'my Name'}
                    board={board}
                    activeView={view}
                    cards={[]}
                    views={[view, view2]}
                    template={board.cardProperties[0]}
                    onDrop={jest.fn()}
                    onAutoSizeColumn={onAutoSizeColumn}
                />
            </ColumnResizeProvider>,
        )

        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })
})

// specs/021-per-user-view-state US3 — 열 너비는 개인 화면 제어이므로 읽기
// 전용이어도 그립을 렌더한다. 정렬 메뉴 등 공유 구성 게이트는 유지한다 (FR-006·FR-007).
describe('components/table/TableHeader - 읽기 전용 (021 US3)', () => {
    const board = TestBlockFactory.createBoard()
    const view = TestBlockFactory.createBoardView(board)

    test('읽기 전용이어도 열 너비 그립은 렌더된다 (FR-006)', () => {
        const {container} = render(wrapDNDIntl(
            <ColumnResizeProvider
                columnWidths={{}}
                onResizeColumn={jest.fn()}
            >
                <TableHeader
                    readonly={true}
                    sorted={'none'}
                    name={'my Name'}
                    board={board}
                    activeView={view}
                    cards={[]}
                    views={[view]}
                    template={board.cardProperties[0]}
                    onDrop={jest.fn()}
                    onAutoSizeColumn={jest.fn()}
                />
            </ColumnResizeProvider>,
        ))

        expect(container.querySelector('.HorizontalGrip')).not.toBeNull()

        // 공유 구성(정렬 메뉴)은 여전히 잠겨 있다
        expect(container.querySelector('.MenuWrapper.disabled')).not.toBeNull()
    })
})
