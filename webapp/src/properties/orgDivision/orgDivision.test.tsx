// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {render, screen} from '@testing-library/react'
import configureStore from 'redux-mock-store'
import userEvent from '@testing-library/user-event'

import {wrapIntl} from '../../testUtils'
import {IPropertyTemplate, Board} from '../../blocks/board'
import {Card} from '../../blocks/card'

import OrgDivisionProperty from './property'
import OrgDivision from './orgDivision'

// Assertions rather than snapshots: what matters here is which units are
// offered and how they read, and a snapshot would pass just as happily with IDs
// on screen as with names.
describe('properties/orgDivision', () => {
    const mockStore = configureStore([])
    const teamID = 'team-1'

    const state = {
        orgMaster: {
            orgUnitsByTeamId: {
                [teamID]: [
                    {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
                    {id: 'div-sales', name: '영업본부', type: 'division', parentId: ''},
                    {id: 'dep-production', name: '생산팀', type: 'department', parentId: 'div-production'},
                ],
            },
            dutiesByTeamId: {},
            orgProfilesByTeamId: {},
            loadedTeamIds: [teamID],
        },
    }

    const board = {id: 'board-1', teamId: teamID} as Board

    const template = {
        id: 'divisionPropertyID',
        name: '본부',
        type: 'orgDivision',
        options: [],
    } as IPropertyTemplate

    const renderEditor = (propertyValue: string[]) => render(wrapIntl(
        <ReduxProvider store={mockStore(state)}>
            <OrgDivision
                property={new OrgDivisionProperty()}
                propertyValue={propertyValue}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={template}
                board={board}
                card={{id: 'card-1'} as Card}
            />
        </ReduxProvider>,
    ))

    test('shows the unit name, not the stored ID (FR-005)', () => {
        renderEditor(['div-production'])

        expect(screen.getByText('생산본부')).toBeDefined()
        expect(screen.queryByText('div-production')).toBeNull()
    })

    test('shows every selected value (FR-002)', () => {
        renderEditor(['div-production', 'div-sales'])

        expect(screen.getByText('생산본부')).toBeDefined()
        expect(screen.getByText('영업본부')).toBeDefined()
    })

    test('keeps a value the master no longer carries and marks it (FR-006)', () => {
        // The master is owned by the main server. A card that names a retired
        // unit keeps naming it — dropping the value silently would lose history
        // this plugin has no standing to discard.
        renderEditor(['div-retired'])

        expect(screen.getByText(/div-retired/)).toBeDefined()
        expect(screen.getByText(/\(removed\)/)).toBeDefined()
    })

    test('renders the placeholder when nothing is chosen', () => {
        render(wrapIntl(
            <ReduxProvider store={mockStore(state)}>
                <OrgDivision
                    property={new OrgDivisionProperty()}
                    propertyValue={[]}
                    readOnly={false}
                    showEmptyPlaceholder={true}
                    propertyTemplate={template}
                    board={board}
                    card={{id: 'card-1'} as Card}
                />
            </ReduxProvider>,
        ))

        expect(screen.getByText('Empty')).toBeDefined()
    })

    test('offers divisions only — departments are a different property (FR-004)', async () => {
        renderEditor([])

        await userEvent.click(screen.getByTestId('org-unit-non-editable'))

        expect(screen.getByText('생산본부')).toBeDefined()
        expect(screen.getByText('영업본부')).toBeDefined()
        expect(screen.queryByText('생산팀')).toBeNull()
    })

    test('offers no way to create, rename or delete a unit', async () => {
        // The organisation master belongs to the main server. Offering the
        // option management a board-owned multiselect has would imply this
        // plugin can change it.
        renderEditor([])

        await userEvent.click(screen.getByTestId('org-unit-non-editable'))

        expect(screen.queryByText('Rename')).toBeNull()
        expect(screen.queryByText('Delete')).toBeNull()
    })
    // Colour is what makes a row of organisation labels readable at a glance.
    // Before 007 every one of them was the same grey.
    const colorOf = (container: HTMLElement, name: string): string => {
        const label = [...container.querySelectorAll('.Label')].find((node) => node.textContent?.includes(name))
        return label ? label.className.replace('Label', '').trim() : ''
    }

    test('draws different units in different colours (FR-001)', () => {
        const {container} = renderEditor(['div-production', 'div-sales'])

        expect(colorOf(container, '생산본부')).not.toBe(colorOf(container, '영업본부'))
    })

    test('never leaves a unit in the default grey (FR-001)', () => {
        // Grey reads as "no colour", so an automatic pick landing there would
        // look like the feature had not been applied.
        const {container} = renderEditor(['div-production', 'div-sales'])

        expect(colorOf(container, '생산본부')).not.toBe('propColorDefault')
        expect(colorOf(container, '영업본부')).not.toBe('propColorDefault')
    })

    test('gives a unit the same colour on every render (FR-002)', () => {
        const first = renderEditor(['div-production'])
        const firstColor = colorOf(first.container, '생산본부')
        first.unmount()

        const second = renderEditor(['div-production'])

        expect(colorOf(second.container, '생산본부')).toBe(firstColor)
    })

    test('warns about a value the master dropped, whatever its colour would be (FR-009)', () => {
        const {container} = renderEditor(['div-retired'])

        expect(colorOf(container, 'div-retired')).toBe('propColorRed')
    })
})
