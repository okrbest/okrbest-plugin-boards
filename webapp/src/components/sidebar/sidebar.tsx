// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {FormattedMessage} from 'react-intl'
import {DragDropContext, Droppable, DropResult} from '@hello-pangea/dnd'

import {getActiveThemeName, loadTheme} from '../../theme'
import IconButton from '../../widgets/buttons/iconButton'
import HamburgerIcon from '../../widgets/icons/hamburger'
import HideSidebarIcon from '../../widgets/icons/hideSidebar'
import ShowSidebarIcon from '../../widgets/icons/showSidebar'
import {getCurrentBoard, getMySortedBoards} from '../../store/boards'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {Utils} from '../../utils'
import {IUser} from '../../user'

import './sidebar.scss'

import {
    BoardCategoryWebsocketData,
    Category,
    CategoryBoardMetadata,
    CategoryBoards,
    fetchSidebarCategories,
    getSidebarCategories,
    updateBoardCategories,
    updateCategories,
    updateCategoryBoardsOrder,
    updateCategoryOrder,
} from '../../store/sidebar'

import BoardsSwitcher from '../boardsSwitcher/boardsSwitcher'

import wsClient, {WSClient} from '../../wsclient'

import {getCurrentTeam, getCurrentTeamId} from '../../store/teams'

import {Constants} from '../../constants'

import {getMe} from '../../store/users'
import {getCurrentViewId} from '../../store/views'

import octoClient from '../../octoClient'

import {useWebsockets} from '../../hooks/websockets'


import SidebarCategory from './sidebarCategory'
import {getSortedCategoryBoards, insertVisibleBoard, moveVisibleBoard, withRecoveredBoards} from './categoryBoards'
import SidebarSettingsMenu from './sidebarSettingsMenu'
import SidebarUserMenu from './sidebarUserMenu'

type Props = {
    activeBoardId?: string
    onBoardTemplateSelectorOpen: () => void
    onBoardTemplateSelectorClose?: () => void
}

// 화면에서만 복구된 보드(서버 카테고리에 없는 보드)를 먼저 카테고리에 넣어야
// 서버의 reorder 검증(보드 개수·집합 일치)을 통과한다. 하나라도 실패하면 빈 배열을 돌려 호출부가 되돌리게 한다.
async function persistCategoryBoardsOrder(teamID: string, categoryID: string, knownBoardIDs: Set<string>, boardsMetadata: CategoryBoardMetadata[]): Promise<string[]> {
    for (const metadata of boardsMetadata) {
        if (knownBoardIDs.has(metadata.boardID)) {
            continue
        }
        // eslint-disable-next-line no-await-in-loop
        const response = await octoClient.moveBoardToCategory(teamID, metadata.boardID, categoryID, '')
        if (!response.ok) {
            Utils.logError(`failed to add board to category before reorder. boardID: ${metadata.boardID}, categoryID: ${categoryID}`)
            return []
        }
    }

    return octoClient.reorderSidebarCategoryBoards(teamID, categoryID, boardsMetadata.map((m) => m.boardID))
}

function getWindowDimensions() {
    const {innerWidth: width, innerHeight: height} = window
    return {
        width,
        height,
    }
}

