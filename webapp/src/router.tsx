// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useMemo} from 'react'
import {
    unstable_HistoryRouter as HistoryRouter,
    Navigate,
    Routes,
    Route,
    useParams,
    useNavigate,
    generatePath,
    useLocation,
    useMatch,
} from 'react-router-dom'
import {createBrowserHistory, type History as HistoryLib} from 'history'
import type {History as RouterHistory} from '@remix-run/router'

import {IAppWindow} from './types'
import BoardPage from './pages/boardPage/boardPage'
import WelcomePage from './pages/welcome/welcomePage'
import ErrorPage from './pages/errorPage'
import {Utils} from './utils'
import octoClient from './octoClient'
import {setGlobalError, getGlobalError} from './store/globalError'
import {useAppSelector, useAppDispatch} from './store/hooks'
import {getFirstTeam, fetchTeams, Team} from './store/teams'
import {getSidebarCategories, CategoryBoards} from './store/sidebar'
import {getMySortedBoards} from './store/boards'
import {UserSettings} from './userSettings'
import FBRoute from './route'

declare let window: IAppWindow

function HomeToCurrentTeamContent() {
    const firstTeam = useAppSelector<Team|null>(getFirstTeam)
    const dispatch = useAppDispatch()
    const categories = useAppSelector<CategoryBoards[]>(getSidebarCategories)
    const myBoards = useAppSelector(getMySortedBoards)

    useEffect(() => {
        dispatch(fetchTeams())
    }, [dispatch])

    let teamID = (window.getCurrentTeamId && window.getCurrentTeamId()) || ''
    const lastTeamID = UserSettings.lastTeamId
    if (!teamID && !firstTeam && !lastTeamID) {
        return null
    }
    teamID = teamID || lastTeamID || firstTeam?.id || ''

    if (UserSettings.lastBoardId) {
        const lastBoardID = UserSettings.lastBoardId[teamID]
        const lastViewID = UserSettings.lastViewId[lastBoardID]

        if (lastBoardID) {
            const validBoardIds = new Set(myBoards.filter((b) => !b.deleteAt).map((b) => b.id))

            if (!validBoardIds.has(lastBoardID)) {
                let fallbackBoardId: string | null = null
                for (const category of categories) {
                    const visible = category.boardMetadata.find((m) => !m.hidden && validBoardIds.has(m.boardID))
                    if (visible) {
                        fallbackBoardId = visible.boardID
                        break
                    }
                }

                if (fallbackBoardId) {
                    UserSettings.setLastBoardID(teamID, fallbackBoardId)
                    return <Navigate to={`/team/${teamID}/${fallbackBoardId}`} replace/>
                }

                UserSettings.setLastBoardID(teamID, null)
                return <Navigate to={`/team/${teamID}`} replace/>
            }
        }

        if (lastBoardID && lastViewID) {
            return <Navigate to={`/team/${teamID}/${lastBoardID}/${lastViewID}`} replace/>
        }
        if (lastBoardID) {
            return <Navigate to={`/team/${teamID}/${lastBoardID}`} replace/>
        }
    }

    return <Navigate to={`/team/${teamID}`} replace/>
}

function WorkspaceToTeamRedirect() {
    const params = useParams<{boardId: string, viewId: string, cardId?: string, workspaceId?: string}>()
    const location = useLocation()
    const queryParams = new URLSearchParams(location.search)
    const navigate = useNavigate()
    const match = useMatch('/workspace/:workspaceId/:boardId?/:viewId?/:cardId?')

    useEffect(() => {
        if (!params.boardId) {
            return
        }
        octoClient.getBoard(params.boardId).then((board) => {
            if (board) {
                const pathTemplate = match?.pattern.path.replace('/workspace/:workspaceId', '/team/:teamId') || '/team/:teamId/:boardId?/:viewId?/:cardId?'
                let newPath = generatePath(pathTemplate, {
                    teamId: board?.teamId,
                    boardId: board?.id,
                    viewId: params.viewId || undefined,
                    cardId: params.cardId || undefined,
                })
                if (queryParams.toString()) {
                    newPath += '?' + queryParams.toString()
                }
                navigate(newPath, {replace: true})
            }
        })
    }, [params.boardId, params.viewId, params.cardId, navigate, match, queryParams])
    return null
}

function GlobalErrorRedirect() {
    const globalError = useAppSelector<string>(getGlobalError)
    const dispatch = useAppDispatch()
    const navigate = useNavigate()

    useEffect(() => {
        if (globalError) {
            dispatch(setGlobalError(''))
            navigate(`/error?id=${globalError}`, {replace: true})
        }
    }, [globalError, navigate, dispatch])

    return null
}

type Props = {
    history?: HistoryLib
}

const FocalboardRouter = (props: Props): JSX.Element => {
    const browserHistory = useMemo(() => {
        if (props.history) {
            return props.history
        }
        return createBrowserHistory({window})
    }, [props.history])

    useEffect(() => {
        if (window.frontendBaseURL) {
            browserHistory.replace(window.location.pathname.replace(window.frontendBaseURL, ''))
        }
    }, [browserHistory])

    const basename = Utils.getFrontendBaseURL()

    return (
        <HistoryRouter history={browserHistory as unknown as RouterHistory} basename={basename}>
            <GlobalErrorRedirect/>
            <Routes>
                <Route
                    path='/'
                    element={
                        <FBRoute loginRequired={true}>
                            <HomeToCurrentTeamContent/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/welcome'
                    element={
                        <FBRoute>
                            <WelcomePage/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/error'
                    element={
                        <FBRoute>
                            <ErrorPage/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/team/:teamId/new/:channelId'
                    element={
                        <FBRoute>
                            <BoardPage new={true}/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/team/:teamId/shared/:boardId?/:viewId?/:cardId?'
                    element={
                        <FBRoute>
                            <BoardPage readonly={true}/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/shared/:boardId?/:viewId?/:cardId?'
                    element={
                        <FBRoute>
                            <BoardPage readonly={true}/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/board/:boardId?/:viewId?/:cardId?'
                    element={
                        <FBRoute
                            loginRequired={true}
                            getOriginalPath={(params) => {
                                return `/board/${Utils.buildOriginalPath('', params.boardId, params.viewId, params.cardId)}`
                            }}
                        >
                            <BoardPage/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/workspace/:workspaceId/shared/:boardId?/:viewId?/:cardId?'
                    element={
                        <FBRoute>
                            <WorkspaceToTeamRedirect/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/workspace/:workspaceId/:boardId?/:viewId?/:cardId?'
                    element={
                        <FBRoute>
                            <WorkspaceToTeamRedirect/>
                        </FBRoute>
                    }
                />
                <Route
                    path='/team/:teamId/:boardId?/:viewId?/:cardId?'
                    element={
                        <FBRoute
                            loginRequired={true}
                            getOriginalPath={(params) => {
                                return `/team/${Utils.buildOriginalPath(params.teamId, params.boardId, params.viewId, params.cardId)}`
                            }}
                        >
                            <BoardPage/>
                        </FBRoute>
                    }
                />
            </Routes>
        </HistoryRouter>
    )
}

export default React.memo(FocalboardRouter)
