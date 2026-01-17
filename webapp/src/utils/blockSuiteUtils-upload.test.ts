// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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
}))

import octoClient from '../octoClient'

import { uploadImageToBlockSuite, getImageUrl } from './blockSuiteUtils'

// Mock octoClient
jest.mock('../octoClient', () => ({
    uploadFile: jest.fn(),
    getBaseURL: jest.fn(() => 'http://localhost'),
}))

// Mock BlockSuite Doc
const createMockDoc = () => ({
    addBlock: jest.fn().mockReturnValue('mock-block-id'),
    getBlocks: jest.fn().mockReturnValue([]),
})

describe('blockSuiteUtils - File Upload', () => {
    let mockDoc: any
    
    beforeEach(() => {
        jest.clearAllMocks()
        mockDoc = createMockDoc()
    })

    describe('uploadImageToBlockSuite', () => {
        it('should upload image and create BlockSuite image block', async () => {
            const mockFile = new File(['image content'], 'test.png', { type: 'image/png' })
            const boardId = 'board-1'
            const noteId = 'note-id-1';

            (octoClient.uploadFile as jest.Mock).mockResolvedValue('file-id-123')

            // Mock Image constructor for getImageSize - trigger onload when src is set
            let onloadHandler: (() => void) | null = null
            global.Image = jest.fn().mockImplementation(() => {
                const img: any = {
                    width: 800,
                    height: 600,
                    get onload() { return onloadHandler },
                    set onload(handler: (() => void) | null) { 
                        onloadHandler = handler
                    },
                    onerror: null,
                    _src: '',
                    get src() { return this._src },
                    set src(value: string) {
                        this._src = value
                        // Trigger onload when src is set
                        if (onloadHandler) {
                            Promise.resolve().then(() => onloadHandler!())
                        }
                    },
                }
                return img
            })

            const result = await uploadImageToBlockSuite(boardId, mockFile, mockDoc, noteId)
            
            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 100))

            expect(octoClient.uploadFile).toHaveBeenCalledWith(boardId, mockFile)
            expect(mockDoc.addBlock).toHaveBeenCalledWith(
                'affine:image',
                expect.objectContaining({
                    sourceId: 'file-id-123',
                    filename: 'test.png',
                    width: 800,
                    height: 600,
                }),
                noteId
            )
            expect(result).toBe('mock-block-id')
        })

        it('should return null if upload fails', async () => {
            const mockFile = new File(['image content'], 'test.png', { type: 'image/png' })
            const boardId = 'board-1'
            const noteId = 'note-id-1';

            (octoClient.uploadFile as jest.Mock).mockResolvedValue(undefined)

            const result = await uploadImageToBlockSuite(boardId, mockFile, mockDoc, noteId)

            expect(octoClient.uploadFile).toHaveBeenCalled()
            expect(mockDoc.addBlock).not.toHaveBeenCalled()
            expect(result).toBeNull()
        })

        it('should handle image size detection errors', async () => {
            const mockFile = new File(['image content'], 'test.png', { type: 'image/png' })
            const boardId = 'board-1'
            const noteId = 'note-id-1';

            (octoClient.uploadFile as jest.Mock).mockResolvedValue('file-id-123')

            // Mock Image constructor to trigger error
            let onerrorHandler: (() => void) | null = null
            global.Image = jest.fn().mockImplementation(() => {
                const img: any = {
                    width: 0,
                    height: 0,
                    onload: null,
                    get onerror() { return onerrorHandler },
                    set onerror(handler: (() => void) | null) { 
                        onerrorHandler = handler
                    },
                    _src: '',
                    get src() { return this._src },
                    set src(value: string) {
                        this._src = value
                        // Trigger onerror when src is set (simulating error)
                        if (onerrorHandler) {
                            Promise.resolve().then(() => onerrorHandler!())
                        }
                    },
                }
                return img
            })

            const result = await uploadImageToBlockSuite(boardId, mockFile, mockDoc, noteId)
            
            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 100))

            expect(octoClient.uploadFile).toHaveBeenCalled()
            expect(mockDoc.addBlock).toHaveBeenCalledWith(
                'affine:image',
                expect.objectContaining({
                    sourceId: 'file-id-123',
                    width: 0,
                    height: 0,
                }),
                noteId
            )
            expect(result).toBe('mock-block-id')
        })

        it('should handle upload exceptions', async () => {
            const mockFile = new File(['image content'], 'test.png', { type: 'image/png' })
            const boardId = 'board-1'
            const noteId = 'note-id-1';

            (octoClient.uploadFile as jest.Mock).mockRejectedValue(new Error('Upload failed'))

            const result = await uploadImageToBlockSuite(boardId, mockFile, mockDoc, noteId)

            expect(result).toBeNull()
            expect(mockDoc.addBlock).not.toHaveBeenCalled()
        })
    })

    describe('getImageUrl', () => {
        it('should generate correct image URL', () => {
            const boardId = 'board-1'
            const fileId = 'file-123'
            const teamId = 'team-1';

            (octoClient as any).teamId = teamId

            const url = getImageUrl(boardId, fileId)

            expect(url).toBe(`http://localhost/api/v2/files/teams/${teamId}/${boardId}/${fileId}`)
        })

        it('should use default teamId if not available', () => {
            const boardId = 'board-1'
            const fileId = 'file-123';

            (octoClient as any).teamId = undefined

            const url = getImageUrl(boardId, fileId)

            expect(url).toBe(`http://localhost/api/v2/files/teams/0/${boardId}/${fileId}`)
        })
    })
})