const Sidebar = (props: Props) => {
    const [isHidden, setHidden] = useState(false)
    const [userHidden, setUserHidden] = useState(false)
    const [windowDimensions, setWindowDimensions] = useState(getWindowDimensions())
    const boards = useAppSelector(getMySortedBoards)
    const dispatch = useAppDispatch()
    const sidebarCategories = useAppSelector<CategoryBoards[]>(getSidebarCategories)
    const me = useAppSelector<IUser|null>(getMe)
    const activeViewID = useAppSelector(getCurrentViewId)
    const currentBoard = useAppSelector(getCurrentBoard)
    const [initialized, setInitialized] = useState(false)
    const checkedBoardKeysRef = useRef<Set<string>>(new Set())

    // 화면과 드래그 앤 드롭이 같은 목록을 보도록 여기서 한 번만 만든다.
    const resolvedCategories = useMemo(
        () => sidebarCategories.map((category) => withRecoveredBoards(category, sidebarCategories, boards)),
        [sidebarCategories, boards],
    )

    useEffect(() => {
        const categoryOnChangeHandler = (_: WSClient, categories: Category[]) => {
            dispatch(updateCategories(categories))
        }

        const blockCategoryOnChangeHandler = (_: WSClient, blockCategories: BoardCategoryWebsocketData[]) => {
            dispatch(updateBoardCategories(blockCategories))
        }

        wsClient.addOnChange(categoryOnChangeHandler, 'category')
        wsClient.addOnChange(blockCategoryOnChangeHandler, 'blockCategories')

        return function cleanup() {
            wsClient.removeOnChange(categoryOnChangeHandler, 'category')
            wsClient.removeOnChange(blockCategoryOnChangeHandler, 'blockCategories')
        }
    }, [])

    const teamId = useAppSelector(getCurrentTeamId)
    const team = useAppSelector(getCurrentTeam)

    useEffect(() => {
        setInitialized(false)
        if (team) {
            dispatch(fetchSidebarCategories(team!.id)).then(() => {
                setInitialized(true)
            })
        }
        loadTheme()
    }, [team?.id, dispatch])

    useEffect(() => {
        function handleResize() {
            setWindowDimensions(getWindowDimensions())
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        hideSidebar()
    }, [windowDimensions])

    // This handles the case when a user opens a linked board from Channels RHS
    // and thats the first time that user is opening that board.
    // Here we check if that board has a associated category for the user. If not,
    // we assign it to the default "Boards" category.
    // We do this on the client side rather than the server side like for all other cases
    // because there is no good, explicit API call to add this logic to when opening
    // a board that you have implicit access to.
    useEffect(() => {
        if (!initialized || !sidebarCategories || sidebarCategories.length === 0 || !currentBoard || !team || currentBoard.isTemplate) {
            return
        }

        const key = `${team.id}:${currentBoard.id}`
        if (checkedBoardKeysRef.current.has(key)) {
            return
        }

        // find the category the current board belongs to
        const category = sidebarCategories.find((c) => c.boardMetadata.find((boardMetadata) => boardMetadata.boardID === currentBoard.id))
        if (category) {
            // Boards does belong to a category.
            // All good here. Nothing to do
            checkedBoardKeysRef.current.add(key)
            return
        }

        // Local state may be momentarily stale (multi-tab moves, out-of-order
        // WS events, quick navigation). Mark as checked before re-verifying
        // against the server so this effect doesn't re-fire for the same
        // board while the confirmation request is in flight.
        checkedBoardKeysRef.current.add(key)
        let cancelled = false

        dispatch(fetchSidebarCategories(team.id)).then((result) => {
            if (cancelled) {
                return
            }

            const latestCategories = (result.payload || []) as CategoryBoards[]
            const stillMissing = !latestCategories.find((c) => c.boardMetadata.find((boardMetadata) => boardMetadata.boardID === currentBoard.id))
            if (!stillMissing) {
                // was a stale-state race, board already belongs to a category
                return
            }

            // if the board doesn't belong to a category
            // we need to move it to the default "Boards" category
            const boardsCategory = latestCategories.find((c) => c.name === 'Boards')
            if (!boardsCategory) {
                Utils.logError('Boards category not found for user')
                return
            }

            octoClient.moveBoardToCategory(team.id, currentBoard.id, boardsCategory.id, '')
        })

        return () => {
            cancelled = true
        }
    }, [sidebarCategories, currentBoard, team, initialized])

    useWebsockets(teamId, (websocketClient: WSClient) => {
        const onCategoryReorderHandler = (_: WSClient, newCategoryOrder: string[]): void => {
            dispatch(updateCategoryOrder(newCategoryOrder))
        }

        websocketClient.addOnChange(onCategoryReorderHandler, 'categoryOrder')
        return () => {
            websocketClient.removeOnChange(onCategoryReorderHandler, 'categoryOrder')
        }
    }, [teamId])

    const hideSidebar = () => {
        if (!userHidden) {
            if (windowDimensions.width < 768) {
                setHidden(true)
            } else {
                setHidden(false)
            }
        }
    }

    const handleCategoryDND = useCallback(async (result: DropResult) => {
        const {destination, source} = result
        if (!team || !destination) {
            return
        }

        const categories = sidebarCategories

        // creating a mutable copy
        const newCategories = Array.from(categories)

        // remove category from old index
        newCategories.splice(source.index, 1)

        // add it to new index
        newCategories.splice(destination.index, 0, categories[source.index])

        const newCategoryOrder = newCategories.map((category) => category.id)

        // optimistically updating the store to produce a lag-free UI
        await dispatch(updateCategoryOrder(newCategoryOrder))
        await octoClient.reorderSidebarCategories(team.id, newCategoryOrder)
    }, [team, sidebarCategories, boards])

    const handleCategoryBoardDND = useCallback(async (result: DropResult) => {
        const {source, destination, draggableId} = result

        if (!team || !destination) {
            return
        }

        const fromCategoryID = source.droppableId
        const toCategoryID = destination.droppableId
        const boardID = draggableId

        // 드롭 인덱스는 화면이 그린 목록(복구된 보드 포함, 숨김·템플릿 제외) 기준이다.
        // 스토어의 카테고리 목록으로 해석하면 인덱스가 어긋나 빈 항목이 들어간다.
        const toSidebarCategory = resolvedCategories.find((category) => category.id === toCategoryID)
        if (!toSidebarCategory) {
            Utils.logError(`toCategoryID not found in list of sidebar categories. toCategoryID: ${toCategoryID}`)
            return
        }

        // 서버가 아는 보드 집합. 실패하면 이 상태로 되돌린다.
        const storedToCategory = sidebarCategories.find((category) => category.id === toCategoryID)
        const previousToBoardsMetadata = [...(storedToCategory?.boardMetadata || [])]
        const knownBoardIDs = new Set(previousToBoardsMetadata.map((m) => m.boardID))

        if (fromCategoryID === toCategoryID) {
            const categoryBoardMetadata = moveVisibleBoard(toSidebarCategory, boards, boardID, destination.index)
            if (!categoryBoardMetadata) {
                Utils.logError(`dragged board is not visible in category. boardID: ${boardID}, categoryID: ${toCategoryID}`)
                return
            }

            // optimistically updating the store to produce a lag-free UI
            dispatch(updateCategoryBoardsOrder({categoryID: toCategoryID, boardsMetadata: categoryBoardMetadata}))

            try {
                const updatedOrder = await persistCategoryBoardsOrder(team.id, toCategoryID, knownBoardIDs, categoryBoardMetadata)
                if (updatedOrder.length > 0) {
                    return
                }

                // 서버가 거부했다. 대개 로컬 상태가 낡은 경우라 최신 상태 위에서 같은 이동을 한 번 더 시도한다.
                const latestCategories = ((await dispatch(fetchSidebarCategories(team.id))).payload || []) as CategoryBoards[]
                const latestCategory = latestCategories.find((category) => category.id === toCategoryID)
                if (!latestCategory) {
                    return
                }

                const retryBoardMetadata = moveVisibleBoard(withRecoveredBoards(latestCategory, latestCategories, boards), boards, boardID, destination.index)
                if (!retryBoardMetadata) {
                    return
                }

                dispatch(updateCategoryBoardsOrder({categoryID: toCategoryID, boardsMetadata: retryBoardMetadata}))
                const latestKnownBoardIDs = new Set(latestCategory.boardMetadata.map((m) => m.boardID))
                const retriedOrder = await persistCategoryBoardsOrder(team.id, toCategoryID, latestKnownBoardIDs, retryBoardMetadata)
                if (retriedOrder.length === 0) {
                    await dispatch(fetchSidebarCategories(team.id))
                }
            } catch (error) {
                Utils.logError(`failed to reorder category boards: ${error}`)
                dispatch(updateCategoryBoardsOrder({categoryID: toCategoryID, boardsMetadata: previousToBoardsMetadata}))
                await dispatch(fetchSidebarCategories(team.id))
            }
            return
        }

        // board moved to a different category
        const fromSidebarCategory = resolvedCategories.find((category) => category.id === fromCategoryID)
        if (!fromSidebarCategory) {
            Utils.logError(`fromCategoryID not found in list of sidebar categories. fromCategoryID: ${fromCategoryID}`)
            return
        }

        // 원본 카테고리에도 복구된 보드가 섞여 있을 수 있으니 인덱스가 아니라 보드 ID로 찾는다.
        const movedBoardMetadata = fromSidebarCategory.boardMetadata.find((m) => m.boardID === boardID)
        if (!movedBoardMetadata) {
            Utils.logError(`dragged board not found in source category. boardID: ${boardID}, fromCategoryID: ${fromCategoryID}`)
            return
        }

        const categoryBoardMetadata = insertVisibleBoard(toSidebarCategory, boards, movedBoardMetadata, destination.index)

        dispatch(updateCategoryBoardsOrder({categoryID: toCategoryID, boardsMetadata: categoryBoardMetadata}))
        dispatch(updateBoardCategories([{...movedBoardMetadata, categoryID: toCategoryID}]))

        const rollback = () => {
            dispatch(updateCategoryBoardsOrder({categoryID: toCategoryID, boardsMetadata: previousToBoardsMetadata}))
            dispatch(updateBoardCategories([{...movedBoardMetadata, categoryID: fromCategoryID}]))
        }

        // Persist the move; if request fails or server rejects, rollback silently
        const moveResp = await octoClient.
            moveBoardToCategory(team.id, boardID, toCategoryID, fromCategoryID).
            catch(() => Utils.logError('Failed to move board to category'))

        if (!moveResp || !moveResp.ok) {
            rollback()
            return
        }
        knownBoardIDs.add(boardID)

        try {
            const updatedOrder = await persistCategoryBoardsOrder(team.id, toCategoryID, knownBoardIDs, categoryBoardMetadata)
            if (updatedOrder.length === 0) {
                rollback()
            }
        } catch (error) {
            Utils.logError(`failed to reorder category boards after move: ${error}`)
            rollback()
            dispatch(fetchSidebarCategories(team.id))
        }
    }, [team, resolvedCategories, sidebarCategories, boards, dispatch])

    const onDragEnd = useCallback(async (result: DropResult) => {
        const {destination, source, type} = result

        if (!team || !destination) {
            setDraggedItemID('')
            setIsCategoryBeingDragged(false)
            return
        }

        if (destination.droppableId === source.droppableId && destination.index === source.index) {
            setDraggedItemID('')
            setIsCategoryBeingDragged(false)
            return
        }

        if (type === 'category') {
            handleCategoryDND(result)
        } else if (type === 'board') {
            handleCategoryBoardDND(result)
        } else {
            Utils.logWarn(`unknown drag type encountered, type: ${type}`)
        }

        setDraggedItemID('')
        setIsCategoryBeingDragged(false)
    }, [team, handleCategoryDND, handleCategoryBoardDND])

    const [draggedItemID, setDraggedItemID] = useState<string>('')
    const [isCategoryBeingDragged, setIsCategoryBeingDragged] = useState<boolean>(false)

    if (!boards) {
        return <div/>
    }

    if (!me) {
        return <div/>
    }

    if (isHidden) {
        return (
            <div className='Sidebar octo-sidebar hidden'>
                <div className='octo-sidebar-header show-button'>
                    <div className='hamburger-icon'>
                        <IconButton
                            icon={<HamburgerIcon/>}
                            onClick={() => {
                                setUserHidden(false)
                                setHidden(false)
                            }}
                        />
                    </div>
                    <div className='show-icon'>
                        <IconButton
                            icon={<ShowSidebarIcon/>}
                            onClick={() => {
                                setUserHidden(false)
                                setHidden(false)
                            }}
                        />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className='Sidebar octo-sidebar'>
            {!Utils.isFocalboardPlugin() &&
                <div className='octo-sidebar-header'>
                    <div className='heading'>
                        <SidebarUserMenu/>
                    </div>

                    <div className='octo-spacer'/>
                    <div className='sidebarSwitcher'>
                        <IconButton
                            onClick={() => {
                                setUserHidden(true)
                                setHidden(true)
                            }}
                            icon={<HideSidebarIcon/>}
                        />
                    </div>
                </div>}

            {team && team.id !== Constants.globalTeamId &&
                <div className='WorkspaceTitle'>
                    {Utils.isFocalboardPlugin() &&
                    <>
                        <div className='octo-spacer'/>
                        <div className='sidebarSwitcher'>
                            <IconButton
                                onClick={() => {
                                    setUserHidden(true)
                                    setHidden(true)
                                }}
                                icon={<HideSidebarIcon/>}
                            />
                        </div>
                    </>
                    }
                </div>
            }

            <BoardsSwitcher
                onBoardTemplateSelectorOpen={props.onBoardTemplateSelectorOpen}
                userIsGuest={me?.is_guest}
            />

            <DragDropContext
                onDragEnd={onDragEnd}
            >
                <Droppable
                    droppableId='lhs-categories'
                    type='category'
                    key={sidebarCategories.length}
                >
                    {(provided) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className='octo-sidebar-list'
                        >
                            {
                                resolvedCategories.map((category, index) => {
                                    return <SidebarCategory
                                        hideSidebar={hideSidebar}
                                        key={category.id}
                                        activeBoardID={props.activeBoardId}
                                        activeViewID={activeViewID}
                                        categoryBoards={category}
                                        boards={getSortedCategoryBoards(category, boards)}
                                        allCategories={sidebarCategories}
                                        index={index}
                                        onBoardTemplateSelectorClose={props.onBoardTemplateSelectorClose}
                                        draggedItemID={draggedItemID}
                                        forceCollapse={isCategoryBeingDragged}
                                    />
                                })
                            }
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            <div className='octo-spacer'/>

            {
                (!Utils.isFocalboardPlugin()) &&
                <div
                    className='add-board'
                    onClick={props.onBoardTemplateSelectorOpen}
                >
                    <FormattedMessage
                        id='Sidebar.add-board'
                        defaultMessage='+ Add board'
                    />
                </div>
            }

            {!Utils.isFocalboardPlugin() &&
                <SidebarSettingsMenu activeTheme={getActiveThemeName()}/>}
        </div>
    )
}

export default React.memo(Sidebar)
