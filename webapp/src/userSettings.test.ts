// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSettings} from './userSettings'

describe('userSettings sidebarHidden', () => {
    beforeEach(() => {
        localStorage.clear()
        jest.restoreAllMocks()
    })

    it('기본값은 false다 (저장된 값 없음)', () => {
        expect(UserSettings.getSidebarHidden('user-1')).toBe(false)
    })

    it('true로 저장하면 사용자별 키에 기록되고 true를 돌려준다', () => {
        UserSettings.setSidebarHidden('user-1', true)

        expect(localStorage.getItem('sidebarHidden_user-1')).toBe('true')
        expect(UserSettings.getSidebarHidden('user-1')).toBe(true)
    })

    it('false로 저장하면 키를 지운다 — 기본값을 값으로 남기지 않는다', () => {
        UserSettings.setSidebarHidden('user-1', true)
        UserSettings.setSidebarHidden('user-1', false)

        expect(localStorage.getItem('sidebarHidden_user-1')).toBeNull()
        expect(UserSettings.getSidebarHidden('user-1')).toBe(false)
    })

    it('사용자별로 분리된다 — 한 사용자의 숨김이 다른 사용자에 번지지 않는다', () => {
        UserSettings.setSidebarHidden('user-1', true)

        expect(UserSettings.getSidebarHidden('user-2')).toBe(false)
    })

    it('localStorage 읽기가 던지면 false를 돌려준다', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage blocked')
        })

        expect(UserSettings.getSidebarHidden('user-1')).toBe(false)
    })

    it('localStorage 쓰기가 던져도 전파하지 않는다', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage blocked')
        })

        expect(() => UserSettings.setSidebarHidden('user-1', true)).not.toThrow()
    })
})
