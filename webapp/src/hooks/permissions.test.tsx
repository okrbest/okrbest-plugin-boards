// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {renderHook} from '@testing-library/react'
import configureStore from 'redux-mock-store'

import {Board} from '../blocks/board'

import {useCanEditCardProperties} from './permissions'

// 잠금이 꺼진 보드에서는 지금까지의 답을, 켜진 보드에서는 보드 관리자만을 답한다.
// 화면이 서버와 다른 답을 하면 거절당할 조작을 사용자에게 내밀거나 그 반대가 된다.
describe('hooks/permissions — useCanEditCardProperties', () => {
    const mockStore = configureStore([])

    const board = (properties: Board['properties'] = {}) => ({
        id: 'board-1',
        teamId: 'team-1',
        cardProperties: [],
        properties,
    } as unknown as Board)

    const renderWith = (b: Board, membership: Record<string, unknown>) => {
        const state = {
            teams: {current: {id: 'team-1'}},
            boards: {
                current: b.id,
                boards: {[b.id]: b},
                myBoardMemberships: {[b.id]: membership},
            },
            users: {me: {id: 'user-1'}},
        }
        const wrapper = ({children}: {children: React.ReactNode}) => (
            <ReduxProvider store={mockStore(state)}>{children}</ReduxProvider>
        )
        return renderHook(() => useCanEditCardProperties(b), {wrapper})
    }

    const editor = {userId: 'user-1', schemeEditor: true}
    const admin = {userId: 'user-1', schemeAdmin: true}

    test('잠기지 않은 보드에서 에디터는 편집할 수 있다', () => {
        expect(renderWith(board(), editor).result.current).toBe(true)
    })

    test('잠긴 보드에서 에디터는 편집할 수 없다', () => {
        expect(renderWith(board({adminOnlyCardProperties: true}), editor).result.current).toBe(false)
    })

    test('잠긴 보드에서 보드 관리자는 편집할 수 있다', () => {
        expect(renderWith(board({adminOnlyCardProperties: true}), admin).result.current).toBe(true)
    })

    test('스위치가 아닌 값은 잠기지 않은 것으로 본다', () => {
        expect(renderWith(board({adminOnlyCardProperties: 'true'}), editor).result.current).toBe(true)
    })

    test('보드를 아직 모르면 잠기지 않은 것으로 본다', () => {
        // 설정이 도착하기 전에 감추면 모든 보드에서 편집이 잠깐 사라진다. 서버가
        // 어차피 최종 판정을 하므로 화면이 성급히 감출 이유가 없다.
        expect(renderWith(board(undefined as unknown as Board['properties']), editor).result.current).toBe(true)
    })
})
