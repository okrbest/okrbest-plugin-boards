// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect} from 'react'
import {useNavigate, useParams, useLocation} from 'react-router-dom'

import {getBoards, getCurrentBoardId} from '../../store/boards'
import {setCurrent as setCurrentView, getCurrentBoardViews} from '../../store/views'
import {useAppSelector, useAppDispatch} from '../../store/hooks'
import {UserSettings} from '../../userSettings'
import {Utils} from '../../utils'
import {getSidebarCategories} from '../../store/sidebar'
import {Constants} from '../../constants'

const TeamToBoardAndViewRedirect = (): null => {
    const boardId = useAppSelector(getCurrentBoardId)
    const boardViews = useAppSelector(getCurrentBoardViews)
    const dispatch = useAppDispatch()
    const navigate = useNavigate()
    const params = useParams<{boardId: string, viewId: string, cardId?: string, teamId?: string}>()
    const location = useLocation()
    const categories = useAppSelector(getSidebarCategories)
    const boards = useAppSelector(getBoards)
    const teamId = params.teamId || UserSettings.lastTeamId || Constants.globalTeamId

    useEffect(() => {
        let boardID = params.boardId
        if (!params.boardId) {
            // first preference is for last visited board, but only if it exists in the current team's boards
            const lastBoardID = UserSettings.lastBoardId[teamId]
            const boardsList = Object.values(boards)
            // 현재 팀의 보드가 로드되었는지 확인 (이전 팀의 보드가 아닌지)
            const currentTeamBoardsLoaded = boardsList.some((b) => b.teamId === teamId)
            Utils.log(`TeamToBoardAndViewRedirect: teamId=${teamId}, lastBoardID=${lastBoardID}, currentTeamBoardsLoaded=${currentTeamBoardsLoaded}, boardsCount=${boardsList.length}, categoriesCount=${categories.length}`)

            // 현재 팀의 보드가 아직 로드되지 않았으면 기다림
            if (!currentTeamBoardsLoaded && boardsList.length > 0) {
                Utils.log(`TeamToBoardAndViewRedirect: waiting for current team boards to load...`)
                return
            }

            if (lastBoardID && boards[lastBoardID]) {
                boardID = lastBoardID
            } else if (lastBoardID && currentTeamBoardsLoaded && !boards[lastBoardID]) {
                // Board list is loaded for current team but the saved board doesn't exist — clear stale entry
                Utils.log(`TeamToBoardAndViewRedirect: clearing stale lastBoardID=${lastBoardID}`)
                UserSettings.setLastBoardID(teamId, null)
            }

            if (!boardID && categories.length > 0) {
                let goToBoardID: string | null = null

                for (const category of categories) {
                    for (const boardMetadata of category.boardMetadata) {
                        if (!boardMetadata.hidden && boards[boardMetadata.boardID]) {
                            goToBoardID = boardMetadata.boardID
                            break
                        }
                    }
                }

                if (goToBoardID) {
                    boardID = goToBoardID
                }
            }

            if (!boardID && currentTeamBoardsLoaded) {
                const firstAccessibleBoard = boardsList.find((board) => board.teamId === teamId && !board.isTemplate && !board.deleteAt)
                if (firstAccessibleBoard) {
                    boardID = firstAccessibleBoard.id
                }
            }

            if (boardID) {
                const newPath = Utils.buildBoardPath(location.pathname, {...params, boardId: boardID})
                navigate(newPath, {replace: true})
                return
            }
        }

        let viewID = params.viewId

        if ((!viewID || viewID === '0') && boardId && boardId === params.boardId && boardViews && boardViews.length > 0) {
            viewID = UserSettings.lastViewId[boardID || '']
            if (viewID) {
                UserSettings.setLastViewId(boardID || '', viewID)
                dispatch(setCurrentView(viewID))
            } else if (boardViews.length > 0) {
                viewID = boardViews[0].id
                UserSettings.setLastViewId(boardID || '', viewID)
                dispatch(setCurrentView(viewID))
            }

            if (viewID) {
                const newPath = Utils.buildBoardPath(location.pathname, {...params, viewId: viewID})
                navigate(newPath, {replace: true})
            }
        }
    }, [teamId, params.boardId, params.viewId, categories.length, boardViews.length, boardId, boards, dispatch, location.pathname, navigate, params])

    return null
}

export default TeamToBoardAndViewRedirect
