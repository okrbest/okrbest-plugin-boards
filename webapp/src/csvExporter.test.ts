// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createIntl} from 'react-intl'

import {CsvExporter} from './csvExporter'
import {TestBlockFactory} from './test/testBlockFactory'
import {IPropertyTemplate} from './blocks/board'
import {IAppWindow} from './types'
import store from './store'
import {setBoardUsers} from './store/users'
import {setClientConfig} from './store/clientConfig'
import {fetchOrgMaster} from './store/orgMaster'
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

    // FR-030. The exporter is handed the cards the client already holds, and the
    // server drops the ones a rule hides before they ever reach the client. This
    // asserts the export adds nothing back — it never refetches.
    test('exports only the cards it is given, so hidden cards cannot reappear', () => {
        const {intl, board, activeView, card} = createExportData()
        const hidden = TestBlockFactory.createCard(board)
        hidden.id = 'hidden-card'
        hidden.title = 'Hidden by a card access rule'
        card.title = 'Visible card'

        const openInNewBrowser = jest.fn()
        window.openInNewBrowser = openInNewBrowser
        jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

        CsvExporter.exportTableCsv(board, activeView, [card], intl)

        const csv = decodeCsvFromDataUri(openInNewBrowser.mock.calls[0][0])
        expect(csv).toContain('Visible card')
        expect(csv).not.toContain('Hidden by a card access rule')
        expect(csv).not.toContain(hidden.id)
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

    test('exports organisation values as names joined by a pipe', () => {
        const intl = createIntl({locale: 'en-us'})
        const board = TestBlockFactory.createBoard()
        board.teamId = 'team-1'
        const activeView = TestBlockFactory.createBoardView(board)
        const card = TestBlockFactory.createCard(board)

        store.dispatch(fetchOrgMaster.fulfilled(
            {
                teamId: 'team-1',
                orgUnits: [
                    {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
                    {id: 'div-admin', name: '관리본부', type: 'division', parentId: ''},
                    {id: 'dep-production', name: '생산팀', type: 'department', parentId: 'div-production'},
                ],
                duties: [],
                orgProfiles: [],
            },
            'test-request',
            'team-1',
        ))

        const divisionProperty = {id: 'p-div', name: '본부', type: 'orgDivision', options: []} as IPropertyTemplate
        const departmentProperty = {id: 'p-dep', name: '부서', type: 'orgDepartment', options: []} as IPropertyTemplate
        board.cardProperties.push(divisionProperty, departmentProperty)
        activeView.fields.visiblePropertyIds = [divisionProperty.id, departmentProperty.id]

        // The last ID is not in the master. It is written out as the ID rather
        // than dropped, matching what the card shows on screen.
        card.fields.properties[divisionProperty.id] = ['div-production', 'div-admin', 'div-retired']
        card.fields.properties[departmentProperty.id] = ['dep-production']

        const openInNewBrowser = jest.fn()
        window.openInNewBrowser = openInNewBrowser

        CsvExporter.exportTableCsv(board, activeView, [card], intl)

        const exportedCsv = decodeCsvFromDataUri(openInNewBrowser.mock.calls[0][0])
        expect(exportedCsv).toContain('"생산본부|관리본부|div-retired"')
        expect(exportedCsv).toContain('"생산팀"')
    })

    test('exports duty values as names, the same way as 본부 and 부서 (FR-009)', () => {
        const intl = createIntl({locale: 'en-us'})
        const board = TestBlockFactory.createBoard()
        board.teamId = 'team-1'
        const activeView = TestBlockFactory.createBoardView(board)
        const card = TestBlockFactory.createCard(board)

        store.dispatch(fetchOrgMaster.fulfilled(
            {
                teamId: 'team-1',
                orgUnits: [
                    {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
                ],
                duties: [
                    {id: 'duty-head', code: 'head', name: '본부장', rank: 2, fullVisibility: true},
                    {id: 'duty-lead', code: 'lead', name: '팀장', rank: 3, fullVisibility: false},
                ],
                orgProfiles: [],
            },
            'test-request',
            'team-1',
        ))

        const dutyProperty = {id: 'p-duty', name: '직책', type: 'orgDuty', options: []} as IPropertyTemplate
        board.cardProperties.push(dutyProperty)
        activeView.fields.visiblePropertyIds = [dutyProperty.id]

        // A retired duty is written as its ID, the same as a retired unit.
        card.fields.properties[dutyProperty.id] = ['duty-head', 'duty-lead', 'duty-retired']

        const openInNewBrowser = jest.fn()
        window.openInNewBrowser = openInNewBrowser

        CsvExporter.exportTableCsv(board, activeView, [card], intl)

        const exportedCsv = decodeCsvFromDataUri(openInNewBrowser.mock.calls[0][0])
        expect(exportedCsv).toContain('"본부장|팀장|duty-retired"')
    })

    test('leaves a duty column empty when the card names none', () => {
        const intl = createIntl({locale: 'en-us'})
        const board = TestBlockFactory.createBoard()
        board.teamId = 'team-1'
        const activeView = TestBlockFactory.createBoardView(board)
        const card = TestBlockFactory.createCard(board)

        const dutyProperty = {id: 'p-duty', name: '직책', type: 'orgDuty', options: []} as IPropertyTemplate
        board.cardProperties.push(dutyProperty)
        activeView.fields.visiblePropertyIds = [dutyProperty.id]

        const openInNewBrowser = jest.fn()
        window.openInNewBrowser = openInNewBrowser

        CsvExporter.exportTableCsv(board, activeView, [card], intl)

        const exportedCsv = decodeCsvFromDataUri(openInNewBrowser.mock.calls[0][0])
        expect(exportedCsv).toContain('""')
    })
})
