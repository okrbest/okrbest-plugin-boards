// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState, useMemo, useCallback} from 'react'
import {batch} from 'react-redux'
import {FormattedMessage, useIntl} from 'react-intl'
import {useParams, useNavigate} from 'react-router-dom'

import Workspace from '../../components/workspace'
// import VersionMessage from '../../components/messages/versionMessage' // 미사용
import octoClient from '../../octoClient'
import {Subscription, WSClient} from '../../wsclient'
import {Utils} from '../../utils'
import {useWebsockets} from '../../hooks/websockets'
import {IUser} from '../../user'
import {Block} from '../../blocks/block'
import {CommentBlock} from '../../blocks/commentBlock'
import {AttachmentBlock} from '../../blocks/attachmentBlock'
import {Board, BoardMember} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import {
    updateBoards,
    updateMembersEnsuringBoardsAndUsers,
    getCurrentBoardId,
    setCurrent as setCurrentBoard,
    fetchBoardMembers,
    addMyBoardMemberships,
} from '../../store/boards'
import {getCurrentViewId, setCurrent as setCurrentView, updateViews} from '../../store/views'
import ConfirmationDialog from '../../components/confirmationDialogBox'
import {initialLoad, initialReadOnlyLoad, loadBoardData} from '../../store/initialLoad'
import {useAppSelector, useAppDispatch} from '../../store/hooks'
import {setTeam} from '../../store/teams'
import {updateCards} from '../../store/cards'
import {updateComments} from '../../store/comments'
import {updateAttachments} from '../../store/attachments'
import {fetchBoardPermissionsMe} from '../../store/boardPermissions'
import {
    fetchUserBlockSubscriptions,
    getMe,
    followBlock,
    unfollowBlock,
} from '../../store/users'
import {setGlobalError} from '../../store/globalError'
import {UserSettings} from '../../userSettings'

import IconButton from '../../widgets/buttons/iconButton'
import CloseIcon from '../../widgets/icons/close'

import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'

import {Constants} from '../../constants'

import {getCategoryOfBoard, getHiddenBoardIDs, removeBoardsFromAllCategories} from '../../store/sidebar'
import {fetchOrgMaster, isOrgMasterLoaded} from '../../store/orgMaster'

import SetWindowTitleAndIcon from './setWindowTitleAndIcon'
import TeamToBoardAndViewRedirect from './teamToBoardAndViewRedirect'
import UndoRedoHotKeys from './undoRedoHotKeys'
import BackwardCompatibilityQueryParamsRedirect from './backwardCompatibilityQueryParamsRedirect'
import WebsocketConnection from './websocketConnection'

import './boardPage.scss'

type Props = {
    readonly?: boolean
    new?: boolean
}

