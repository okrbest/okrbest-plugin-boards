// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    copyAllContent,
} from './BlockSuiteEditor'
import {
    buildClipboardBlobPayload,
} from './focalboardBlobSource'

jest.mock('./focalboardBlobSource', () => {
    const actual = jest.requireActual('./focalboardBlobSource')
    return {
        ...actual,
        buildClipboardBlobPayload: jest.fn().mockResolvedValue({
            payloadText: null,
            diagnostics: {
                preferredKeyCount: 0,
                mappingKeyCount: 0,
                payloadItemCount: 0,
            },
        }),
    }
})

describe('components/blockSuite/BlockSuiteEditor', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('copyAllContent returns rich:copy_event when host copy handler prevents default', async () => {
        const host = document.createElement('div')
        host.addEventListener('copy', (event) => event.preventDefault())
        const editor = {
            host,
            std: {
                selection: {
                    create: jest.fn((_type: string, payload: {blockId: string}) => payload),
                    set: jest.fn(),
                },
            },
        } as any

        const result = await copyAllContent({
            editor,
            editorDoc: {getBlocks: () => [{id: 'p1', flavour: 'affine:paragraph'}]} as any,
        })

        expect(result).toEqual({copied: true, method: 'rich:copy_event'})
    })

    test('copyAllContent returns rich:copy_event when host dispatch returns false', async () => {
        const host = document.createElement('div')
        jest.spyOn(host, 'dispatchEvent').mockReturnValue(false)

        const editor = {
            host,
            std: {
                selection: {
                    create: jest.fn((_type: string, payload: {blockId: string}) => payload),
                    set: jest.fn(),
                },
            },
        } as any

        const result = await copyAllContent({
            editor,
            editorDoc: {getBlocks: () => [{id: 'p1', flavour: 'affine:paragraph'}]} as any,
        })

        expect(result).toEqual({copied: true, method: 'rich:copy_event'})
    })

    test('copyAllContent returns rich_copy_failed when rich paths fail', async () => {
        const editor = {
            host: document.createElement('div'),
            std: {
                selection: {
                    create: jest.fn((_type: string, payload: {blockId: string}) => payload),
                    set: jest.fn(),
                },
            },
        } as any

        const result = await copyAllContent({
            editor,
            editorDoc: {getBlocks: () => [{id: 'p1', flavour: 'affine:paragraph'}]} as any,
        })

        expect(result).toEqual({copied: false, reason: 'rich_copy_failed'})
    })

    test('copyAllContent returns no_editor when editor is missing', async () => {
        const result = await copyAllContent({
            editor: null,
            editorDoc: {getBlocks: () => []} as any,
        })

        expect(result).toEqual({copied: false, reason: 'no_editor'})
    })

    test('copyAllContent builds clipboard payload when board/team is provided', async () => {
        ;(buildClipboardBlobPayload as jest.Mock).mockResolvedValueOnce({
            payloadText: '{"version":1,"items":[]}',
            diagnostics: {
                preferredKeyCount: 1,
                mappingKeyCount: 0,
                payloadItemCount: 0,
            },
        })

        const host = document.createElement('div')
        host.addEventListener('copy', (event) => event.preventDefault())
        const addEventSpy = jest.spyOn(host, 'addEventListener')

        const result = await copyAllContent({
            editor: {
                host,
                std: {
                    selection: {
                        create: jest.fn((_type: string, payload: {blockId: string}) => payload),
                        set: jest.fn(),
                    },
                },
            } as any,
            editorDoc: {getBlocks: () => [{id: 'p1', flavour: 'affine:paragraph'}]} as any,
            boardId: 'board-1',
            teamId: 'team-1',
        })

        expect(buildClipboardBlobPayload).toHaveBeenCalledWith('board-1', 'team-1', {
            preferredKeys: ['p1'],
        })
        expect(addEventSpy).toHaveBeenCalledWith('copy', expect.any(Function), {once: true})
        expect(result).toEqual({copied: true, method: 'rich:copy_event'})
    })
})
