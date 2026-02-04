// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import octoClient from '../octoClient'

import { loadData } from './blockSuiteUtils'

// Mock BlockSuite libraries
const mockJobDocToSnapshot = jest.fn().mockResolvedValue({ meta: {}, blocks: {} })
const mockJobSnapshotToDoc = jest.fn().mockResolvedValue({ id: 'restored-doc' })

jest.mock('@blocksuite/store', () => {
    return {
        DocCollection: jest.fn().mockImplementation(() => ({
            createDoc: jest.fn().mockReturnValue({
                id: 'mock-doc',
                collection: {},
                getBlocks: jest.fn().mockReturnValue([]),
                addBlock: jest.fn().mockReturnValue('mock-block-id'),
                load: jest.fn(),
            }),
        })),
        Job: jest.fn().mockImplementation(() => ({
            docToSnapshot: mockJobDocToSnapshot,
            snapshotToDoc: mockJobSnapshotToDoc,
        })),
        Text: jest.fn().mockImplementation((text) => ({
            toString: () => text || '',
        })),
    }
})

jest.mock('@blocksuite/blocks', () => ({
    AffineSchemas: [],
}))

// Mock octoClient
jest.mock('../octoClient', () => ({
    getBlockSuiteInfo: jest.fn(),
    getBlockSuiteContent: jest.fn(),
    getBlocksWithParent: jest.fn(),
    getAllBlocks: jest.fn(),
    saveBlockSuiteContent: jest.fn(),
}))

describe.skip('blockSuiteUtils', () => {
    let mockDoc: any
    
    beforeEach(() => {
        jest.clearAllMocks()
        mockDoc = {
            id: 'card-1',
            collection: {},
            getBlocks: jest.fn().mockReturnValue([]),
            addBlock: jest.fn().mockReturnValue('mock-id'),
            deleteBlock: jest.fn(),
            load: jest.fn(),
        }
    })

    it('should convert text blocks to affine:paragraph', async () => {
        const cardId = 'card-1'
        const card = { id: cardId, fields: { contentOrder: [] } }
        const legacyBlocks = [
            { id: 'block-1', type: 'text', title: 'Hello World', parentId: cardId }
        ];

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getAllBlocks as jest.Mock).mockResolvedValue(legacyBlocks);
        (octoClient.getBlocksWithParent as jest.Mock).mockResolvedValue(legacyBlocks)

        await loadData(card as any, mockDoc)

        // Verify that addBlock was called for page structure and content
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:page', expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:paragraph', expect.objectContaining({
            text: expect.anything()
        }), 'mock-id')

        // Should save snapshot
        expect(mockJobDocToSnapshot).toHaveBeenCalledWith(mockDoc)
        expect(octoClient.saveBlockSuiteContent).toHaveBeenCalledWith(cardId, expect.anything())
    })

    it('should load existing BlockSuite document if present', async () => {
        const cardId = 'card-2'
        const card = { id: cardId, fields: { contentOrder: [] } }
        const snapshot = {
            blocks: {
                flavour: 'affine:page',
                props: {},
                children: [
                    {
                        flavour: 'affine:surface',
                        props: {},
                        children: []
                    },
                    {
                        flavour: 'affine:note',
                        props: {},
                        children: [
                            {
                                flavour: 'affine:paragraph',
                                props: {
                                    text: {
                                        delta: [{ insert: 'Test content' }]
                                    }
                                },
                                children: []
                            }
                        ]
                    }
                ]
            }
        };

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue({ exists: true });
        (octoClient.getBlockSuiteContent as jest.Mock).mockResolvedValue(JSON.stringify(snapshot))

        const resultDoc = await loadData(card as any, mockDoc)

        expect(octoClient.getBlockSuiteInfo).toHaveBeenCalledWith(cardId)
        expect(octoClient.getBlockSuiteContent).toHaveBeenCalledWith(cardId)

        // loadSnapshotIntoDoc는 기존 doc에 블록을 추가하므로 mockDoc의 addBlock이 호출되어야 함
        expect(mockDoc.addBlock).toHaveBeenCalled()
        expect(resultDoc).toEqual(mockDoc)
    })

    it('should initialize empty page when no blocks exist', async () => {
        const cardId = 'card-3'
        const card = { id: cardId, fields: { contentOrder: [] } };

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getAllBlocks as jest.Mock).mockResolvedValue([]);
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
        (octoClient.getAllBlocks as jest.Mock).mockResolvedValue(legacyBlocks);
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
        (octoClient.getAllBlocks as jest.Mock).mockResolvedValue(legacyBlocks);
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

        // 에러가 console.error로 로깅되었는지 확인 (새로운 에러 메시지 형식)
        expect(consoleErrorSpy).toHaveBeenCalledWith('[BlockSuite Migration] ❌ CRITICAL ERROR in loadData:', expect.any(Error))

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
        (octoClient.getAllBlocks as jest.Mock).mockResolvedValue(legacyBlocks);
        (octoClient.getBlocksWithParent as jest.Mock).mockResolvedValue(legacyBlocks)

        await loadData(card as any, mockDoc)

        // Verify different block types are converted
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:paragraph', expect.objectContaining({ type: 'h1' }), expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:list', expect.objectContaining({ type: 'todo', checked: true }), expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:image', expect.objectContaining({ sourceId: 'file-1' }), expect.anything())
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:divider', expect.anything(), expect.anything())
    })
})


