// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


// Disable console log
console.log = jest.fn()

import {Block} from './blocks/block'
import {createCard} from './blocks/card'
import octoClient from './octoClient'
import 'isomorphic-fetch'
import {FetchMock} from './test/fetchMock'

global.fetch = FetchMock.fn

beforeEach(() => {
    FetchMock.fn.mockReset()
})

test('OctoClient: get blocks', async () => {
    const blocks = createBlocks()

    FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(blocks)))
    let boards = await octoClient.getBlocksWithType('card')
    expect(boards.length).toBe(blocks.length)

    FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(blocks)))
    let response = await octoClient.exportBoardArchive('board')
    expect(response.status).toBe(200)

    FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(blocks)))
    response = await octoClient.exportFullArchive('team')
    expect(response.status).toBe(200)

    FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(blocks)))
    const parentId = 'id1'
    boards = await octoClient.getBlocksWithParent(parentId)
    expect(boards.length).toBe(blocks.length)

    FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(blocks)))
    boards = await octoClient.getBlocksWithParent(parentId, 'card')
    expect(boards.length).toBe(blocks.length)
})

test('OctoClient: insert blocks', async () => {
    const blocks = createBlocks()

    await octoClient.insertBlocks('board-id', blocks)

    expect(FetchMock.fn).toBeCalledTimes(1)
    expect(FetchMock.fn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(blocks),
        }))
})

test('OctoClient: importFullArchive', async () => {
    const archive = new File([''], 'test')

    await octoClient.importFullArchive(archive)

    expect(FetchMock.fn).toBeCalledTimes(1)
    expect(FetchMock.fn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
            method: 'POST',
        }))
})

test('OctoClient: get cards by ids', async () => {
    const cards = createBlocks()
    const apiCards = [
        {
            id: 'api-card-1',
            boardId: 'board-id',
            parentCardId: '',
            depth: 0,
            createdBy: 'user-1',
            modifiedBy: 'user-1',
            title: 'api card one',
            contentOrder: ['content-1'],
            icon: '📌',
            isTemplate: false,
            properties: {prop: 'value'},
            createAt: 100,
            updateAt: 100,
            deleteAt: 0,
        },
    ]
    const boardID = 'board-id'
    const cardIDs = ['card-1', 'card-2']

    FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(cards)))
    const fetchedCards = await octoClient.getCardsByIDs(boardID, cardIDs)
    expect(fetchedCards.length).toBe(cards.length)
    expect(FetchMock.fn).toBeCalledWith(
        'http://localhost/api/v2/boards/board-id/cards/by-ids',
        expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ids: cardIDs}),
        }),
    )

    FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify(apiCards)))
    const fetchedFromApiCards = await octoClient.getCardsByIDs(boardID, cardIDs)
    expect(fetchedFromApiCards.length).toBe(1)
    expect(fetchedFromApiCards[0]).toEqual(expect.objectContaining({
        id: 'api-card-1',
        boardId: boardID,
        parentId: boardID,
        type: 'card',
        title: 'api card one',
        fields: expect.objectContaining({
            icon: '📌',
            parentCardId: '',
            depth: 0,
            contentOrder: ['content-1'],
            properties: {prop: 'value'},
            isTemplate: false,
        }),
    }))

    FetchMock.fn.mockReset()
    const emptyCards = await octoClient.getCardsByIDs(boardID, [])
    expect(emptyCards).toEqual([])
    expect(FetchMock.fn).not.toBeCalled()
})

function createBlocks(): Block[] {
    const blocks = []

    for (let i = 0; i < 5; i++) {
        const block = createCard()
        block.id = `block${i + 1}`
        blocks.push(block)
    }

    return blocks
}

test('OctoClient: GetFileInfo', async () => {
    FetchMock.fn.mockReturnValueOnce(FetchMock.jsonResponse(JSON.stringify({
        name: 'test.txt',
        size: 2300,
        extension: '.txt',
    })))
    await octoClient.getFileInfo('board-id', 'file-id')
    expect(FetchMock.fn).toBeCalledTimes(1)
    expect(FetchMock.fn).toHaveBeenCalledWith(
        'http://localhost/api/v2/files/teams/0/board-id/file-id/info',
        expect.objectContaining({
            headers: {
                Accept: 'application/json',
                Authorization: '',
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            }}))
})
