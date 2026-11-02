// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createBoardView} from './blocks/boardView'

import {
    VIEW_ACCESS_MODE_KEY,
    accessModeTargets,
    isViewHiddenFrom,
    viewAccessMode,
    viewConfigLocked,
} from './viewAccess'

// 서버(server/model/view_access.go)와 같은 규율을 지킨다. 양쪽이 갈라지면 화면이
// 감춘 것을 서버가 허용하거나 그 반대가 된다.
const viewWith = (stored: unknown, createdBy = '') => {
    const view = createBoardView()
    view.id = 'view-1'
    view.createdBy = createdBy
    if (stored !== undefined) {
        (view.fields as Record<string, unknown>)[VIEW_ACCESS_MODE_KEY] = stored
    }
    return view
}

describe('viewAccess', () => {
    describe('viewAccessMode', () => {
        test('정한 적 없는 뷰는 공용이다', () => {
            expect(viewAccessMode(viewWith(undefined))).toBe('everyone')
        })

        test('세 값은 그대로 읽힌다', () => {
            expect(viewAccessMode(viewWith('everyone'))).toBe('everyone')
            expect(viewAccessMode(viewWith('admin'))).toBe('admin')
            expect(viewAccessMode(viewWith('private'))).toBe('private')
        })

        test('세 값이 아닌 것은 공용으로 읽는다', () => {
            const stored: unknown[] = ['locked', 'ADMIN', '', 1, true, null, {}, ['admin']]
            stored.forEach((value) => {
                expect(viewAccessMode(viewWith(value))).toBe('everyone')
            })
        })
    })

    describe('isViewHiddenFrom', () => {
        test('개인 뷰는 만든 사람에게만 보인다', () => {
            const view = viewWith('private', 'alice')
            expect(isViewHiddenFrom(view, 'alice')).toBe(false)
            expect(isViewHiddenFrom(view, 'bob')).toBe(true)
            expect(isViewHiddenFrom(view, '')).toBe(true)
        })

        test('공용과 관리자 뷰는 누구에게도 숨기지 않는다', () => {
            expect(isViewHiddenFrom(viewWith('admin', 'alice'), 'bob')).toBe(false)
            expect(isViewHiddenFrom(viewWith(undefined, 'alice'), 'bob')).toBe(false)
        })
    })

    describe('viewConfigLocked', () => {
        test('관리자 뷰는 관리자가 아니면 잠긴다', () => {
            expect(viewConfigLocked({mode: 'admin', isAdmin: false})).toBe(true)
            expect(viewConfigLocked({mode: 'admin', isAdmin: true})).toBe(false)
        })

        test('공용과 개인 뷰는 잠기지 않는다', () => {
            expect(viewConfigLocked({mode: 'everyone', isAdmin: false})).toBe(false)
            expect(viewConfigLocked({mode: 'private', isAdmin: false})).toBe(false)
        })
    })

    describe('accessModeTargets', () => {
        test('현재 모드를 건드릴 수 없으면 아무것도 고를 수 없다', () => {
            expect(accessModeTargets({mode: 'admin', isAdmin: false, isCreator: true, isLastShared: false})).toEqual([])
            expect(accessModeTargets({mode: 'private', isAdmin: true, isCreator: false, isLastShared: false})).toEqual([])
        })

        test('공용 뷰에서 팀원은 공용만 본다', () => {
            expect(accessModeTargets({mode: 'everyone', isAdmin: false, isCreator: false, isLastShared: false})).toEqual(['everyone'])
        })

        test('관리자는 관리자 항목을 본다', () => {
            expect(accessModeTargets({mode: 'everyone', isAdmin: true, isCreator: false, isLastShared: false})).toEqual(['everyone', 'admin'])
            expect(accessModeTargets({mode: 'admin', isAdmin: true, isCreator: false, isLastShared: false})).toEqual(['everyone', 'admin'])
        })

        test('만든 사람은 개인 항목을 본다', () => {
            expect(accessModeTargets({mode: 'everyone', isAdmin: false, isCreator: true, isLastShared: false})).toEqual(['everyone', 'private'])
            expect(accessModeTargets({mode: 'private', isAdmin: false, isCreator: true, isLastShared: false})).toEqual(['everyone', 'private'])
        })

        test('마지막 비개인 뷰에서는 개인 항목이 없다', () => {
            expect(accessModeTargets({mode: 'everyone', isAdmin: false, isCreator: true, isLastShared: true})).toEqual(['everyone'])
        })

        test('관리자이면서 만든 사람이면 셋 다 본다', () => {
            expect(accessModeTargets({mode: 'private', isAdmin: true, isCreator: true, isLastShared: false})).toEqual(['everyone', 'admin', 'private'])
        })
    })
})
