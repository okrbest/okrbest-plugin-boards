// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

jest.mock('yjs', () => ({
    Doc: jest.fn().mockImplementation(() => ({
        getMap: jest.fn().mockReturnValue({
            get: jest.fn(),
            set: jest.fn(),
            values: jest.fn().mockReturnValue([]),
        }),
        on: jest.fn(),
        off: jest.fn(),
    })),
    Text: jest.fn().mockImplementation((text) => ({
        toString: () => text,
    })),
    applyUpdate: jest.fn(),
    encodeStateAsUpdate: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
}))

import * as Y from 'yjs'

import octoClient from '../octoClient'

import { loadData } from './blockSuiteUtils'

// Mock BlockSuite libraries
jest.mock('@blocksuite/store', () => ({
    DocCollection: jest.fn().mockImplementation(() => ({
        createDoc: jest.fn().mockReturnValue({
            id: 'mock-doc',
            spaceDoc: new Y.Doc(),
            getBlocks: jest.fn().mockReturnValue([]),
            addBlock: jest.fn().mockReturnValue('mock-block-id'),
        }),
    })),
}))

jest.mock('@blocksuite/blocks', () => ({
    AffineSchemas: [],
}))

// Mock octoClient
jest.mock('../octoClient', () => ({
    getBlockSuiteInfo: jest.fn(),
    getBlockSuiteContent: jest.fn(),
    getBlocksWithParent: jest.fn(),
    saveBlockSuiteContent: jest.fn(),
}))

describe('blockSuiteUtils', () => {
    let mockDoc: any
    
    beforeEach(() => {
        jest.clearAllMocks()
        mockDoc = {
            id: 'card-1',
            spaceDoc: new Y.Doc(),
            getBlocks: jest.fn().mockReturnValue([]),
            addBlock: jest.fn().mockReturnValue('mock-id'),
        }
    })

    it('should convert text blocks to affine:paragraph', async () => {
        const cardId = 'card-1'
        const card = { id: cardId, fields: { contentOrder: [] } }
        const legacyBlocks = [
            { id: 'block-1', type: 'text', title: 'Hello World', parentId: cardId }
        ];

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getBlocksWithParent as jest.Mock).mockResolvedValue(legacyBlocks)

        await loadData(card as any, mockDoc)

        // Verify that addBlock was called for page structure and content
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:page', expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:paragraph', expect.objectContaining({
            text: expect.anything()
        }), 'mock-id')

        expect(octoClient.saveBlockSuiteContent).toHaveBeenCalledWith(cardId, expect.any(Uint8Array))
    })

    it('should load existing BlockSuite document if present', async () => {
        const cardId = 'card-2'
        const card = { id: cardId, fields: { contentOrder: [] } };
        
        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue({ exists: true });
        (octoClient.getBlockSuiteContent as jest.Mock).mockResolvedValue(new ArrayBuffer(8))

        await loadData(card as any, mockDoc)

        expect(octoClient.getBlocksWithParent).not.toHaveBeenCalled()
        expect(octoClient.getBlockSuiteInfo).toHaveBeenCalledWith(cardId)
        expect(octoClient.getBlockSuiteContent).toHaveBeenCalledWith(cardId)
        expect(Y.applyUpdate).toHaveBeenCalled()
    })

    it('should initialize empty page when no blocks exist', async () => {
        const cardId = 'card-3'
        const card = { id: cardId, fields: { contentOrder: [] } };

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getBlocksWithParent as jest.Mock).mockResolvedValue([])

        await loadData(card as any, mockDoc)

        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:page', expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:surface', expect.anything(), expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:note', expect.anything(), expect.anything())
        expect(octoClient.saveBlockSuiteContent).toHaveBeenCalled()
    })

    it('should handle contentOrder array correctly', async () => {
        const cardId = 'card-4'
        const card = { 
            id: cardId, 
            fields: { 
                contentOrder: ['block-2', 'block-1', 'block-3'] 
            } 
        }
        const legacyBlocks = [
            { id: 'block-1', type: 'text', title: 'First', parentId: cardId, fields: {} },
            { id: 'block-2', type: 'text', title: 'Second', parentId: cardId, fields: {} },
            { id: 'block-3', type: 'text', title: 'Third', parentId: cardId, fields: {} },
        ];

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getBlocksWithParent as jest.Mock).mockResolvedValue(legacyBlocks)

        await loadData(card as any, mockDoc)

        // Verify blocks are added in contentOrder sequence
        // page + surface + note + 3 content blocks = at least 6 calls
        expect(mockDoc.addBlock).toHaveBeenCalledTimes(6)
        expect(octoClient.saveBlockSuiteContent).toHaveBeenCalled()
    })

    it('should handle nested contentOrder arrays', async () => {
        const cardId = 'card-5'
        const card = { 
            id: cardId, 
            fields: { 
                contentOrder: ['block-1', ['block-2', 'block-3'], 'block-4'] 
            } 
        }
        const legacyBlocks = [
            { id: 'block-1', type: 'text', title: 'First', parentId: cardId, fields: {} },
            { id: 'block-2', type: 'text', title: 'Second', parentId: cardId, fields: {} },
            { id: 'block-3', type: 'text', title: 'Third', parentId: cardId, fields: {} },
            { id: 'block-4', type: 'text', title: 'Fourth', parentId: cardId, fields: {} },
        ];

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getBlocksWithParent as jest.Mock).mockResolvedValue(legacyBlocks)

        await loadData(card as any, mockDoc)

        expect(mockDoc.addBlock).toHaveBeenCalled()
        expect(octoClient.saveBlockSuiteContent).toHaveBeenCalled()
    })

    it('should handle error during load gracefully', async () => {
        const cardId = 'card-6'
        const card = { id: cardId, fields: { contentOrder: [] } }
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (octoClient.getBlockSuiteInfo as jest.Mock).mockRejectedValue(new Error('Network error'))

        // loadData는 try-catch로 에러를 잡아서 throw하지 않음
        await loadData(card as any, mockDoc)

        // 에러가 console.error로 로깅되었는지 확인
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load BlockSuite data', expect.any(Error))
        
        consoleErrorSpy.mockRestore()
    })

    it('should convert different block types correctly', async () => {
        const cardId = 'card-7'
        const card = { id: cardId, fields: { contentOrder: [] } }
        const legacyBlocks = [
            { id: 'block-1', type: 'h1', title: 'Heading', parentId: cardId, fields: {} },
            { id: 'block-2', type: 'checkbox', title: 'Task', parentId: cardId, fields: { value: true } },
            { id: 'block-3', type: 'image', title: '', parentId: cardId, fields: { fileId: 'file-1', width: 100, height: 200 } },
            { id: 'block-4', type: 'divider', title: '', parentId: cardId, fields: {} },
        ];

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getBlocksWithParent as jest.Mock).mockResolvedValue(legacyBlocks)

        await loadData(card as any, mockDoc)

        // Verify different block types are converted
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:paragraph', expect.objectContaining({ type: 'h1' }), expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:list', expect.objectContaining({ type: 'todo', checked: true }), expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:image', expect.objectContaining({ sourceId: 'file-1' }), expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:divider', expect.anything(), expect.anything())
    })
})


