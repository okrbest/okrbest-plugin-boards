// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {render, screen} from '@testing-library/react'
import configureStore from 'redux-mock-store'

import {wrapIntl} from '../../../testUtils'
import {Board, IPropertyTemplate} from '../../../blocks/board'
import {BoardView} from '../../../blocks/boardView'

import FilterValuePanel from './filterValuePanel'

// The organisation branch of the filter panel. It cannot reuse the options
// branch because an organisation property's options array is always empty — the
// choices come from the organisation master (FR-019).
describe('components/viewHeader/filterPanel/filterValuePanel — organisation', () => {
    const mockStore = configureStore([])
    const teamID = 'team-1'

    const state = {
        orgMaster: {
            orgUnitsByTeamId: {
                [teamID]: [
                    {id: 'div-production', name: '생산본부', type: 'division', parentId: ''},
                    {id: 'div-admin', name: '관리본부', type: 'division', parentId: ''},
                    {id: 'dep-production', name: '생산팀', type: 'department', parentId: 'div-production'},
                    {id: 'dep-finance', name: '재경전산팀', type: 'department', parentId: 'div-admin'},
                ],
            },
            dutiesByTeamId: {
                [teamID]: [
                    {id: 'duty-head', code: 'head', name: '본부장', rank: 2, fullVisibility: true},
                    {id: 'duty-lead', code: 'lead', name: '팀장', rank: 3, fullVisibility: false},
                ],
            },
            orgProfilesByTeamId: {},
            loadedTeamIds: [teamID],
        },
        users: {boardUsers: {}},
        cards: {cards: {}, current: ''},
    }

    const board = {id: 'board-1', teamId: teamID, cardProperties: []} as unknown as Board

    const activeView = {
        id: 'view-1',
        fields: {filter: {operation: 'and', filters: []}},
    } as unknown as BoardView

    const renderPanel = (type: string) => render(wrapIntl(
        <ReduxProvider store={mockStore(state)}>
            <FilterValuePanel
                board={board}
                activeView={activeView}
                propertyTemplate={{id: 'p-1', name: '조직', type, options: []} as IPropertyTemplate}
            />
        </ReduxProvider>,
    ))

    test('a 본부 filter lists the divisions from the master (FR-019)', () => {
        renderPanel('orgDivision')

        expect(screen.getByText('생산본부')).toBeDefined()
        expect(screen.getByText('관리본부')).toBeDefined()
    })

    test('a 본부 filter does not list departments', () => {
        renderPanel('orgDivision')

        expect(screen.queryByText('생산팀')).toBeNull()
    })

    test('a 부서 filter lists every department, not just one division\'s', () => {
        // Unlike the card editor, a filter is a question about the whole board,
        // so it is not narrowed by what any one card names.
        renderPanel('orgDepartment')

        expect(screen.getByText('생산팀')).toBeDefined()
        expect(screen.getByText('재경전산팀')).toBeDefined()
        expect(screen.queryByText('생산본부')).toBeNull()
    })

    test('a 직책 filter lists the duties from the master (FR-007)', () => {
        renderPanel('orgDuty')

        expect(screen.getByText('본부장')).toBeDefined()
        expect(screen.getByText('팀장')).toBeDefined()
    })

    test('a 직책 filter lists no organisation units', () => {
        renderPanel('orgDuty')

        expect(screen.queryByText('생산본부')).toBeNull()
        expect(screen.queryByText('생산팀')).toBeNull()
    })

    test('a 본부 filter lists no duties', () => {
        // The three organisation filters share one panel, so each one has to be
        // shown to draw from its own source rather than from all of them.
        renderPanel('orgDivision')

        expect(screen.queryByText('본부장')).toBeNull()
    })

    test('the list appears even though the board holds no options', () => {
        // The regression this guards: routing organisation properties through
        // the 'options' branch would render an empty panel, because that branch
        // reads propertyTemplate.options.
        const {container} = renderPanel('orgDivision')

        expect(container.querySelectorAll('.FilterValuePanel__option').length).toBe(2)
    })
})
