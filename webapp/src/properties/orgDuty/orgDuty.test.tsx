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

import OrgDutyProperty from './property'
import OrgDuty from './orgDuty'

// Assertions rather than snapshots, for the same reason 본부 and 부서 use them:
// what matters is which duties are offered and how they read, and a snapshot
// would pass just as happily with IDs on screen as with names.
describe('properties/orgDuty', () => {
    const mockStore = configureStore([])
    const teamID = 'team-1'

    // Stored in the order the server sends — by rank, then name. The editor must
    // not sort again (research R4).
    const state = {
        orgMaster: {
            orgUnitsByTeamId: {
                [teamID]: [
                    {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
                    {id: 'dep-production', name: '생산팀', type: 'department', parentId: 'div-production'},
                ],
            },
            dutiesByTeamId: {
                [teamID]: [
                    {id: 'duty-ceo', code: 'ceo', name: 'CEO', rank: 0, fullVisibility: true},
                    {id: 'duty-head', code: 'head', name: '본부장', rank: 2, fullVisibility: true},
                    {id: 'duty-lead', code: 'lead', name: '팀장', rank: 3, fullVisibility: false},
                ],
            },
            orgProfilesByTeamId: {},
            loadedTeamIds: [teamID],
        },
    }

    const board = {id: 'board-1', teamId: teamID} as Board

    const template = {
        id: 'dutyPropertyID',
        name: '직책',
        type: 'orgDuty',
        options: [],
    } as IPropertyTemplate

    const renderEditor = (propertyValue: string[], showEmptyPlaceholder = false, card = {id: 'card-1'} as Card) => render(wrapIntl(
        <ReduxProvider store={mockStore(state)}>
            <OrgDuty
                property={new OrgDutyProperty()}
                propertyValue={propertyValue}
                readOnly={false}
                showEmptyPlaceholder={showEmptyPlaceholder}
                propertyTemplate={template}
                board={board}
                card={card}
            />
        </ReduxProvider>,
    ))

    test('shows the duty name, not the stored ID', () => {
        renderEditor(['duty-lead'])

        expect(screen.getByText('팀장')).toBeDefined()
        expect(screen.queryByText('duty-lead')).toBeNull()
    })

    test('shows every selected value (FR-002)', () => {
        renderEditor(['duty-head', 'duty-lead'])

        expect(screen.getByText('본부장')).toBeDefined()
        expect(screen.getByText('팀장')).toBeDefined()
    })

    test('offers every active duty of the team (FR-003)', async () => {
        renderEditor([])

        await userEvent.click(screen.getByTestId('org-unit-non-editable'))

        expect(screen.getByText('CEO')).toBeDefined()
        expect(screen.getByText('본부장')).toBeDefined()
        expect(screen.getByText('팀장')).toBeDefined()
    })

    test('offers duties only — organisation units belong to other properties', async () => {
        renderEditor([])

        await userEvent.click(screen.getByTestId('org-unit-non-editable'))

        expect(screen.queryByText('생산본부')).toBeNull()
        expect(screen.queryByText('생산팀')).toBeNull()
    })

    test('keeps the order the master sent (research R4)', async () => {
        renderEditor([])

        await userEvent.click(screen.getByTestId('org-unit-non-editable'))

        const offered = screen.getAllByText(/CEO|본부장|팀장/).map((node) => node.textContent)
        expect(offered).toEqual(['CEO', '본부장', '팀장'])
    })

    test('does not narrow by the 본부 or 부서 the card names (FR-003)', async () => {
        // 부서 narrows by 본부 because a department hangs off a division. A duty
        // hangs off nothing, so a card naming an organisation must not change
        // what the duty editor offers (spec US1 scenario 5).
        const cardWithOrg = {
            id: 'card-1',
            fields: {
                properties: {
                    divisionPropertyID: ['div-production'],
                    departmentPropertyID: ['dep-production'],
                },
            },
        } as unknown as Card

        renderEditor([], false, cardWithOrg)

        await userEvent.click(screen.getByTestId('org-unit-non-editable'))

        expect(screen.getByText('CEO')).toBeDefined()
        expect(screen.getByText('본부장')).toBeDefined()
        expect(screen.getByText('팀장')).toBeDefined()
    })

    test('keeps a value the master no longer carries and marks it (FR-006)', () => {
        renderEditor(['duty-retired'])

        expect(screen.getByText(/duty-retired/)).toBeDefined()
        expect(screen.getByText(/\(removed\)/)).toBeDefined()
    })

    test('renders the placeholder when nothing is chosen', () => {
        renderEditor([], true)

        expect(screen.getByText('Empty')).toBeDefined()
    })

    test('offers no way to create, rename or delete a duty', async () => {
        // The master belongs to the main server, so the editor must not imply
        // this plugin can change it.
        renderEditor([])

        await userEvent.click(screen.getByTestId('org-unit-non-editable'))

        expect(screen.queryByText('Rename')).toBeNull()
        expect(screen.queryByText('Delete')).toBeNull()
    })
})
