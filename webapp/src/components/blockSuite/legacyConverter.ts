// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import * as Y from 'yjs'

import {Block, ContentBlockTypes} from '../../blocks/block'
import {Card} from '../../blocks/card'

type BlockSuiteBlockType =
    | 'affine:paragraph'
    | 'affine:list'
    | 'affine:divider'
    | 'affine:image'
    | 'affine:embed'
    | 'affine:attachment'

interface BlockSuiteProps {
    type?: string
    checked?: boolean
    sourceId?: string
    filename?: string
    width?: number
    height?: number
    size?: number
}

interface ConvertedBlock {
    id: string
    type: BlockSuiteBlockType
    originalType: ContentBlockTypes
    props: BlockSuiteProps
    text?: string
    createdAt: number
    updatedAt: number
}

const BLOCK_TYPE_MAP: Record<ContentBlockTypes, {type: BlockSuiteBlockType; props: BlockSuiteProps}> = {
    'text': {type: 'affine:paragraph', props: {type: 'text'}},
    'h1': {type: 'affine:paragraph', props: {type: 'h1'}},
    'h2': {type: 'affine:paragraph', props: {type: 'h2'}},
    'h3': {type: 'affine:paragraph', props: {type: 'h3'}},
    'quote': {type: 'affine:paragraph', props: {type: 'quote'}},
    'checkbox': {type: 'affine:list', props: {type: 'todo'}},
    'list-item': {type: 'affine:list', props: {type: 'bulleted'}},
    'divider': {type: 'affine:divider', props: {}},
    'image': {type: 'affine:image', props: {}},
    'video': {type: 'affine:embed', props: {type: 'video'}},
    'attachment': {type: 'affine:attachment', props: {}},
}

function convertBlockToBlockSuite(block: Block): ConvertedBlock {
    const blockType = block.type as ContentBlockTypes
    const mapping = BLOCK_TYPE_MAP[blockType] || BLOCK_TYPE_MAP.text
    const fields = block.fields || {}

    const result: ConvertedBlock = {
        id: block.id,
        type: mapping.type,
        originalType: blockType,
        props: {...mapping.props},
        createdAt: block.createAt || Date.now(),
        updatedAt: block.updateAt || Date.now(),
    }

    switch (blockType) {
    case 'text':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'quote':
        result.text = block.title || ''
        break

    case 'checkbox':
        result.text = block.title || ''
        result.props.checked = Boolean(fields.value)
        break

    case 'list-item':
        result.text = block.title || ''
        break

    case 'divider':
        break

    case 'image':
        result.props.sourceId = fields.fileId || ''
        result.props.filename = fields.filename || 'image'
        result.props.width = fields.width || 0
        result.props.height = fields.height || 0
        break

    case 'video':
        result.props.sourceId = fields.fileId || ''
        result.props.filename = fields.filename || 'video'
        break

    case 'attachment':
        result.props.sourceId = fields.fileId || ''
        result.props.filename = fields.filename || 'file'
        result.props.size = fields.size || 0
        break

    default:
        result.text = block.title || ''
    }

    return result
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

export function convertLegacyBlocksToYjsDoc(
    blocks: Block[],
    card: Card,
): Y.Doc {
    const yDoc = new Y.Doc()
    const yBlocks = yDoc.getMap('blocks')
    const yMeta = yDoc.getMap('meta')

    const contentOrder = card.fields?.contentOrder || []
    const sortedBlocks = sortBlocksByContentOrder(blocks, contentOrder)

    const blockOrder = sortedBlocks.map((b) => b.id)
    yMeta.set('blockOrder', blockOrder)
    yMeta.set('cardId', card.id)
    yMeta.set('cardTitle', card.title || '')

    sortedBlocks.forEach((block) => {
        const yBlock = new Y.Map()
        const converted = convertBlockToBlockSuite(block)

        yBlock.set('id', converted.id)
        yBlock.set('type', converted.type)
        yBlock.set('originalType', converted.originalType)
        yBlock.set('props', converted.props)
        yBlock.set('createdAt', converted.createdAt)
        yBlock.set('updatedAt', converted.updatedAt)

        if (converted.text !== undefined) {
            yBlock.set('text', converted.text)
        }

        yBlocks.set(block.id, yBlock)
    })

    return yDoc
}

export function createEmptyYjsDoc(card: Card): Y.Doc {
    const yDoc = new Y.Doc()
    const yMeta = yDoc.getMap('meta')

    yMeta.set('blockOrder', [])
    yMeta.set('cardId', card.id)
    yMeta.set('cardTitle', card.title || '')

    return yDoc
}

export {convertBlockToBlockSuite, sortBlocksByContentOrder}
export type {ConvertedBlock, BlockSuiteBlockType, BlockSuiteProps}
