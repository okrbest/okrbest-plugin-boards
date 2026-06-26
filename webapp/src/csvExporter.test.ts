// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createIntl} from 'react-intl'

import {CsvExporter} from './csvExporter'
import {TestBlockFactory} from './test/testBlockFactory'
import {IAppWindow} from './types'
import store from './store'
import {setBoardUsers} from './store/users'
import {setClientConfig} from './store/clientConfig'
import {ShowUsername} from './utils'

declare let window: IAppWindow

describe('csvExporter', () => {
    let originalCreateObjectURL: typeof URL.createObjectURL | undefined
    let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined

    beforeEach(() => {
        jest.useFakeTimers()
        originalCreateObjectURL = URL.createObjectURL
        originalRevokeObjectURL = URL.revokeObjectURL
        store.dispatch(setBoardUsers([]))
        store.dispatch(setClientConfig({
            telemetry: false,
            telemetryid: '',
            enablePublicSharedBoards: false,
            teammateNameDisplay: ShowUsername,
            featureFlags: {},
            maxFileSize: 0,
        }))

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

    const decodeCsvFromDataUri = (dataUri: string): string => decodeURIComponent(dataUri.replace('data:text/csv;charset=utf-8,', ''))

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

    test('exports person properties using display names instead of ids', () => {
        const {intl, board, activeView, card} = createExportData()
        const personProperty = {
            id: 'personProperty',
            name: 'Assignee',
            type: 'person',
            options: [],
        }
        const multiPersonProperty = {
            id: 'multiPersonProperty',
            name: 'Reviewers',
            type: 'multiPerson',
            options: [],
        }
        const createdByProperty = {
            id: 'createdByProperty',
            name: 'Created by',
            type: 'createdBy',
            options: [],
        }
        const updatedByProperty = {
            id: 'updatedByProperty',
            name: 'Updated by',
            type: 'updatedBy',
            options: [],
        }
        board.cardProperties.push(personProperty, multiPersonProperty, createdByProperty, updatedByProperty)
        activeView.fields.visiblePropertyIds = [personProperty.id, multiPersonProperty.id, createdByProperty.id, updatedByProperty.id]

        card.fields.properties[personProperty.id] = 'user-1'
        card.fields.properties[multiPersonProperty.id] = ['user-1', 'user-2', 'missing-user']
        card.createdBy = 'user-2'
        card.modifiedBy = 'user-1'

        store.dispatch(setClientConfig({
            telemetry: false,
            telemetryid: '',
            enablePublicSharedBoards: false,
            teammateNameDisplay: 'username',
            featureFlags: {},
            maxFileSize: 0,
        }))
        store.dispatch(setBoardUsers([
            {
                id: 'user-1',
                username: 'alpha',
                email: '',
                nickname: '',
                firstname: '',
                lastname: '',
                props: {},
                create_at: 0,
                update_at: 0,
                is_bot: false,
                is_guest: false,
                roles: 'system_user',
            },
            {
                id: 'user-2',
                username: 'beta',
                email: '',
                nickname: '',
                firstname: '',
                lastname: '',
                props: {},
                create_at: 0,
                update_at: 0,
                is_bot: false,
                is_guest: false,
                roles: 'system_user',
            },
        ]))

        const openInNewBrowser = jest.fn()
        window.openInNewBrowser = openInNewBrowser

        CsvExporter.exportTableCsv(board, activeView, [card], intl)

        const exportedCsv = decodeCsvFromDataUri(openInNewBrowser.mock.calls[0][0])
        expect(exportedCsv).toContain('"alpha"')
        expect(exportedCsv).toContain('"alpha|beta|missing-user"')
        expect(exportedCsv).toContain('"beta"')
    })
})
