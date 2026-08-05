// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {DropIntent} from './tableDropTarget'

type Props = {
    intent: DropIntent | null
}

/**
 * 드롭 위치를 나타내는 선. 표 전체에 하나만 그린다.
 *
 * 행마다 그리면 경계에서 두 행이 각자 그려 깜빡인다. .Table이
 * position: relative이므로 절대 위치 자식 하나로 두면 스크롤 콘텐츠와 함께
 * 움직여 스크롤 보정이 필요 없다 (FR-009).
 */
const TableDropIndicator = (props: Props): React.JSX.Element | null => {
    const {intent} = props

    // 놓을 수 없는 자리는 놓을 수 있어 보이지 않는다 (FR-008).
    if (!intent) {
        return null
    }

    return (
        <div
            className='TableDropIndicator'
            style={{top: intent.anchorTop, left: intent.indentOffsetPx}}
        />
    )
}

export default TableDropIndicator
