// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useEffect, useRef, useState } from 'react'
import { DocCollection, Schema } from '@blocksuite/store'
import { AffineEditorContainer } from '@blocksuite/presets'
import { AffineSchemas } from '@blocksuite/blocks'
import * as Y from 'yjs'

import { loadData } from '../../utils/blockSuiteUtils'
import octoClient from '../../octoClient'
import { Card } from '../../blocks/card'

// import '@blocksuite/presets/themes/affine.css'
import './BlockSuiteEditor.scss'

interface Props {
    card: Card;
    boardId: string;
    readOnly?: boolean;
}

export const BlockSuiteEditor: React.FC<Props> = ({ card, boardId, readOnly }) => {
    const cardId = card.id
    const containerRef = useRef<HTMLDivElement>(null)
    const [doc, setDoc] = useState<any>(null)

    // 1. 초기화 및 에디터 마운트
    useEffect(() => {
        if (!containerRef.current) return

        // 기존 에디터 인스턴스 정리 (중복 생성 방지)
        containerRef.current.innerHTML = ''

        const schema = new Schema()
        schema.register(AffineSchemas)
        const collection = new DocCollection({ schema })
        const newDoc = collection.createDoc({ id: cardId })
        setDoc(newDoc)

        const editor = new AffineEditorContainer()
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
        
        const loadCardData = async () => {
            try {
                await loadData(card, doc)
            } catch (e) {
                console.error("Failed to load BlockSuite data in editor", e)
            }
        }
        
        loadCardData()
    }, [doc, card])

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
