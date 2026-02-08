// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useCallback, useMemo} from 'react'
import {
    createBrowserRouter,
    RouterProvider,
    Navigate,
    useParams,
    useNavigate,
    generatePath,
    useLocation,
    useMatch,
    Outlet,
} from 'react-router-dom'

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

export const NAVIGATION_EVENT = 'focalboard:navigate'
export const NAVIGATION_REPLACE_EVENT = 'focalboard:navigate:replace'

interface NavigationEventDetail {
    path: string
    state?: unknown
}

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
        return <div className='focalboard-loading'>Loading...</div>
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

function NavigationEventHandler() {
    const navigate = useNavigate()

    const handleNavigate = useCallback((event: Event) => {
        const customEvent = event as CustomEvent<NavigationEventDetail>
        if (customEvent.detail?.path) {
            Utils.log(`Navigation event: ${customEvent.detail.path}`)
            navigate(customEvent.detail.path, {state: customEvent.detail.state})
        }
    }, [navigate])

    const handleNavigateReplace = useCallback((event: Event) => {
        const customEvent = event as CustomEvent<NavigationEventDetail>
        if (customEvent.detail?.path) {
            Utils.log(`Navigation replace event: ${customEvent.detail.path}`)
            navigate(customEvent.detail.path, {replace: true, state: customEvent.detail.state})
        }
    }, [navigate])

    useEffect(() => {
        window.addEventListener(NAVIGATION_EVENT, handleNavigate)
        window.addEventListener(NAVIGATION_REPLACE_EVENT, handleNavigateReplace)

        return () => {
            window.removeEventListener(NAVIGATION_EVENT, handleNavigate)
            window.removeEventListener(NAVIGATION_REPLACE_EVENT, handleNavigateReplace)
        }
    }, [handleNavigate, handleNavigateReplace])

    return null
}

function RootLayout() {
    return (
        <>
            <GlobalErrorRedirect/>
            <NavigationEventHandler/>
            <Outlet/>
        </>
    )
}

export function navigateTo(path: string, state?: unknown): void {
    window.dispatchEvent(new CustomEvent<NavigationEventDetail>(NAVIGATION_EVENT, {
        detail: {path, state},
    }))
}

export function navigateReplace(path: string, state?: unknown): void {
    window.dispatchEvent(new CustomEvent<NavigationEventDetail>(NAVIGATION_REPLACE_EVENT, {
        detail: {path, state},
    }))
}

function getBasename(): string {
    return Utils.isFocalboardPlugin() ? (window.frontendBaseURL || '') : ('/' + Utils.getFrontendBaseURL())
}

function createRoutes() {
    return [
        {
            path: '/',
            element: <RootLayout/>,
            children: [
                {
                    path: 'boards',
                    element: <Navigate to='/' replace/>,
                },
                {
                    index: true,
                    element: (
                        <FBRoute loginRequired={true}>
                            <HomeToCurrentTeamContent/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'welcome',
                    element: (
                        <FBRoute>
                            <WelcomePage/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'error',
                    element: (
                        <FBRoute>
                            <ErrorPage/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'team/:teamId/new/:channelId',
                    element: (
                        <FBRoute>
                            <BoardPage new={true}/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'team/:teamId/shared/:boardId?/:viewId?/:cardId?',
                    element: (
                        <FBRoute>
                            <BoardPage readonly={true}/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'shared/:boardId?/:viewId?/:cardId?',
                    element: (
                        <FBRoute>
                            <BoardPage readonly={true}/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'board/:boardId?/:viewId?/:cardId?',
                    element: (
                        <FBRoute
                            loginRequired={true}
                            getOriginalPath={(params) => {
                                return `/board/${Utils.buildOriginalPath('', params.boardId, params.viewId, params.cardId)}`
                            }}
                        >
                            <BoardPage/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'workspace/:workspaceId/shared/:boardId?/:viewId?/:cardId?',
                    element: (
                        <FBRoute>
                            <WorkspaceToTeamRedirect/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'workspace/:workspaceId/:boardId?/:viewId?/:cardId?',
                    element: (
                        <FBRoute>
                            <WorkspaceToTeamRedirect/>
                        </FBRoute>
                    ),
                },
                {
                    path: 'team/:teamId/:boardId?/:viewId?/:cardId?',
                    element: (
                        <FBRoute
                            loginRequired={true}
                            getOriginalPath={(params) => {
                                return `/team/${Utils.buildOriginalPath(params.teamId, params.boardId, params.viewId, params.cardId)}`
                            }}
                        >
                            <BoardPage/>
                        </FBRoute>
                    ),
                },
                {
                    path: '*',
                    element: null,
                },
            ],
        },
    ]
}

const FocalboardRouter = (): React.JSX.Element => {
    const router = useMemo(() => {
        const basename = getBasename()
        Utils.log(`Creating router with basename: ${basename}`)
        return createBrowserRouter(createRoutes(), {basename})
    }, [])

    return <RouterProvider router={router}/>
}

export default React.memo(FocalboardRouter)
