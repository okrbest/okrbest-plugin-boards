// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {BlockSnapshot, DocSnapshot} from '@blocksuite/store'

import {Card} from '../../blocks/card'
import {Utils, IDType} from '../../utils'

export function createEmptyDocSnapshot(card: Card): DocSnapshot {
    const pageId = `page:${card.id}`
    const surfaceId = Utils.createGuid(IDType.None)
    const noteId = Utils.createGuid(IDType.None)
    const paragraphId = Utils.createGuid(IDType.None)

    const emptyParagraph: BlockSnapshot = {
        type: 'block',
        id: paragraphId,
        flavour: 'affine:paragraph',
        props: {
            type: 'text',
            text: {
                '$blocksuite:internal:text$': true,
                delta: [],
            },
        },
        children: [],
    }

    const noteBlock: BlockSnapshot = {
        type: 'block',
        id: noteId,
        flavour: 'affine:note',
        props: {
            xywh: '[0,0,800,600]',
            background: '--affine-background-secondary-color',
            index: 'a0',
            hidden: false,
            displayMode: 'both',
        },
        children: [emptyParagraph],
    }

    const surfaceBlock: BlockSnapshot = {
        type: 'block',
        id: surfaceId,
        flavour: 'affine:surface',
        props: {
            elements: {},
        },
        children: [],
    }

    const pageBlock: BlockSnapshot = {
        type: 'block',
        id: pageId,
        flavour: 'affine:page',
        props: {
            title: {
                '$blocksuite:internal:text$': true,
                delta: card.title ? [{insert: card.title}] : [],
            },
        },
        children: [surfaceBlock, noteBlock],
    }

    return {
        type: 'page',
        meta: {
            id: card.id,
            title: card.title || '',
            createDate: card.createAt || Date.now(),
            tags: [],
        },
        blocks: pageBlock,
    }
}
