// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createAsyncThunk, createSelector, createSlice} from '@reduxjs/toolkit'

import client from '../octoClient'
import {DutyTier} from '../blocks/board'

import {RootState} from './index'

// The duty tiers a team's card access rules point at.
//
// Shaped like the organisation master store next door: cached per team, fetched
// once per team rather than once per dialog opening. Tiers change when the
// company reorganises, which is rare.
//
// canEdit rides along with the tiers because the browser cannot work it out.
// Team admin is not a system role, so it is absent from the user object — the
// server answers and the answer is cached beside what it applies to.
type DutyTiersState = {
    tiersByTeamId: {[teamId: string]: DutyTier[]}
    canEditByTeamId: {[teamId: string]: boolean}
    boardCountsByTeamId: {[teamId: string]: {[tierId: string]: number}}
    loadedTeamIds: string[]
}

const initialState: DutyTiersState = {
    tiersByTeamId: {},
    canEditByTeamId: {},
    boardCountsByTeamId: {},
    loadedTeamIds: [],
}

export const fetchDutyTiers = createAsyncThunk(
    'dutyTiers/fetch',
    async (teamId: string) => {
        const response = await client.getDutyTiers(teamId)
        return {teamId, tiers: response.tiers, canEdit: response.canEdit, boardCounts: response.boardCounts || {}}
    },
)

export const saveDutyTiers = createAsyncThunk(
    'dutyTiers/save',
    async ({teamId, tiers}: {teamId: string, tiers: DutyTier[]}) => {
        const response = await client.setDutyTiers(teamId, tiers)

        // A refused save leaves the cache as it was. Showing the attempted value
        // would tell the user it took when the server said otherwise.
        return {teamId, tiers: response ? response.tiers : undefined, canEdit: response?.canEdit}
    },
)

const dutyTiersSlice = createSlice({
    name: 'dutyTiers',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder.addCase(fetchDutyTiers.fulfilled, (state, action) => {
            const {teamId, tiers, canEdit, boardCounts} = action.payload
            state.tiersByTeamId[teamId] = tiers
            state.canEditByTeamId[teamId] = canEdit
            state.boardCountsByTeamId[teamId] = boardCounts
            if (!state.loadedTeamIds.includes(teamId)) {
                state.loadedTeamIds.push(teamId)
            }
        })
        builder.addCase(saveDutyTiers.fulfilled, (state, action) => {
            const {teamId, tiers, canEdit} = action.payload
            if (!tiers) {
                return
            }
            state.tiersByTeamId[teamId] = tiers
            if (canEdit !== undefined) {
                state.canEditByTeamId[teamId] = canEdit
            }
        })
    },
})

export const {reducer} = dutyTiersSlice

const emptyTiers: DutyTier[] = []

// The slice is read through optional access so a caller whose store predates it
// — every test harness written before this feature — sees "nothing loaded"
// rather than a crash. A missing slice and an empty one mean the same thing to
// every screen that asks.

export const getDutyTiers = (teamId: string): ((state: RootState) => DutyTier[]) => createSelector(
    (state: RootState) => state.dutyTiers?.tiersByTeamId?.[teamId],
    (tiers) => tiers || emptyTiers,
)

export const canEditDutyTiers = (teamId: string): ((state: RootState) => boolean) => createSelector(
    (state: RootState) => state.dutyTiers?.canEditByTeamId?.[teamId],
    (canEdit) => Boolean(canEdit),
)

export const getTierBoardCounts = (teamId: string): ((state: RootState) => {[tierId: string]: number}) => createSelector(
    (state: RootState) => state.dutyTiers?.boardCountsByTeamId?.[teamId],
    (counts) => counts || {},
)

export const areDutyTiersLoaded = (teamId: string): ((state: RootState) => boolean) => createSelector(
    (state: RootState) => state.dutyTiers?.loadedTeamIds,
    (loadedTeamIds) => Boolean(loadedTeamIds?.includes(teamId)),
)
