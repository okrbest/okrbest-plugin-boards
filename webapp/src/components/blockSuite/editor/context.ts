// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { AffineEditorContainer } from '@blocksuite/presets'
import { Doc, DocCollection } from '@blocksuite/store'
import { createContext, useContext } from 'react'

import { Card } from '../../../blocks/card'

export interface EditorContextValue {
    editor: AffineEditorContainer | null;
    doc: Doc | null;
    collection: DocCollection | null;
    card: Card | null;
    isLoading: boolean;
    saveStatus: 'saved' | 'saving' | 'error' | null;
}

export const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditor() {
    const context = useContext(EditorContext)
    if (!context) {
        throw new Error('useEditor must be used within EditorProvider')
    }
    return context
}
