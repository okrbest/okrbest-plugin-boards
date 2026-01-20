// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import { Card } from '../../blocks/card'

import { EditorProvider } from './EditorProvider'
import { EditorContainer } from './EditorContainer'

interface Props {
    card: Card;
    boardId: string;
    readOnly?: boolean;
}

/**
 * BlockSuite 에디터 메인 컴포넌트
 * EditorProvider와 EditorContainer를 조합하여 사용
 */
export const BlockSuiteEditor: React.FC<Props> = ({ 
    card, 
    boardId, 
    readOnly = false 
}) => {
    return (
        <EditorProvider card={card} boardId={boardId} readOnly={readOnly}>
            <EditorContainer boardId={boardId} readOnly={readOnly} />
        </EditorProvider>
    )
}
