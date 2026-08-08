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

import OrgDepartmentProperty from './property'
import OrgDepartment from './orgDepartment'

// The narrowing itself is unit tested in store/orgScope.test.ts. These cases
// check that the editor actually asks for it and shows the answer (SC-001).
describe('properties/orgDepartment', () => {
    const mockStore = configureStore([])
    const teamID = 'team-1'

    const state = {
        orgMaster: {
            orgUnitsByTeamId: {
                [teamID]: [
                    {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
                    {id: 'div-admin', name: '관리본부', type: 'division', parentId: ''},
                    {id: 'div-sales', name: '영업본부', type: 'division', parentId: ''},
                    {id: 'dep-production', name: '생산팀', type: 'department', parentId: 'div-production'},
                    {id: 'dep-quality', name: '품질팀', type: 'department', parentId: 'div-production'},
                    {id: 'dep-finance', name: '재경전산팀', type: 'department', parentId: 'div-admin'},
                    {id: 'dep-sales', name: '영업팀', type: 'department', parentId: 'div-sales'},
                ],
            },
            dutiesByTeamId: {},
            orgProfilesByTeamId: {},
            loadedTeamIds: [teamID],
        },
    }

    const template = {
        id: 'p-dep',
        name: '부서',
        type: 'orgDepartment',
        options: [],
    } as IPropertyTemplate

    const divisionTemplate = (id: string) => ({
        id,
        name: '본부',
        type: 'orgDivision',
        options: [],
    } as IPropertyTemplate)

    const openList = async (divisionProps: string[], cardProperties: Record<string, string[]>) => {
        const board = {
            id: 'board-1',
            teamId: teamID,
            cardProperties: [...divisionProps.map(divisionTemplate), template],
        } as Board
        const card = {id: 'card-1', fields: {properties: cardProperties}} as unknown as Card

        render(wrapIntl(
            <ReduxProvider store={mockStore(state)}>
                <OrgDepartment
                    property={new OrgDepartmentProperty()}
                    propertyValue={cardProperties['p-dep'] || []}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                    propertyTemplate={template}
                    board={board}
                    card={card}
                />
            </ReduxProvider>,
        ))

        await userEvent.click(screen.getByTestId('org-unit-non-editable'))
    }

    test('one division narrows the list to its departments (FR-007)', async () => {
        await openList(['p-div'], {'p-div': ['div-production']})

        expect(screen.getByText('생산팀')).toBeDefined()
        expect(screen.getByText('품질팀')).toBeDefined()
        expect(screen.queryByText('재경전산팀')).toBeNull()
        expect(screen.queryByText('영업팀')).toBeNull()
    })

    test('several values on one division property union (FR-009)', async () => {
        await openList(['p-div'], {'p-div': ['div-production', 'div-admin']})

        expect(screen.getByText('생산팀')).toBeDefined()
        expect(screen.getByText('재경전산팀')).toBeDefined()
        expect(screen.queryByText('영업팀')).toBeNull()
    })

    test('several division properties union (FR-010)', async () => {
        await openList(['p-div-a', 'p-div-b'], {'p-div-a': ['div-production'], 'p-div-b': ['div-sales']})

        expect(screen.getByText('생산팀')).toBeDefined()
        expect(screen.getByText('영업팀')).toBeDefined()
        expect(screen.queryByText('재경전산팀')).toBeNull()
    })

    test('no division means every department, not none (FR-008)', async () => {
        await openList(['p-div'], {})

        expect(screen.getByText('생산팀')).toBeDefined()
        expect(screen.getByText('재경전산팀')).toBeDefined()
        expect(screen.getByText('영업팀')).toBeDefined()
    })

    test('a value out of range stays in the list (FR-015)', async () => {
        // The card names 관리본부's department while 본부 says 생산. The value is
        // still shown, otherwise the chip on screen would have no entry behind
        // it and the next edit would drop it without the user saying so.
        await openList(['p-div'], {'p-div': ['div-production'], 'p-dep': ['dep-finance']})

        // Twice over: once as the chosen chip, once as an entry in the list.
        expect(screen.getAllByText('재경전산팀').length).toBeGreaterThan(1)
        expect(screen.getByText('생산팀')).toBeDefined()
    })
})
