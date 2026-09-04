// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useEffect, useCallback, useRef, useLayoutEffect} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {Board, IPropertyTemplate} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import Button from '../../widgets/buttons/button'

import RootPortal from '../rootPortal'

import {useAppSelector} from '../../store/hooks'
import {Permission} from '../../constants'
import {useHasCapabilities, useHasCurrentBoardPermissions} from '../../hooks/permissions'
import {getCurrentBoardId} from '../../store/boards'
import {
    getOnboardingTourCategory,
    getOnboardingTourStarted,
    getOnboardingTourStep,
} from '../../store/users'
import {
    BoardTourSteps,
    TOUR_BOARD,
    TourCategoriesMapToSteps,
} from '../onboardingTour'
import {OnboardingBoardTitle} from '../cardDetail/cardDetail'
import AddViewTourStep from '../onboardingTour/addView/add_view'
import {getCurrentCard, getCurrentViewCardsWithSubCards} from '../../store/cards'
import BoardPermissionGate from '../permissions/boardPermissionGate'

import ViewTabs from './viewTabs'
import NewCardButton from './newCardButton'
import ViewHeaderPropertiesMenu from './viewHeaderPropertiesMenu'
import ViewHeaderGroupByMenu from './viewHeaderGroupByMenu'
import ViewHeaderDisplayByMenu from './viewHeaderDisplayByMenu'
import ViewHeaderSortMenu from './viewHeaderSortMenu'
import ViewHeaderActionsMenu from './viewHeaderActionsMenu'
import ViewHeaderSearch from './viewHeaderSearch'
import FilterPanel from './filterPanel'

import './viewHeader.scss'

type Props = {
    board: Board
    activeView: BoardView
    views: BoardView[]
    cards: Card[]
    groupByProperty?: IPropertyTemplate
    addCard: () => void
    addCardFromTemplate: (cardTemplateId: string) => void
    addCardTemplate: () => void
    editCardTemplate: (cardTemplateId: string) => void
    readonly: boolean
    dateDisplayProperty?: IPropertyTemplate
}

