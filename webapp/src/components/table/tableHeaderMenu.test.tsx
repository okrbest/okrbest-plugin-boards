// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'
import configureStore from 'redux-mock-store'

import '@testing-library/jest-dom'
import {wrapIntl} from '../../testUtils'

import 'isomorphic-fetch'

import {Constants} from '../../constants'
import mutator from '../../mutator'

import {TestBlockFactory} from '../../test/testBlockFactory'
import {FetchMock} from '../../test/fetchMock'

import TableHeaderMenu from './tableHeaderMenu'

global.fetch = FetchMock.fn

// import mutator from '../../mutator'

jest.mock('../../mutator', () => ({
    changeViewSortOptions: jest.fn(),
    insertPropertyTemplate: jest.fn(),
    changeViewVisibleProperties: jest.fn(),
    duplicatePropertyTemplate: jest.fn(),
    deleteProperty: jest.fn(),
}))

beforeEach(() => {
    jest.resetAllMocks()
    FetchMock.fn.mockReset()
})

describe('components/table/TableHeaderMenu', () => {
    // 판정 훅이 팀과 보드 멤버십을 읽으므로 보드에 팀이 있어야 한다. 기본값은 빈
    // 문자열이라 그대로 두면 어떤 권한도 성립하지 않는다.
    const boardWithTeam = () => {
        const b = TestBlockFactory.createBoard()
        b.teamId = 'team-1'
        return b
    }

    const board = boardWithTeam()
    const view = TestBlockFactory.createBoardView(board)

    // 속성을 더하고 지우는 항목은 보드가 잠글 수 있다. 판정 훅이 스토어를 읽으므로
    // 렌더할 때 보드 멤버십을 함께 준다.
    const mockStore = configureStore([])
    const withStore = (ui: React.ReactElement, membership: Record<string, unknown> = {userId: 'user-1', schemeAdmin: true}, b = board) => (
        <ReduxProvider
            store={mockStore({
                teams: {current: {id: b.teamId}},
                boards: {current: b.id, boards: {[b.id]: b}, myBoardMemberships: {[b.id]: membership}},
                users: {me: {id: 'user-1'}},
            })}
        >
            {ui}
        </ReduxProvider>
    )

    const view2 = TestBlockFactory.createBoardView(board)
    view2.fields.sortOptions = []

    test('should match snapshot, title column', async () => {
        const component = wrapIntl(
            <TableHeaderMenu
                templateId={Constants.titleColumnId}
                board={board}
                activeView={view}
                views={[view, view2]}
                cards={[]}
            />,
        )
        const {container, getByText} = render(withStore(component))

        let sort = getByText(/Sort ascending/i)
        fireEvent.click(sort)
        sort = getByText(/Sort descending/i)
        fireEvent.click(sort)
        expect(mutator.changeViewSortOptions).toHaveBeenCalledTimes(2)

        let insert = getByText(/Insert left/i)
        fireEvent.click(insert)
        insert = getByText(/Insert right/i)
        fireEvent.click(insert)
        expect(mutator.insertPropertyTemplate).toHaveBeenCalledTimes(0)

        expect(container).toMatchSnapshot()
    })

    test('should match snapshot, other column', async () => {
        const component = wrapIntl(
            <TableHeaderMenu
                templateId={'property 1'}
                board={board}
                activeView={view}
                views={[view, view2]}
                cards={[]}
            />,
        )
        const {container, getByText} = render(withStore(component))

        let sort = getByText(/Sort ascending/i)
        fireEvent.click(sort)
        sort = getByText(/Sort descending/i)
        fireEvent.click(sort)
        expect(mutator.changeViewSortOptions).toHaveBeenCalledTimes(2)

        let insert = getByText(/Insert left/i)
        fireEvent.click(insert)
        insert = getByText(/Insert right/i)
        fireEvent.click(insert)
        expect(mutator.insertPropertyTemplate).toHaveBeenCalledTimes(2)

        const hide = getByText(/Hide/i)
        fireEvent.click(hide)
        expect(mutator.changeViewVisibleProperties).toHaveBeenCalled()
        const duplicate = getByText(/Duplicate/i)
        fireEvent.click(duplicate)
        expect(mutator.duplicatePropertyTemplate).toHaveBeenCalled()
        const del = getByText(/Delete/i)
        fireEvent.click(del)
        expect(mutator.deleteProperty).toHaveBeenCalled()

        expect(container).toMatchSnapshot()
    })

    // U-01 — 잠긴 보드에서 에디터에게는 속성을 더하고 지우는 항목이 없다. 정렬과
    // 숨기기는 뷰를 바꾸는 일이라 잠금과 무관하다.
    describe('속성 편집 잠금', () => {
        const lockedBoard = () => {
            const b = boardWithTeam()
            b.properties = {adminOnlyCardProperties: true}
            return b
        }
        const editor = {userId: 'user-1', schemeEditor: true}
        const admin = {userId: 'user-1', schemeAdmin: true}

        const renderMenu = (b: ReturnType<typeof lockedBoard>, membership: Record<string, unknown>) => render(withStore(
            wrapIntl(
                <TableHeaderMenu
                    templateId={'property 1'}
                    board={b}
                    activeView={TestBlockFactory.createBoardView(b)}
                    views={[]}
                    cards={[]}
                />,
            ), membership, b,
        ))

        test('잠긴 보드에서 에디터는 속성 추가·삭제를 못 본다', () => {
            const {queryByText, getByText} = renderMenu(lockedBoard(), editor)

            expect(queryByText(/Insert left/i)).toBeNull()
            expect(queryByText(/Insert right/i)).toBeNull()
            expect(queryByText(/Duplicate/i)).toBeNull()
            expect(queryByText(/Delete/i)).toBeNull()

            // 뷰를 바꾸는 항목은 남는다.
            expect(getByText(/Sort ascending/i)).toBeDefined()
            expect(getByText(/Hide/i)).toBeDefined()
        })

        test('잠긴 보드에서 보드 관리자는 다 본다', () => {
            const {getByText} = renderMenu(lockedBoard(), admin)

            expect(getByText(/Insert left/i)).toBeDefined()
            expect(getByText(/Delete/i)).toBeDefined()
        })

        test('잠기지 않은 보드에서 에디터는 지금처럼 다 본다', () => {
            const {getByText} = renderMenu(boardWithTeam(), editor)

            expect(getByText(/Insert left/i)).toBeDefined()
            expect(getByText(/Delete/i)).toBeDefined()
        })
    })
})
