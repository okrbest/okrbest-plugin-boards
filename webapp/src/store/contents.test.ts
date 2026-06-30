// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ContentBlock} from '../blocks/contentBlock'
import {TestBlockFactory} from '../test/testBlockFactory'

import {getCardContents} from './contents'
import {RootState} from './index'

describe('store/contents selectors', () => {
    const setupState = (cardId: string, contentOrder: Array<string|string[]>|undefined, contents: ContentBlock[]) => {
        const board = TestBlockFactory.createBoard()
        const card = TestBlockFactory.createCard(board)
        card.id = cardId
        card.fields.contentOrder = contentOrder

        const contentsById: {[key: string]: ContentBlock} = {}
        for (const content of contents) {
            contentsById[content.id] = content
        }

        return {
            cards: {
                cards: {
                    [card.id]: card,
                },
                templates: {},
            },
            contents: {
                contents: contentsById,
                contentsByCard: {
                    [card.id]: contents,
                },
            },
        } as unknown as RootState
    }

    test('returns empty array when content order is missing', () => {
        const state = setupState('card-empty-order', undefined, [])

        const result = getCardContents('card-empty-order')(state)

        expect(result).toEqual([])
    })

    test('keeps nested order shape even when all referenced contents are missing', () => {
        const state = setupState('card-missing-contents', ['missing-flat', ['missing-nested']], [])

        const result = getCardContents('card-missing-contents')(state)

        expect(result).toEqual([[]])
    })

    test('maps contents according to ordered ids including nested groups', () => {
        const board = TestBlockFactory.createBoard()
        const card = TestBlockFactory.createCard(board)
        card.id = 'card-ordered'

        const contentA = TestBlockFactory.createText(card)
        const contentB = TestBlockFactory.createText(card)
        contentA.id = 'content-a'
        contentB.id = 'content-b'
        card.fields.contentOrder = ['content-b', ['content-a']]

        const state = setupState(card.id, card.fields.contentOrder, [contentA, contentB])

        const result = getCardContents(card.id)(state)

        expect(result[0]).toEqual(contentB)
        expect(result[1]).toEqual([contentA])
    })
})
