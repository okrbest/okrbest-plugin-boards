// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {summarizeSelection} from './selectionSummary'

// 009 — 규칙 뷰의 속성값·직책 칸은 여러 값을 담는다. 선택이 많을 때 이름을 모두
// 나열하면 칸이 혼란스러우므로, 라벨은 상태만 압축해서 알려준다.

const options = [
    {id: 'opt-objective', name: 'Objective'},
    {id: 'opt-key-result', name: 'Key Results'},
    {id: 'opt-task', name: 'Tasks'},
]

describe('src/components/shareBoard/selectionSummary', () => {
    test('아무것도 고르지 않으면 none', () => {
        expect(summarizeSelection([], options)).toEqual({kind: 'none'})
    })

    test('하나면 그 값의 이름을 보여준다', () => {
        expect(summarizeSelection(['opt-key-result'], options)).toEqual({kind: 'single', name: 'Key Results'})
    })

    test('모두 고르면 전체', () => {
        expect(summarizeSelection(['opt-objective', 'opt-key-result', 'opt-task'], options)).toEqual({kind: 'all'})
    })

    test('여럿이지만 전부는 아니면 개수', () => {
        expect(summarizeSelection(['opt-objective', 'opt-task'], options)).toEqual({kind: 'count', count: 2})
    })

    test('목록에 없는 값은 세지 않는다', () => {
        expect(summarizeSelection(['opt-task', 'stale-id'], options)).toEqual({kind: 'single', name: 'Tasks'})
    })
})
