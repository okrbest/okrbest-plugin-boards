// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// 보드가 속성 편집을 관리자에게만 열지 기억하는 자리.
//
// 같은 규칙이 Go에도 있다(server/model/card_property_lock.go). 서버가 진실이고
// 화면은 같은 답을 해야 하므로, 두 언어가 각자 사본을 들고 옆에 붙은 테스트로
// 어긋남을 막는다 — okrBoard가 쓰는 방식과 같다.

// propertyAccess·okrBoard·orgColors가 사는 board.properties 아래 같은 자리다.
export const ADMIN_ONLY_CARD_PROPERTIES_KEY = 'adminOnlyCardProperties'

// 잠겼는지 답한다.
//
// 스위치가 켜진 것으로 읽히지 않는 모든 경우가 꺼짐이다 — 정한 적 없는 보드,
// 그리고 boolean이 아닌 값. board.properties는 다른 기능도 함께 쓰는 자유 형식이라,
// 반쯤 이해한 값을 "잠김"으로 읽으면 아무도 잠그지 않은 보드에서 속성 편집이 사라진다.
export function cardPropertiesAdminOnly(properties?: Record<string, unknown>): boolean {
    return properties?.[ADMIN_ONLY_CARD_PROPERTIES_KEY] === true
}
