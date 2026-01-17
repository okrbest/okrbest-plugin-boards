// Mock Yjs before any imports
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
}));

import * as Y from 'yjs';
import { loadData } from './blockSuiteUtils';
import octoClient from '../octoClient';

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
}));

jest.mock('@blocksuite/blocks', () => ({
    AffineSchemas: [],
}));

// Mock octoClient
jest.mock('../octoClient', () => ({
    getBlockSuiteInfo: jest.fn(),
    getBlockSuiteContent: jest.fn(),
    getBlocksWithParent: jest.fn(),
    saveBlockSuiteContent: jest.fn(),
}));

describe('blockSuiteUtils', () => {
    let mockDoc: any;
    
    beforeEach(() => {
        jest.clearAllMocks();
        mockDoc = {
            id: 'card-1',
            spaceDoc: new Y.Doc(),
            getBlocks: jest.fn().mockReturnValue([]),
            addBlock: jest.fn().mockReturnValue('mock-id'),
        };
    });

    it('should convert text blocks to affine:paragraph', async () => {
        const cardId = 'card-1';
        const legacyBlocks = [
            { id: 'block-1', type: 'text', title: 'Hello World', parentId: cardId }
        ];

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getBlocksWithParent as jest.Mock).mockResolvedValue(legacyBlocks);

        await loadData(cardId, mockDoc);

        // Verify that addBlock was called for page structure and content
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:page', expect.anything());
        expect(mockDoc.addBlock).toHaveBeenCalledWith('affine:paragraph', expect.objectContaining({
            text: expect.any(Object) // Mocked Y.Text
        }), 'mock-id');

        expect(octoClient.saveBlockSuiteContent).toHaveBeenCalledWith(cardId, expect.any(Uint8Array));
    });

    it('should load existing BlockSuite document if present', async () => {
        const cardId = 'card-2';
        
        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue({ exists: true });
        (octoClient.getBlockSuiteContent as jest.Mock).mockResolvedValue(new ArrayBuffer(8));

        await loadData(cardId, mockDoc);

        expect(octoClient.getBlocksWithParent).not.toHaveBeenCalled();
        expect(octoClient.getBlockSuiteInfo).toHaveBeenCalledWith(cardId);
        expect(octoClient.getBlockSuiteContent).toHaveBeenCalledWith(cardId);
        expect(Y.applyUpdate).toHaveBeenCalled();
    });
});


