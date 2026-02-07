// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import {Block, createBlock} from './block'

type CardFields = {
    icon?: string
    isTemplate?: boolean
    properties: Record<string, string | string[]>
    contentOrder?: Array<string | string[]>
    parentCardId?: string
    depth?: number
}

type Card = Block & {
    fields: CardFields
}

function createCard(block?: Block): Card {
    const contentIds = block?.fields?.contentOrder?.filter((id: any) => id !== null)
    let contentOrder: Array<string|string[]> | undefined

    if (contentIds?.length > 0) {
        contentOrder = []
        for (const contentId of contentIds) {
            if (typeof contentId === 'string') {
                contentOrder.push(contentId)
            } else {
                contentOrder.push(contentId.slice())
            }
        }
    }
    return {
        ...createBlock(block),
        type: 'card',
        fields: {
            icon: block?.fields.icon || '',
            properties: {...(block?.fields.properties || {})},
            contentOrder,
            isTemplate: block?.fields.isTemplate || false,
            parentCardId: block?.fields.parentCardId || '',
            depth: block?.fields.depth || 0,
        },
    }
}

export {Card, createCard}
