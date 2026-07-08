// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit'

import client from '../octoClient'
import {BoardPermissionsResponse} from '../blocks/board'

import {RootState} from './index'

type BoardPermissionsState = {
    byBoardId: {[key: string]: BoardPermissionsResponse}
}

const initialState: BoardPermissionsState = {
    byBoardId: {},
}

export const fetchBoardPermissionsMe = createAsyncThunk(
    'boardPermissions/fetchMe',
    async (boardId: string) => {
        const permissions = await client.getBoardPermissionsMe(boardId)
        return {boardId, permissions}
    },
)

const boardPermissionsSlice = createSlice({
    name: 'boardPermissions',
    initialState,
    reducers: {
        setBoardPermissions: (state, action: PayloadAction<BoardPermissionsResponse>) => {
            state.byBoardId[action.payload.boardId] = action.payload
        },
    },
    extraReducers: (builder) => {
        builder.addCase(fetchBoardPermissionsMe.fulfilled, (state, action) => {
            if (!action.payload.permissions) {
                return
            }
            state.byBoardId[action.payload.boardId] = action.payload.permissions
        })
    },
})

export const {setBoardPermissions} = boardPermissionsSlice.actions
export const {reducer} = boardPermissionsSlice

export const getBoardPermissions = (boardId: string) => (state: RootState): BoardPermissionsResponse|undefined => {
    return state.boardPermissions.byBoardId[boardId]
}
