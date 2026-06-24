// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createIntl} from 'react-intl'

import {CsvExporter} from './csvExporter'
import {TestBlockFactory} from './test/testBlockFactory'
import {IAppWindow} from './types'

declare let window: IAppWindow

describe('csvExporter', () => {
    let originalCreateObjectURL: typeof URL.createObjectURL | undefined
    let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined

    beforeEach(() => {
        jest.useFakeTimers()
        originalCreateObjectURL = URL.createObjectURL
        originalRevokeObjectURL = URL.revokeObjectURL

        Object.defineProperty(URL, 'createObjectURL', {
            writable: true,
            value: jest.fn(() => 'blob:test-url'),
        })
        Object.defineProperty(URL, 'revokeObjectURL', {
            writable: true,
            value: jest.fn(),
        })
    })

    afterEach(() => {
        window.openInNewBrowser = null
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
        jest.restoreAllMocks()

        Object.defineProperty(URL, 'createObjectURL', {
            writable: true,
            value: originalCreateObjectURL,
        })
        Object.defineProperty(URL, 'revokeObjectURL', {
            writable: true,
            value: originalRevokeObjectURL,
        })
    })

    const createExportData = () => {
        const intl = createIntl({locale: 'en-us'})
        const board = TestBlockFactory.createBoard()
        const activeView = TestBlockFactory.createBoardView(board)
        const card = TestBlockFactory.createCard(board)

        return {intl, board, activeView, card}
    }

    test('cleans up blob URL on window focus and uses data URI for openInNewBrowser', () => {
        const {intl, board, activeView, card} = createExportData()
        const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        const openInNewBrowser = jest.fn()
        window.openInNewBrowser = openInNewBrowser

        CsvExporter.exportTableCsv(board, activeView, [card], intl)

        expect(URL.createObjectURL).toBeCalledTimes(1)
        expect(clickSpy).toBeCalledTimes(1)
        expect(openInNewBrowser).toBeCalledTimes(1)
        expect(openInNewBrowser).toBeCalledWith(expect.stringMatching(/^data:text\/csv;charset=utf-8,/))
        expect(openInNewBrowser).not.toBeCalledWith(expect.stringMatching(/^blob:/))
        expect(URL.revokeObjectURL).not.toBeCalled()

        window.dispatchEvent(new Event('focus'))
        expect(URL.revokeObjectURL).toBeCalledWith('blob:test-url')
    })

    test('falls back to timer cleanup when focus event does not fire', () => {
        const {intl, board, activeView, card} = createExportData()

        CsvExporter.exportTableCsv(board, activeView, [card], intl)

        expect(URL.revokeObjectURL).not.toBeCalled()
        jest.advanceTimersByTime(59999)
        expect(URL.revokeObjectURL).not.toBeCalled()

        jest.advanceTimersByTime(1)
        expect(URL.revokeObjectURL).toBeCalledWith('blob:test-url')
    })
})
