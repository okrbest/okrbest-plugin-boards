// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// 아이콘 문자열이 이모지 shortcode인지 확인
// shortcode 형식: 영문자, 숫자, 언더스코어, 하이픈으로만 구성
// 예: "smile", "thumbsup", "custom_emoji", "+1"
export function isEmojiShortcode(icon: string): boolean {
    // 유니코드 이모지 문자인 경우 false
    // 이모지는 보통 서로게이트 페어를 포함하므로 길이가 1~2 이상이고 특수 범위에 있음
    if (!icon || icon.length === 0) {
        return false
    }

    // shortcode는 보통 알파벳, 숫자, _, -, + 로만 구성됨
    const shortcodePattern = /^[a-zA-Z0-9_+-]+$/
    return shortcodePattern.test(icon)
}
