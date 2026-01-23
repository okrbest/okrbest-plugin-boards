// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {BlockSnapshot, DocSnapshot} from '@blocksuite/store'

import {Block, ContentBlockTypes} from '../../blocks/block'
import {Card} from '../../blocks/card'
import {Utils, IDType} from '../../utils'

type BlockSuiteFlavour =
    | 'affine:page'
    | 'affine:surface'
    | 'affine:note'
    | 'affine:paragraph'
    | 'affine:list'
    | 'affine:divider'
    | 'affine:image'

const CONTENT_TYPE_TO_FLAVOUR: Record<ContentBlockTypes, BlockSuiteFlavour> = {
    'text': 'affine:paragraph',
    'h1': 'affine:paragraph',
    'h2': 'affine:paragraph',
    'h3': 'affine:paragraph',
    'quote': 'affine:paragraph',
    'checkbox': 'affine:list',
    'list-item': 'affine:list',
    'divider': 'affine:divider',
    'image': 'affine:image',
    'video': 'affine:paragraph',
    'attachment': 'affine:paragraph',
}

function convertContentBlockToSnapshot(block: Block): BlockSnapshot {
    const blockType = block.type as ContentBlockTypes
    const flavour = CONTENT_TYPE_TO_FLAVOUR[blockType] || 'affine:paragraph'
    const fields = block.fields || {}

    const snapshot: BlockSnapshot = {
        type: 'block',
        id: block.id,
        flavour,
        props: {},
        children: [],
    }

    switch (blockType) {
    case 'text':
        snapshot.props = {
            type: 'text',
            text: {
                '$blocksuite:internal:text$': true,
                delta: block.title ? [{insert: block.title}] : [],
            },
        }
        break

    case 'h1':
    case 'h2':
    case 'h3':
        snapshot.props = {
            type: blockType,
            text: {
                '$blocksuite:internal:text$': true,
                delta: block.title ? [{insert: block.title}] : [],
            },
        }
        break

    case 'quote':
        snapshot.props = {
            type: 'quote',
            text: {
                '$blocksuite:internal:text$': true,
                delta: block.title ? [{insert: block.title}] : [],
            },
        }
        break

    case 'checkbox':
        snapshot.props = {
            type: 'todo',
            checked: Boolean(fields.value),
            text: {
                '$blocksuite:internal:text$': true,
                delta: block.title ? [{insert: block.title}] : [],
            },
        }
        break

    case 'list-item':
        snapshot.props = {
            type: 'bulleted',
            text: {
                '$blocksuite:internal:text$': true,
                delta: block.title ? [{insert: block.title}] : [],
            },
        }
        break

    case 'divider':
        snapshot.props = {}
        break

    case 'image':
        snapshot.props = {
            sourceId: fields.fileId || '',
            width: fields.width || 0,
            height: fields.height || 0,
        }
        break

    case 'video':
    case 'attachment':
        snapshot.props = {
            type: 'text',
            text: {
                '$blocksuite:internal:text$': true,
                delta: [{insert: `[${blockType}: ${fields.filename || 'file'}]`}],
            },
        }
        break

    default:
        snapshot.props = {
            type: 'text',
            text: {
                '$blocksuite:internal:text$': true,
                delta: block.title ? [{insert: block.title}] : [],
            },
        }
    }

    return snapshot
}

function sortBlocksByContentOrder(blocks: Block[], contentOrder: Array<string | string[]>): Block[] {
    const flatOrder = contentOrder.flatMap((item) =>
        (Array.isArray(item) ? item : [item]),
    )

    return [...blocks].sort((a, b) => {
        const aIndex = flatOrder.indexOf(a.id)
        const bIndex = flatOrder.indexOf(b.id)
        if (aIndex === -1 && bIndex === -1) {
            return 0
        }
        if (aIndex === -1) {
            return 1
        }
        if (bIndex === -1) {
            return -1
        }
        return aIndex - bIndex
    })
}

export function convertLegacyBlocksToDocSnapshot(
    blocks: Block[],
    card: Card,
): DocSnapshot {
    const contentOrder = card.fields?.contentOrder || []
    const sortedBlocks = sortBlocksByContentOrder(blocks, contentOrder)

    const pageId = `page:${card.id}`
    const surfaceId = Utils.createGuid(IDType.None)
    const noteId = Utils.createGuid(IDType.None)

    const contentChildren = sortedBlocks.map((block) =>
        convertContentBlockToSnapshot(block),
    )

    if (contentChildren.length === 0) {
        contentChildren.push({
            type: 'block',
            id: Utils.createGuid(IDType.None),
            flavour: 'affine:paragraph',
            props: {
                type: 'text',
                text: {
                    '$blocksuite:internal:text$': true,
                    delta: [],
                },
            },
            children: [],
        })
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
        children: contentChildren,
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

export {sortBlocksByContentOrder}
export type {BlockSuiteFlavour}
