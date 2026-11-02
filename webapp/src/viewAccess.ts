// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// 뷰가 누구에게 보이고 누가 구성을 바꾸는지 기억하는 자리.
//
// 같은 규칙이 Go에도 있다(server/model/view_access.go). 서버가 진실이고 화면은
// 같은 답을 해야 하므로, 두 언어가 각자 사본을 들고 옆에 붙은 테스트로 어긋남을
// 막는다 — cardPropertyLock이 쓰는 방식과 같다.

import type {BoardView} from './blocks/boardView'

export type ViewAccessMode = 'everyone' | 'admin' | 'private'

// 뷰 블록 fields 아래, 필터·정렬과 같은 자리다.
export const VIEW_ACCESS_MODE_KEY = 'accessMode'

// 관리자가 공유 위젯에서 보는 개인 뷰 한 줄. 구성(필터·정렬)은 담지 않는다.
export type PrivateViewSummary = {
    id: string
    title: string
    createdBy: string
    createAt: number
}

// 뷰의 모드를 읽는다.
//
// 다른 두 값으로 정확히 읽히지 않는 모든 경우가 공용이다 — 정한 적 없는 뷰,
// 문자열이 아닌 값, 아무도 정의하지 않은 문자열. 반쯤 이해한 값을 잠금이나
// 숨김으로 읽으면 아무도 잠그지 않은 뷰가 잠긴다.
export function viewAccessMode(view: Pick<BoardView, 'fields'>): ViewAccessMode {
    const stored = (view.fields as Record<string, unknown> | undefined)?.[VIEW_ACCESS_MODE_KEY]
    if (stored === 'admin' || stored === 'private') {
        return stored
    }
    return 'everyone'
}

// 이 뷰가 userId에게 숨겨진 개인 뷰인지 답한다. 서버가 이미 걸러 보내므로
// 화면에서는 방어용이다.
export function isViewHiddenFrom(view: Pick<BoardView, 'fields' | 'createdBy'>, userId: string | undefined): boolean {
    return viewAccessMode(view) === 'private' && view.createdBy !== (userId || '')
}

// 관리자 모드인 뷰를 관리자가 아닌 사람이 보고 있는가 — 구성 메뉴가 잠기는 조건.
export function viewConfigLocked(input: {mode: ViewAccessMode, isAdmin: boolean}): boolean {
    return input.mode === 'admin' && !input.isAdmin
}

// 권한 메뉴에 보여 줄 항목. 현재 모드를 건드릴 권한과 목표 모드를 고를 권한을
// 둘 다 요구한다(spec FR-015). 현재 모드도 목록에 남겨 체크 표시로 보여 준다.
export function accessModeTargets(input: {
    mode: ViewAccessMode
    isAdmin: boolean
    isCreator: boolean
    isLastShared: boolean
}): ViewAccessMode[] {
    const {mode, isAdmin, isCreator, isLastShared} = input
    const canTouch = mode === 'everyone' || (mode === 'admin' && isAdmin) || (mode === 'private' && isCreator)
    if (!canTouch) {
        return []
    }
    const targets: ViewAccessMode[] = ['everyone']
    if (isAdmin) {
        targets.push('admin')
    }
    if (isCreator && !isLastShared) {
        targets.push('private')
    }
    return targets
}
