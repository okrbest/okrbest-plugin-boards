// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl'

import {BoardView} from './blocks/boardView'
import {Board, IPropertyTemplate, NamedEntry} from './blocks/board'
import {Card} from './blocks/card'
import {Utils} from './utils'
import {IAppWindow} from './types'
import {IUser} from './user'
import propsRegistry from './properties'
import store from './store'
import {getBoardUsers} from './store/users'
import {getClientConfig} from './store/clientConfig'
import {getOrgLabels} from './store/orgMaster'
import {orgNamesForIds, isOrgProperty} from './properties/orgLabels'

declare let window: IAppWindow
const hashSignToken = '___hash_sign___'
const cleanupFallbackDelayMs = 60000

class CsvExporter {
    static exportTableCsv(board: Board, activeView: BoardView, cards: Card[], intl: IntlShape, view?: BoardView): void {
        const viewToExport = view ?? activeView
        
        if (!viewToExport) {
            return
        }

        const rows = CsvExporter.generateTableArray(board, cards, viewToExport, intl)

        let csvContent = '\uFEFF'

        rows.forEach((row) => {
            const encodedRow = row.join(',')
            csvContent += encodedRow + '\r\n'
        })

        const filename = `${Utils.sanitizeFilename(viewToExport.title || 'Untitled')}.csv`
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8'})
        const blobUrl = URL.createObjectURL(blob)
        const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent)
        const link = document.createElement('a')
        link.style.display = 'none'
        link.setAttribute('href', blobUrl)
        link.setAttribute('download', filename)
        document.body.appendChild(link)						// FireFox support

        link.click()
        
        // Linux webview workaround: use openInNewBrowser if available
        if (window.openInNewBrowser) {
            window.openInNewBrowser(encodedUri)
        }
        
        let isCleanedUp = false
        let fallbackTimer = 0

        const cleanup = () => {
            if (isCleanedUp) {
                return
            }
            isCleanedUp = true

            if (fallbackTimer) {
                window.clearTimeout(fallbackTimer)
                fallbackTimer = 0
            }
            window.removeEventListener('focus', cleanup)

            if (link.parentNode) {
                link.parentNode.removeChild(link)
            }
            URL.revokeObjectURL(blobUrl)
        }

        window.addEventListener('focus', cleanup, {once: true})
        fallbackTimer = window.setTimeout(cleanup, cleanupFallbackDelayMs)
    }

    private static encodeText(text: string): string {
        return text.replace(/"/g, '""').replace(/#/g, hashSignToken)
    }

    private static generateTableArray(board: Board, cards: Card[], viewToExport: BoardView, intl: IntlShape): string[][] {
        const rows: string[][] = []
        const visibleProperties = board.cardProperties.filter((template: IPropertyTemplate) => viewToExport.fields.visiblePropertyIds.includes(template.id))
        const state = store.getState()
        const boardUsers = getBoardUsers(state)
        const clientConfig = getClientConfig(state)
        const orgLabels = getOrgLabels(board.teamId)(state)

        if (viewToExport.fields.viewType === 'calendar' &&
            viewToExport.fields.dateDisplayPropertyId &&
            !viewToExport.fields.visiblePropertyIds.includes(viewToExport.fields.dateDisplayPropertyId)) {
            const dateDisplay = board.cardProperties.find((template: IPropertyTemplate) => viewToExport.fields.dateDisplayPropertyId === template.id)
            if (dateDisplay) {
                visibleProperties.push(dateDisplay)
            }
        }

        {
            // Header row
            const row: string[] = [intl.formatMessage({id: 'TableComponent.name', defaultMessage: 'Name'})]
            visibleProperties.forEach((template: IPropertyTemplate) => {
                row.push(template.name)
            })
            rows.push(row)
        }

        cards.forEach((card) => {
            const row: string[] = []
            row.push(`"${this.encodeText(card.title)}"`)
            visibleProperties.forEach((template: IPropertyTemplate) => {
                let propertyValue = card.fields.properties[template.id]
                const property = propsRegistry.get(template.type)
                if (property.type === 'createdBy') {
                    propertyValue = card.createdBy
                }
                if (property.type === 'updatedBy') {
                    propertyValue = card.modifiedBy
                }
                if (property.type === 'number') {
                    const rawValue = property.exportValue(propertyValue, card, template, intl)
                    row.push(`"${this.encodeText(rawValue)}"`)
                } else if (property.isPersonLike) {
                    row.push(CsvExporter.exportPersonValue(propertyValue, boardUsers, clientConfig.teammateNameDisplay))
                } else if (isOrgProperty(property.type)) {
                    row.push(CsvExporter.exportOrgValue(propertyValue, orgLabels))
                } else {
                    row.push(property.exportValue(propertyValue, card, template, intl))
                } 
            })
            rows.push(row)
        })

        return rows
    }

    // PropertyType.exportValue is a pure function with no way to reach the
    // organisation master, so organisation values are resolved here — the same
    // exception person properties already use.
    private static exportOrgValue(propertyValue: string | string[] | undefined, orgLabels: NamedEntry[]): string {
        const ids = Array.isArray(propertyValue) ? propertyValue : [propertyValue]

        // Missing IDs are written out as the ID rather than dropped, matching
        // what the card and the group headers show — orgNamesForIds owns that
        // rule for all three screens.
        const names = orgNamesForIds(ids.filter((id): id is string => Boolean(id)), orgLabels)
        return `"${this.encodeText(names.join('|'))}"`
    }

    private static exportPersonValue(propertyValue: string | string[] | undefined, boardUsers: {[key: string]: IUser}, teammateNameDisplay: string): string {
        const userIds = Array.isArray(propertyValue) ? propertyValue : [propertyValue]
        const userDisplayNames = userIds.filter((userId): userId is string => Boolean(userId)).map((userId) => {
            const user = boardUsers[userId]
            if (!user) {
                return userId
            }
            return Utils.getUserDisplayName(user, teammateNameDisplay)
        })
        return `"${this.encodeText(userDisplayNames.join('|'))}"`
    }
}

export {CsvExporter}