const ViewHeader = (props: Props) => {
    const intl = useIntl()
    const [showFilter, setShowFilter] = useState(false)
    const [lockFilterOnClose, setLockFilterOnClose] = useState(false)
    const currentBoardId = useAppSelector(getCurrentBoardId)
    const canEditBoardProperties = useHasCurrentBoardPermissions([Permission.ManageBoardProperties])
    const canManageBoard = useHasCapabilities(currentBoardId, ['canManageBoard'])
    const canCreateCard = useHasCapabilities(currentBoardId, ['canCreateCard'])

    const {board, activeView, views, groupByProperty, cards, dateDisplayProperty} = props

    const withGroupBy = activeView.fields.viewType === 'board' || activeView.fields.viewType === 'table'
    const withDisplayBy = activeView.fields.viewType === 'calendar'
    const withSortBy = activeView.fields.viewType !== 'calendar'
    const canManageViewOptions = canEditBoardProperties || canManageBoard
    const noPermissionMessage = intl.formatMessage({
        id: 'ViewHeader.permission-required',
        defaultMessage: 'Insufficient permissions. Ask a board admin for edit access.',
    })

    const hasFilter = activeView.fields.filter && activeView.fields.filter.filters?.length > 0

    const isOnboardingBoard = props.board.title === OnboardingBoardTitle
    const onboardingTourStarted = useAppSelector(getOnboardingTourStarted)
    const onboardingTourCategory = useAppSelector(getOnboardingTourCategory)
    const onboardingTourStep = useAppSelector(getOnboardingTourStep)

    const currentCard = useAppSelector(getCurrentCard)
    const noCardOpen = !currentCard

    // Everything the table would show once every row is expanded. Only the
    // export uses it — the header's other menus work on the top level rows.
    const cardsWithSubCards = useAppSelector(getCurrentViewCardsWithSubCards)

    const showTourBaseCondition = isOnboardingBoard &&
        onboardingTourStarted &&
        noCardOpen &&
        onboardingTourCategory === TOUR_BOARD &&
        onboardingTourStep === BoardTourSteps.ADD_VIEW.toString()

    const [delayComplete, setDelayComplete] = useState(false)

    useEffect(() => {
        if (showTourBaseCondition) {
            setTimeout(() => {
                setDelayComplete(true)
            }, 800)
        }
    }, [showTourBaseCondition])

    useEffect(() => {
        if (!BoardTourSteps.SHARE_BOARD) {
            BoardTourSteps.SHARE_BOARD = 2
        }

        TourCategoriesMapToSteps[TOUR_BOARD] = BoardTourSteps
    }, [])

    const showAddViewTourStep = showTourBaseCondition && delayComplete

    const filterBtnRef = useRef<HTMLDivElement>(null)
    const [filterPos, setFilterPos] = useState<{top: number, left: number, maxHeight: number} | null>(null)

    const updateFilterPos = useCallback(() => {
        if (!filterBtnRef.current) {
            return
        }
        const rect = filterBtnRef.current.getBoundingClientRect()
        const gap = 4
        const edgePad = 8
        const panelW = 524

        let left = rect.left
        const maxLeft = window.innerWidth - panelW - edgePad
        if (left > maxLeft) {
            left = Math.max(edgePad, maxLeft)
        }

        const spaceBelow = window.innerHeight - rect.bottom - gap - edgePad
        const spaceAbove = rect.top - gap - edgePad
        const panelMaxH = 400

        let top: number
        let maxHeight: number

        if (spaceBelow >= panelMaxH || spaceBelow >= spaceAbove) {
            top = rect.bottom + gap
            maxHeight = Math.min(panelMaxH, spaceBelow)
        } else {
            const h = Math.min(panelMaxH, spaceAbove)
            top = rect.top - gap - h
            maxHeight = h
        }

        setFilterPos({top, left, maxHeight})
    }, [])

    useLayoutEffect(() => {
        if (showFilter) {
            updateFilterPos()
        } else {
            setFilterPos(null)
        }
    }, [showFilter, updateFilterPos])

    useEffect(() => {
        if (!showFilter) {
            return undefined
        }
        window.addEventListener('scroll', updateFilterPos, true)
        window.addEventListener('resize', updateFilterPos)
        return () => {
            window.removeEventListener('scroll', updateFilterPos, true)
            window.removeEventListener('resize', updateFilterPos)
        }
    }, [showFilter, updateFilterPos])

    useEffect(() => {
        if (!canManageViewOptions && showFilter) {
            setShowFilter(false)
        }
    }, [canManageViewOptions, showFilter])

    return (
        <div className='ViewHeader'>
            <div className='ViewHeader__tabsRegion'>
                <ViewTabs
                    board={board}
                    activeView={activeView}
                    views={views}
                    readonly={props.readonly}
                />
                {showAddViewTourStep && <AddViewTourStep/>}
            </div>

            <div className='ViewHeader__toolbar'>
                {!props.readonly &&
                <>
                    {/* Card properties */}

                    <ViewHeaderPropertiesMenu
                        properties={board.cardProperties}
                        activeView={activeView}
                        disabled={!canManageViewOptions}
                        disabledReason={noPermissionMessage}
                    />

                    {/* Group by */}

                    {withGroupBy &&
                    <ViewHeaderGroupByMenu
                        properties={board.cardProperties}
                        activeView={activeView}
                        groupByProperty={groupByProperty}
                        disabled={!canManageViewOptions}
                        disabledReason={noPermissionMessage}
                    />}

                    {/* Display by */}

                    {withDisplayBy &&
                    <ViewHeaderDisplayByMenu
                        properties={board.cardProperties}
                        activeView={activeView}
                        dateDisplayPropertyName={dateDisplayProperty?.name}
                        disabled={!canManageViewOptions}
                        disabledReason={noPermissionMessage}
                    />}

                    {/* Filter */}

                    <div ref={filterBtnRef}>
                        <Button
                            active={hasFilter && canManageViewOptions}
                            onClick={() => {
                                if (!canManageViewOptions) {
                                    return
                                }
                                setShowFilter(!showFilter)
                            }}
                            onMouseOver={() => setLockFilterOnClose(true)}
                            onMouseLeave={() => setLockFilterOnClose(false)}
                            disabled={!canManageViewOptions}
                            title={!canManageViewOptions ? noPermissionMessage : undefined}
                        >
                            <FormattedMessage
                                id='ViewHeader.filter'
                                defaultMessage='Filter'
                            />
                        </Button>
                    </div>
                    {showFilter && filterPos && canManageViewOptions &&
                    <RootPortal>
                        <div
                            className='ViewHeader__filterPortal'
                            style={{
                                position: 'fixed',
                                top: filterPos.top,
                                left: filterPos.left,
                                zIndex: 1000,
                                maxHeight: filterPos.maxHeight,
                            }}
                        >
                            <FilterPanel
                                board={board}
                                activeView={activeView}
                                onClose={() => {
                                    if (!lockFilterOnClose) {
                                        setShowFilter(false)
                                    }
                                }}
                            />
                        </div>
                    </RootPortal>}

                    {/* Sort */}

                    {withSortBy &&
                    <ViewHeaderSortMenu
                        properties={board.cardProperties}
                        activeView={activeView}
                        orderedCards={cards}
                        disabled={!canManageViewOptions}
                        disabledReason={noPermissionMessage}
                    />
                    }
                </>
                }

                {/* Search */}

                <ViewHeaderSearch/>

                {/* Options menu */}

                {!props.readonly &&
                <>
                    {/*
                      * The export takes the table fully expanded, not the top
                      * level rows the header otherwise works with: a CSV of an
                      * OKR board that dropped every Key Result and Task is the
                      * whole board minus its work.
                      */}
                    <ViewHeaderActionsMenu
                        board={board}
                        activeView={activeView}
                        cards={cardsWithSubCards}
                    />

                    {/* New card button */}

                    <BoardPermissionGate capabilities={['canCreateCard']}>
                        <NewCardButton
                            addCard={props.addCard}
                            addCardFromTemplate={props.addCardFromTemplate}
                            addCardTemplate={props.addCardTemplate}
                            editCardTemplate={props.editCardTemplate}
                        />
                    </BoardPermissionGate>
                    {!canCreateCard && (
                        <BoardPermissionGate permissions={[Permission.ManageBoardCards]}>
                            <NewCardButton
                                addCard={props.addCard}
                                addCardFromTemplate={props.addCardFromTemplate}
                                addCardTemplate={props.addCardTemplate}
                                editCardTemplate={props.editCardTemplate}
                            />
                        </BoardPermissionGate>
                    )}
                </>}
            </div>
        </div>
    )
}

export default React.memo(ViewHeader)
