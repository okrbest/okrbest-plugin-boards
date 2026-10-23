// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createSlice, PayloadAction} from '@reduxjs/toolkit'

import {UserSettings} from '../userSettings'
import {Utils} from '../utils'

import {RootState} from './index'

// 021: 사용자×뷰별 화면 조정 상태. 공유 뷰 블록과 달리 서버에 저장하지 않고
// 다른 사용자에게 전파하지 않는다 (specs/021-per-user-view-state/data-model.md).
export type ViewLocalState = {
    collapsedOptionIds?: string[]
    columnWidths?: Record<string, number>
}

type ViewLocalStateMap = Record<string, ViewLocalState>

export const viewLocalStateKey = (userId: string, viewId: string): string => `${userId}:${viewId}`

// 비로그인(공유 링크) 사용자의 키 — 메모리로만 동작하고 지속하지 않는다
const isAnonymousKey = (key: string): boolean => key.startsWith(':')

const isPlainObject = (value: unknown): boolean =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function loadViewLocalState(): ViewLocalStateMap {
    try {
        const parsed = JSON.parse(UserSettings.viewLocalState || '{}')
        if (!isPlainObject(parsed)) {
            return {}
        }
        // 설정 가져오기 등으로 형태가 깨진 엔트리는 걸러낸다
        const map: ViewLocalStateMap = {}
        for (const [key, value] of Object.entries(parsed)) {
            if (isPlainObject(value)) {
                map[key] = value as ViewLocalState
            }
        }
        return map
    } catch {
        Utils.logWarn('loadViewLocalState: stored value is corrupt, starting empty')
        return {}
    }
}

const persist = (byKey: ViewLocalStateMap, changedKey: string): void => {
    if (isAnonymousKey(changedKey)) {
        return
    }
    // 디스크의 최신 값 위에 이 탭의 메모리 상태를 병합한다 — 다른 탭이
    // 같은 키 공간에 저장한 엔트리를 모듈 로드 시점 스냅샷으로 덮지 않기 위함
    const persistable: ViewLocalStateMap = loadViewLocalState()
    for (const [key, value] of Object.entries(byKey)) {
        if (!isAnonymousKey(key)) {
            persistable[key] = value
        }
    }
    UserSettings.viewLocalState = JSON.stringify(persistable)
}

const viewLocalStateSlice = createSlice({
    name: 'viewLocalState',
    initialState: {byKey: loadViewLocalState()} as {byKey: ViewLocalStateMap},
    reducers: {
        // 개인 목록이 없으면 공유 값(seed)을 복사해 만든 뒤 토글한다 (FR-005)
        toggleCollapsedOption: (state, action: PayloadAction<{key: string, optionId: string, seed: string[]}>) => {
            const {key, optionId, seed} = action.payload
            if (!state.byKey[key]) {
                state.byKey[key] = {}
            }
            const entry = state.byKey[key]
            const ids = entry.collapsedOptionIds ?? [...seed]
            const index = ids.indexOf(optionId)
            if (index > -1) {
                ids.splice(index, 1)
            } else {
                ids.push(optionId)
            }
            entry.collapsedOptionIds = ids
            persist(state.byKey, key)
        },
        setColumnWidth: (state, action: PayloadAction<{key: string, columnId: string, width: number}>) => {
            const {key, columnId, width} = action.payload
            if (!state.byKey[key]) {
                state.byKey[key] = {}
            }
            const entry = state.byKey[key]
            entry.columnWidths = {...entry.columnWidths, [columnId]: width}
            persist(state.byKey, key)
        },
    },
})

export const {toggleCollapsedOption, setColumnWidth} = viewLocalStateSlice.actions
export const {reducer} = viewLocalStateSlice

export function getViewLocalState(state: RootState, key: string): ViewLocalState | undefined {
    // redux-mock-store 기반 테스트는 이 슬라이스 없이 상태를 만들기도 한다
    return state.viewLocalState?.byKey?.[key]
}