const BoardPage = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const activeBoardId = useAppSelector(getCurrentBoardId)
    const activeViewId = useAppSelector(getCurrentViewId)
    const dispatch = useAppDispatch()
    const params = useParams<{boardId: string, viewId: string, cardId?: string, teamId?: string}>()
    const navigate = useNavigate()
    const [mobileWarningClosed, setMobileWarningClosed] = useState(UserSettings.mobileWarningClosed)
    const teamId = params.teamId || UserSettings.lastTeamId || Constants.globalTeamId
    const orgMasterLoaded = useAppSelector(isOrgMasterLoaded(teamId))
    const viewId = params.viewId
    const me = useAppSelector<IUser|null>(getMe)
    const hiddenBoardIDs = useAppSelector(getHiddenBoardIDs)
    const categorySelector = useMemo(() => getCategoryOfBoard(activeBoardId), [activeBoardId])
    const category = useAppSelector(categorySelector)
    const [showJoinBoardDialog, setShowJoinBoardDialog] = useState<boolean>(false)

    // if we're in a legacy route and not showing a shared board,
    // redirect to the new URL schema equivalent
    if (Utils.isFocalboardLegacy() && !props.readonly) {
        window.location.href = window.location.href.replace('/plugins/focalboard', '/boards')
    }

    // Load user's block subscriptions when workspace changes.
    // Keep this hook unconditional and branch inside to preserve hook order.
    useEffect(() => {
        if (!Utils.isFocalboardPlugin() || !me) {
            return
        }
        dispatch(fetchUserBlockSubscriptions(me.id))
    }, [dispatch, me?.id])

    // Note: Team ID synchronization - updates both UserSettings and octoClient
    // This is safe here because this is the root render function that manages team context
    // dispatch is stable from useAppDispatch, so it doesn't need to be in dependencies
    useEffect(() => {
        UserSettings.lastTeamId = teamId
        octoClient.teamId = teamId
        dispatch(setTeam(teamId))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId])

    // The organisation master backs the 본부/부서 property editors and the
    // narrowing of person choices, so it has to be in the store before a card
    // is opened rather than only after the share dialog has been visited.
    //
    // Fetched once per team and kept: the master changes on reorganisations,
    // not during a session. Boards with no organisation properties pay one
    // request each way and nothing else.
    useEffect(() => {
        if (teamId && !orgMasterLoaded) {
            dispatch(fetchOrgMaster(teamId))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId, orgMasterLoaded])

    const loadAction = useMemo(() => {
        if (props.readonly) {
            return initialReadOnlyLoad as (boardId?: string) => any
        }
        return initialLoad as (boardId?: string) => any
    }, [props.readonly])

    useWebsockets(teamId, (wsClient) => {
        const incrementalBlockUpdate = (_: WSClient, blocks: Block[]) => {
            const teamBlocks = blocks

            batch(() => {
                dispatch(updateViews(teamBlocks.filter((b: Block) => b.type === 'view' || b.deleteAt !== 0) as BoardView[]))
                dispatch(updateCards(teamBlocks.filter((b: Block) => b.type === 'card' || b.deleteAt !== 0) as Card[]))
                dispatch(updateComments(teamBlocks.filter((b: Block) => b.type === 'comment' || b.deleteAt !== 0) as CommentBlock[]))
                dispatch(updateAttachments(teamBlocks.filter((b: Block) => b.type === 'attachment' || b.deleteAt !== 0) as AttachmentBlock[]))
            })

            // Card level permissions are keyed on the values a card carries, so
            // someone else changing a property can change what this member may
            // do with it. Refreshed only when a card actually moved, and only on
            // boards that have rules — the response omits the map otherwise.
            const cardChanged = teamBlocks.some((b: Block) => b.type === 'card')
            if (cardChanged && activeBoardId) {
                dispatch(fetchBoardPermissionsMe(activeBoardId))
            }
        }

        const incrementalBoardUpdate = (_: WSClient, boards: Board[]) => {
            // only takes into account the entities that belong to the team or the user boards
            const teamBoards = boards.filter((b: Board) => b.teamId === Constants.globalTeamId || b.teamId === teamId)
            const activeBoard = teamBoards.find((b: Board) => b.id === activeBoardId)
            dispatch(updateBoards(teamBoards))

            if (activeBoard) {
                dispatch(fetchBoardMembers({
                    teamId,
                    boardId: activeBoardId,
                }))
            }

            // remove boards from all categories if they are deleted
            const deletedBoardIds = teamBoards.filter((b: Board) => b.deleteAt && b.deleteAt !== 0).map((b) => b.id)
            if (deletedBoardIds.length > 0) {
                dispatch(removeBoardsFromAllCategories(deletedBoardIds))
            }
        }

        const incrementalBoardMemberUpdate = (_: WSClient, members: BoardMember[]) => {
            dispatch(updateMembersEnsuringBoardsAndUsers(members))

            if (me) {
                const myBoardMemberships = members.filter((boardMember) => boardMember.userId === me.id)
                dispatch(addMyBoardMemberships(myBoardMemberships))
            }
        }

        const dispatchLoadAction = () => {
            dispatch(loadAction(params.boardId))
        }

        Utils.log('useWEbsocket adding onChange handler')
        wsClient.addOnChange(incrementalBlockUpdate, 'block')
        wsClient.addOnChange(incrementalBoardUpdate, 'board')
        wsClient.addOnChange(incrementalBoardMemberUpdate, 'boardMembers')
        wsClient.addOnReconnect(dispatchLoadAction)

        wsClient.setOnFollowBlock((_: WSClient, subscription: Subscription): void => {
            if (subscription.subscriberId === me?.id) {
                dispatch(followBlock(subscription))
            }
        })
        wsClient.setOnUnfollowBlock((_: WSClient, subscription: Subscription): void => {
            if (subscription.subscriberId === me?.id) {
                dispatch(unfollowBlock(subscription))
            }
        })

        return () => {
            Utils.log('useWebsocket cleanup')
            wsClient.removeOnChange(incrementalBlockUpdate, 'block')
            wsClient.removeOnChange(incrementalBoardUpdate, 'board')
            wsClient.removeOnChange(incrementalBoardMemberUpdate, 'boardMembers')
            wsClient.removeOnReconnect(dispatchLoadAction)
        }
    }, [me?.id, activeBoardId])

    const onConfirmJoin = async () => {
        if (me && params.boardId) {
            joinBoard(me, teamId, params.boardId, true)
            setShowJoinBoardDialog(false)
        }
    }

    const joinBoard = async (myUser: IUser, boardTeamId: string, boardId: string, allowAdmin: boolean) => {
        const member = await octoClient.joinBoard(boardId, allowAdmin)
        if (!member) {
            if (myUser.permissions?.find((s) => s === 'manage_system' || s === 'manage_team')) {
                setShowJoinBoardDialog(true)
                return
            }
            UserSettings.setLastBoardID(boardTeamId, null)
            UserSettings.setLastViewId(boardId, null)
            dispatch(setGlobalError('board-not-found'))
            return
        }
        const result: any = await dispatch(loadBoardData(boardId))
        if (result.payload.blocks.length > 0 && myUser.id) {
            // set board as most recently viewed board
            UserSettings.setLastBoardID(boardTeamId, boardId)
        }
    }

    const loadOrJoinBoard = useCallback(async (myUser: IUser, boardTeamId: string, boardId: string) => {
        // Verify the board exists and belongs to the current team before attempting to load/join.
        const board = await octoClient.getBoard(boardId)
        if (!board) {
            Utils.log(`loadOrJoinBoard: board ${boardId} not found. Clearing saved state.`)
            UserSettings.setLastBoardID(boardTeamId, null)
            UserSettings.setLastViewId(boardId, null)
            dispatch(setGlobalError('board-not-found'))
            return
        }
        if (board.teamId !== boardTeamId && board.teamId !== Constants.globalTeamId) {
            Utils.log(`loadOrJoinBoard: board ${boardId} belongs to team ${board.teamId}, not ${boardTeamId}. Skipping.`)
            return
        }

        // Ensure board/template is in Redux state (critical for templates, esp. global templates
        // which are not included in initialLoad's getTeamTemplates)
        dispatch(updateBoards([board]))

        const result: any = await dispatch(loadBoardData(boardId))
        if (result.payload.blocks.length === 0 && myUser.id) {
            joinBoard(myUser, boardTeamId, boardId, false)
        } else {
            // set board as most recently viewed board
            UserSettings.setLastBoardID(boardTeamId, boardId)
        }

        dispatch(fetchBoardMembers({
            teamId: boardTeamId,
            boardId,
        }))
        dispatch(fetchBoardPermissionsMe(boardId))
    }, [])

    useEffect(() => {
        const run = async () => {
            await dispatch(loadAction(params.boardId))

            if (params.boardId) {
                dispatch(setCurrentBoard(params.boardId))
                dispatch(fetchBoardPermissionsMe(params.boardId))

                if (viewId && viewId !== Constants.globalTeamId) {
                    dispatch(setCurrentView(viewId))
                    if (params.boardId) {
                        UserSettings.setLastViewId(params.boardId, viewId)
                    }
                }
            }

            // Run after initialLoad so fetched board/template is not overwritten by initialLoad.fulfilled
            if (params.boardId && !props.readonly && me) {
                await loadOrJoinBoard(me, teamId, params.boardId)
            }
        }
        run()
    }, [teamId, params.boardId, viewId, me?.id, dispatch, loadAction, props.readonly, loadOrJoinBoard])

    const handleUnhideBoard = async (boardID: string) => {
        if (!me || !category) {
            return
        }

        await octoClient.unhideBoard(category.id, boardID)
    }

    useEffect(() => {
        if (!teamId || !params.boardId) {
            return
        }

        if (hiddenBoardIDs.indexOf(params.boardId) >= 0) {
            handleUnhideBoard(params.boardId)
        }
    }, [me?.id, teamId, params.boardId, hiddenBoardIDs])

    // A "default filter" used to be written here on first open: the viewer's own
    // org unit IDs were stamped onto the board's TEAM property filter.
    //
    // It was removed rather than repaired, for three reasons. The IDs never
    // matched — org units are keyed in the organization master while a property
    // filter takes the property's own option IDs, so the filter selected nothing
    // and the board came up empty. The view it wrote to is shared, so one
    // member's preference silently replaced the filter everyone else was using.
    // And the guard was localStorage, per browser, so it fired again for every
    // new member and every new browser.
    //
    // Card level access is what actually narrows a board per person, and it is
    // enforced on the server. Restoring this as a per-user convenience would mean
    // a client side view filter that is never written back.

    useEffect(() => {
        if (!props.readonly || !activeBoardId || !activeViewId) {
            return
        }

        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ViewSharedBoard, {board: activeBoardId, view: activeViewId})
    }, [props.readonly, activeBoardId, activeViewId])

    return (
        <>
            {showJoinBoardDialog &&
                <ConfirmationDialog
                    dialogBox={{
                        heading: intl.formatMessage({id: 'boardPage.confirm-join-title', defaultMessage: 'Join private board'}),
                        subText: intl.formatMessage({
                            id: 'boardPage.confirm-join-text',
                            defaultMessage: 'You are about to join a private board without explicitly being added by the board admin. Are you sure you wish to join this private board?',
                        }),
                        confirmButtonText: intl.formatMessage({id: 'boardPage.confirm-join-button', defaultMessage: 'Join'}),
                        destructive: true, //board.channelId !== '',

                        onConfirm: onConfirmJoin,
                        onClose: () => {
                            setShowJoinBoardDialog(false)
                            navigate(-1)
                        },
                    }}
                />}

            {!showJoinBoardDialog &&
                <div className='BoardPage'>
                    {!props.new && <TeamToBoardAndViewRedirect/>}
                    <BackwardCompatibilityQueryParamsRedirect/>
                    <SetWindowTitleAndIcon/>
                    <UndoRedoHotKeys/>
                    <WebsocketConnection/>
                    {/* <VersionMessage/> */}

                    {!mobileWarningClosed &&
                        <div className='mobileWarning'>
                            <div>
                                <FormattedMessage
                                    id='Error.mobileweb'
                                    defaultMessage='Mobile web support is currently in early beta. Not all functionality may be present.'
                                />
                            </div>
                            <IconButton
                                onClick={() => {
                                    UserSettings.mobileWarningClosed = true
                                    setMobileWarningClosed(true)
                                }}
                                icon={<CloseIcon/>}
                                title='Close'
                                className='margin-right'
                            />
                        </div>}

                    {props.readonly && activeBoardId === undefined &&
                        <div className='error'>
                            {intl.formatMessage({id: 'BoardPage.syncFailed', defaultMessage: 'Board may be deleted or access revoked.'})}
                        </div>}
                    {

                        // Don't display Templates page
                        // if readonly mode and no board defined.
                        (!props.readonly || activeBoardId !== undefined) &&
                        <Workspace
                            readonly={props.readonly || false}
                        />
                    }
                </div>
            }
        </>
    )
}

export default BoardPage
