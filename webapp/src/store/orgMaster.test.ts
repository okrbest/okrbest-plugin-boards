// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getOrgLabels} from './orgMaster'

import {RootState} from './index'

// One lookup source for every organisation value a card can carry. 본부, 부서 and
// 직책 all store IDs and all need a name on screen, so the three resolvers that
// used to build their own maps share this one (research R2).

const teamId = 'team-1'

const state = {
    orgMaster: {
        orgUnitsByTeamId: {
            [teamId]: [
                {id: 'div-1', name: '생산본부', type: 'division', parentId: ''},
                {id: 'dept-1', name: '생산팀', type: 'department', parentId: 'div-1'},
            ],
            'team-2': [
                {id: 'div-9', name: '남의 본부', type: 'division', parentId: ''},
            ],
        },
        dutiesByTeamId: {
            [teamId]: [
                {id: 'duty-1', code: 'lead', name: '팀장', rank: 3, fullVisibility: false},
            ],
            'team-2': [
                {id: 'duty-9', code: 'x', name: '남의 직책', rank: 1, fullVisibility: false},
            ],
        },
        orgProfilesByTeamId: {},
        loadedTeamIds: [teamId, 'team-2'],
    },
} as unknown as RootState

describe('getOrgLabels', () => {
    it('names 본부, 부서 and 직책 from one source', () => {
        const labels = getOrgLabels(teamId)(state)

        expect(labels).toEqual(expect.arrayContaining([
            {id: 'div-1', name: '생산본부'},
            {id: 'dept-1', name: '생산팀'},
            {id: 'duty-1', name: '팀장'},
        ]))
        expect(labels).toHaveLength(3)
    })

    it('keeps teams apart', () => {
        const labels = getOrgLabels(teamId)(state)

        expect(labels.map((entry) => entry.id)).not.toContain('div-9')
        expect(labels.map((entry) => entry.id)).not.toContain('duty-9')
    })

    it('returns empty for a team the master has not loaded', () => {
        expect(getOrgLabels('team-unknown')(state)).toEqual([])
    })

    it('returns the same array instance while the state is unchanged', () => {
        // The group header resolver builds a Map from this on every render, so a
        // new array each call would rebuild it forever.
        expect(getOrgLabels(teamId)(state)).toBe(getOrgLabels(teamId)(state))
    })
})
