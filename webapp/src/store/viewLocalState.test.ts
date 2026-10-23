// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSettingKey} from '../userSettings'

import {
    reducer,
    toggleCollapsedOption,
    setColumnWidth,
    viewLocalStateKey,
    loadViewLocalState,
} from './viewLocalState'

// specs/021-per-user-view-state/data-model.md — 개인 뷰 표시 상태 슬라이스.
describe('store/viewLocalState', () => {
    const key = viewLocalStateKey('user-1', 'view-1')

    beforeEach(() => {
        localStorage.clear()
    })

    describe('toggleCollapsedOption', () => {
        test('개인 목록이 없으면 seed를 복사한 뒤 토글한다 (FR-005)', () => {
            const state = reducer(undefined, toggleCollapsedOption({key, optionId: 'opt-b', seed: ['opt-a']}))

            expect(state.byKey[key].collapsedOptionIds).toEqual(['opt-a', 'opt-b'])
        })

        test('개인 목록이 있으면 seed를 무시하고 토글만 한다', () => {
            let state = reducer(undefined, toggleCollapsedOption({key, optionId: 'opt-a', seed: []}))
            state = reducer(state, toggleCollapsedOption({key, optionId: 'opt-a', seed: ['opt-z']}))

            expect(state.byKey[key].collapsedOptionIds).toEqual([])
        })

        test('접힌 그룹을 다시 토글하면 목록에서 빠진다', () => {
            let state = reducer(undefined, toggleCollapsedOption({key, optionId: 'opt-a', seed: ['opt-a', 'opt-b']}))

            expect(state.byKey[key].collapsedOptionIds).toEqual(['opt-b'])

            state = reducer(state, toggleCollapsedOption({key, optionId: 'opt-a', seed: []}))
            expect(state.byKey[key].collapsedOptionIds).toEqual(['opt-b', 'opt-a'])
        })
    })

    describe('setColumnWidth', () => {
        test('열 단위로 개인 너비를 기록한다 (FR-002)', () => {
            let state = reducer(undefined, setColumnWidth({key, columnId: 'col-1', width: 120}))
            state = reducer(state, setColumnWidth({key, columnId: 'col-2', width: 300}))

            expect(state.byKey[key].columnWidths).toEqual({'col-1': 120, 'col-2': 300})
        })
    })

    describe('키 분리 (FR-008)', () => {
        test('사용자·뷰가 다르면 서로 영향이 없다', () => {
            const otherUser = viewLocalStateKey('user-2', 'view-1')
            const otherView = viewLocalStateKey('user-1', 'view-2')

            let state = reducer(undefined, toggleCollapsedOption({key, optionId: 'opt-a', seed: []}))
            state = reducer(state, setColumnWidth({key: otherView, columnId: 'col-1', width: 80}))

            expect(state.byKey[key].collapsedOptionIds).toEqual(['opt-a'])
            expect(state.byKey[otherUser]).toBeUndefined()
            expect(state.byKey[otherView].collapsedOptionIds).toBeUndefined()
            expect(state.byKey[otherView].columnWidths).toEqual({'col-1': 80})
        })
    })

    describe('localStorage 지속 (FR-004)', () => {
        test('쓰기 액션이 localStorage에 기록한다', () => {
            reducer(undefined, setColumnWidth({key, columnId: 'col-1', width: 120}))

            const raw = localStorage.getItem(UserSettingKey.ViewLocalState)
            expect(raw).not.toBeNull()
            expect(JSON.parse(raw!)[key].columnWidths).toEqual({'col-1': 120})
        })

        test('loadViewLocalState가 기록을 복원한다', () => {
            reducer(undefined, toggleCollapsedOption({key, optionId: 'opt-a', seed: []}))

            expect(loadViewLocalState()[key].collapsedOptionIds).toEqual(['opt-a'])
        })

        test('저장된 값이 깨져 있으면 빈 상태로 시작한다', () => {
            localStorage.setItem(UserSettingKey.ViewLocalState, '{not-json')

            expect(loadViewLocalState()).toEqual({})
        })

        test('localStorage가 막혀 있어도 메모리 상태는 동작한다', () => {
            const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error('quota exceeded')
            })
            try {
                const state = reducer(undefined, setColumnWidth({key, columnId: 'col-1', width: 120}))

                expect(state.byKey[key].columnWidths).toEqual({'col-1': 120})
            } finally {
                setItem.mockRestore()
            }
        })

        test('디스크에 있는 다른 키를 지우지 않는다 — 다른 탭의 저장분 보존', () => {
            const otherTabKey = viewLocalStateKey('user-9', 'view-9')
            localStorage.setItem(UserSettingKey.ViewLocalState, JSON.stringify({
                [otherTabKey]: {columnWidths: {'col-x': 80}},
            }))

            // 이 탭(리듀서 메모리)은 otherTabKey를 모른 채 자기 키만 쓴다
            reducer(undefined, setColumnWidth({key, columnId: 'col-1', width: 120}))

            const saved = JSON.parse(localStorage.getItem(UserSettingKey.ViewLocalState)!)
            expect(saved[key].columnWidths).toEqual({'col-1': 120})
            expect(saved[otherTabKey].columnWidths).toEqual({'col-x': 80})
        })

        test('저장 값이 객체가 아니거나 엔트리가 비객체면 걸러낸다', () => {
            localStorage.setItem(UserSettingKey.ViewLocalState, 'null')
            expect(loadViewLocalState()).toEqual({})

            localStorage.setItem(UserSettingKey.ViewLocalState, '[1,2]')
            expect(loadViewLocalState()).toEqual({})

            localStorage.setItem(UserSettingKey.ViewLocalState, JSON.stringify({
                [key]: 'not-an-object',
                [viewLocalStateKey('u2', 'v2')]: {collapsedOptionIds: ['a']},
            }))
            expect(loadViewLocalState()).toEqual({
                [viewLocalStateKey('u2', 'v2')]: {collapsedOptionIds: ['a']},
            })
        })

        test('비로그인 사용자(userId 없음)의 상태는 지속하지 않는다', () => {
            const anonymousKey = viewLocalStateKey('', 'view-1')
            const state = reducer(undefined, toggleCollapsedOption({key: anonymousKey, optionId: 'opt-a', seed: []}))

            expect(state.byKey[anonymousKey].collapsedOptionIds).toEqual(['opt-a'])
            expect(localStorage.getItem(UserSettingKey.ViewLocalState)).toBeNull()
        })
    })
})
