// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render} from '@testing-library/react'

import TableDropIndicator from './tableDropIndicator'
import {DropIntent} from './tableDropTarget'

const intent = (over: Partial<DropIntent> = {}): DropIntent => ({
    boundaryIndex: 1,
    depth: 0,
    parentCardId: '',
    anchorTop: 44,
    indentOffsetPx: 0,
    ...over,
})

describe('TableDropIndicator', () => {
    test('놓을 수 없으면 아무것도 그리지 않는다', () => {
        const {container} = render(<TableDropIndicator intent={null}/>)

        expect(container.querySelector('.TableDropIndicator')).toBeNull()
    })

    test('경계 y를 선의 위치로 쓴다', () => {
        const {container} = render(<TableDropIndicator intent={intent({anchorTop: 88})}/>)

        const line = container.querySelector('.TableDropIndicator') as HTMLElement
        expect(line).not.toBeNull()
        expect(line.style.top).toBe('88px')
    })

    // FR-007. 선의 시작 x가 놓였을 때의 깊이와 일치해야 한다.
    test('목표 깊이만큼 들여쓴다', () => {
        const {container} = render(<TableDropIndicator intent={intent({depth: 2, indentOffsetPx: 44})}/>)

        const line = container.querySelector('.TableDropIndicator') as HTMLElement
        expect(line.style.left).toBe('44px')
    })
})
