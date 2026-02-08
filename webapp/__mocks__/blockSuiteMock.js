// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const mockFn = jest.fn()

module.exports = {
    AffineEditorContainer: jest.fn(),
    DocCollection: jest.fn(() => ({
        createDoc: jest.fn(() => ({
            load: jest.fn(),
            addBlock: jest.fn(() => 'mock-id'),
            getBlockById: jest.fn(),
        })),
        docs: new Map(),
    })),
    Schema: jest.fn(() => ({
        register: jest.fn(),
    })),
    AffineSchemas: [],
    Text: jest.fn((text) => ({ toString: () => text || '' })),
    effects: mockFn,
    presetsEffects: mockFn,
    blocksEffects: mockFn,
}
