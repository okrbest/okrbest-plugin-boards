// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useRef, useState } from 'react'
import { DocCollection } from '@blocksuite/store'
import { EditorContainer } from '@blocksuite/presets'
import { AffineSchemas } from '@blocksuite/blocks'
import * as Y from 'yjs'

import { loadData } from '../../utils/blockSuiteUtils'
import octoClient from '../../octoClient'

import '@blocksuite/presets/themes/affine.css'
import './BlockSuiteEditor.scss'

interface Props {
    cardId: string;
    boardId: string;
    readOnly?: boolean;
}

export const BlockSuiteEditor: React.FC<Props> = ({ cardId, boardId, readOnly }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [doc, setDoc] = useState<any>(null)

    // 1. 초기화 및 에디터 마운트
    useEffect(() => {
        if (!containerRef.current) return

        // 기존 에디터 인스턴스 정리 (중복 생성 방지)
        containerRef.current.innerHTML = ''

        const collection = new DocCollection({ schema: AffineSchemas })
        const newDoc = collection.createDoc({ id: cardId })
        setDoc(newDoc)

        const editor = new EditorContainer()
        editor.doc = newDoc
        containerRef.current.appendChild(editor)

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = ''
            }
        }
    }, [cardId])

    // 2. 데이터 로드
    useEffect(() => {
        if (!doc) return
        loadData(cardId, doc)
    }, [doc, cardId])

    // 3. 자동 저장 (Debounce 권장)
    useEffect(() => {
        if (!doc || readOnly) return
        
        let timeout: NodeJS.Timeout
        const handleUpdate = () => {
            clearTimeout(timeout)
            timeout = setTimeout(async () => {
                const snapshot = Y.encodeStateAsUpdate(doc.spaceDoc)
                try {
                    await octoClient.saveBlockSuiteContent(cardId, snapshot)
                    console.log(`Saved BlockSuite content for card ${cardId}`)
                } catch (e) {
                    console.error("Failed to auto-save BlockSuite content", e)
                }
            }, 2000) // 2초 Debounce
        }

        doc.spaceDoc.on('update', handleUpdate)
        return () => {
            doc.spaceDoc.off('update', handleUpdate)
            clearTimeout(timeout)
        }
    }, [doc, cardId, readOnly])

    return <div ref={containerRef} className="blocksuite-editor-wrapper" />
}
