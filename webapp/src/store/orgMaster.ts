// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createAsyncThunk, createSlice} from '@reduxjs/toolkit'

import client from '../octoClient'
import {OrgUnit, UserOrgMembership, Duty} from '../blocks/board'

import {RootState} from './index'

// The organisation master is owned by the main server and changes rarely, so it
// is cached per team and fetched once per team rather than per dialog opening.
type OrgMasterState = {
    orgUnitsByTeamId: {[teamId: string]: OrgUnit[]}
    dutiesByTeamId: {[teamId: string]: Duty[]}
    orgProfilesByTeamId: {[teamId: string]: UserOrgMembership[]}
    loadedTeamIds: string[]
}

const initialState: OrgMasterState = {
    orgUnitsByTeamId: {},
    dutiesByTeamId: {},
    orgProfilesByTeamId: {},
    loadedTeamIds: [],
}

export const fetchOrgMaster = createAsyncThunk(
    'orgMaster/fetch',
    async (teamId: string) => {
        const [orgUnits, duties, orgProfiles] = await Promise.all([
            client.getOrgUnits(teamId),
            client.getDuties(teamId),
            client.getOrgProfiles(teamId),
        ])
        return {teamId, orgUnits, duties, orgProfiles}
    },
)

const orgMasterSlice = createSlice({
    name: 'orgMaster',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder.addCase(fetchOrgMaster.fulfilled, (state, action) => {
            const {teamId, orgUnits, duties, orgProfiles} = action.payload
            state.orgUnitsByTeamId[teamId] = orgUnits
            state.dutiesByTeamId[teamId] = duties
            state.orgProfilesByTeamId[teamId] = orgProfiles
            if (!state.loadedTeamIds.includes(teamId)) {
                state.loadedTeamIds.push(teamId)
            }
        })
    },
})

export const {reducer} = orgMasterSlice

const emptyOrgUnits: OrgUnit[] = []
const emptyDuties: Duty[] = []
const emptyOrgProfiles: UserOrgMembership[] = []

export const getOrgUnits = (teamId: string) => (state: RootState): OrgUnit[] =>
    state.orgMaster?.orgUnitsByTeamId?.[teamId] || emptyOrgUnits

export const getDivisions = (teamId: string) => (state: RootState): OrgUnit[] =>
    getOrgUnits(teamId)(state).filter((unit) => unit.type === 'division')

// Departments are listed under the division they belong to; passing an empty
// divisionId returns every department, which is what an unset division shows.
export const getDepartments = (teamId: string, divisionId: string) => (state: RootState): OrgUnit[] =>
    getOrgUnits(teamId)(state).filter((unit) => unit.type === 'department' && (divisionId === '' || unit.parentId === divisionId))

export const getOrgProfiles = (teamId: string) => (state: RootState): UserOrgMembership[] =>
    state.orgMaster?.orgProfilesByTeamId?.[teamId] || emptyOrgProfiles

export const getDuties = (teamId: string) => (state: RootState): Duty[] =>
    state.orgMaster?.dutiesByTeamId?.[teamId] || emptyDuties

export const isOrgMasterLoaded = (teamId: string) => (state: RootState): boolean =>
    Boolean(state.orgMaster?.loadedTeamIds?.includes(teamId))
