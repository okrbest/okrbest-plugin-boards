// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createSlice, PayloadAction} from '@reduxjs/toolkit'

import {Board} from '../blocks/board'

type RHSView = 'boards' | 'cards'

type RHSState = {
    currentView: RHSView
    selectedBoard: Board | null
}

const rhsSlice = createSlice({
    name: 'rhs',
    initialState: {
        currentView: 'boards' as RHSView,
        selectedBoard: null as Board | null,
    } as RHSState,
    reducers: {
        setCurrentView: (state, action: PayloadAction<RHSView>) => {
            state.currentView = action.payload
        },
        setSelectedBoard: (state, action: PayloadAction<Board | null>) => {
            state.selectedBoard = action.payload
        },
        showBoardCards: (state, action: PayloadAction<Board>) => {
            state.currentView = 'cards'
            state.selectedBoard = action.payload
        },
        showBoardsList: (state) => {
            state.currentView = 'boards'
            state.selectedBoard = null
        },
    },
})

export const {setCurrentView, setSelectedBoard, showBoardCards, showBoardsList} = rhsSlice.actions

export const getCurrentRHSView = (state: {rhs: RHSState}) => state.rhs.currentView
export const getSelectedBoard = (state: {rhs: RHSState}) => state.rhs.selectedBoard

export default rhsSlice.reducer 
