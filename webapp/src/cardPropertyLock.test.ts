// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ADMIN_ONLY_CARD_PROPERTIES_KEY, cardPropertiesAdminOnly} from './cardPropertyLock'

// 서버(server/model/card_property_lock.go)와 같은 규율을 지킨다. 양쪽이 갈라지면
// 화면이 감춘 것을 서버가 허용하거나 그 반대가 된다.
describe('cardPropertyLock', () => {
    test('정한 적 없는 보드는 잠기지 않는다', () => {
        expect(cardPropertiesAdminOnly(undefined)).toBe(false)
        expect(cardPropertiesAdminOnly({})).toBe(false)
    })

    test('스위치는 양쪽으로 읽힌다', () => {
        expect(cardPropertiesAdminOnly({[ADMIN_ONLY_CARD_PROPERTIES_KEY]: true})).toBe(true)
        expect(cardPropertiesAdminOnly({[ADMIN_ONLY_CARD_PROPERTIES_KEY]: false})).toBe(false)
    })

    test('스위치가 아닌 값은 꺼짐으로 읽는다', () => {
        const stored: unknown[] = ['true', 'false', 1, 0, null, {}, [true]]
        stored.forEach((value) => {
            expect(cardPropertiesAdminOnly({[ADMIN_ONLY_CARD_PROPERTIES_KEY]: value})).toBe(false)
        })
    })
})
