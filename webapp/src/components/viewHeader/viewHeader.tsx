// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useEffect, useCallback, useRef, useLayoutEffect} from 'react'
import {FormattedMessage} from 'react-intl'

import {Board, IPropertyTemplate} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import Button from '../../widgets/buttons/button'

import RootPortal from '../rootPortal'

import {useAppSelector} from '../../store/hooks'
import {Permission} from '../../constants'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'
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
import {getCurrentCard} from '../../store/cards'
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
    const [showFilter, setShowFilter] = useState(false)
    const [lockFilterOnClose, setLockFilterOnClose] = useState(false)
    const canEditBoardProperties = useHasCurrentBoardPermissions([Permission.ManageBoardProperties])

    const {board, activeView, views, groupByProperty, cards, dateDisplayProperty} = props

    const withGroupBy = activeView.fields.viewType === 'board' || activeView.fields.viewType === 'table'
    const withDisplayBy = activeView.fields.viewType === 'calendar'
    const withSortBy = activeView.fields.viewType !== 'calendar'

    const hasFilter = activeView.fields.filter && activeView.fields.filter.filters?.length > 0

    const isOnboardingBoard = props.board.title === OnboardingBoardTitle
    const onboardingTourStarted = useAppSelector(getOnboardingTourStarted)
    const onboardingTourCategory = useAppSelector(getOnboardingTourCategory)
    const onboardingTourStep = useAppSelector(getOnboardingTourStep)

    const currentCard = useAppSelector(getCurrentCard)
    const noCardOpen = !currentCard

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
    const filterPortalRef = useRef<HTMLDivElement>(null)
    const [filterPos, setFilterPos] = useState<{top: number, left: number} | null>(null)

    const updateFilterPos = useCallback(() => {
        if (filterBtnRef.current) {
            const rect = filterBtnRef.current.getBoundingClientRect()
            let left = rect.left

            if (filterPortalRef.current) {
                const portalWidth = filterPortalRef.current.offsetWidth
                const maxLeft = window.innerWidth - portalWidth - 8
                if (left > maxLeft) {
                    left = Math.max(8, maxLeft)
                }
            }

            setFilterPos({top: rect.bottom + 4, left})
        }
    }, [])

    useLayoutEffect(() => {
        if (showFilter) {
            updateFilterPos()
        } else {
            setFilterPos(null)
        }
    }, [showFilter, updateFilterPos])

    useLayoutEffect(() => {
        if (filterPos && filterPortalRef.current) {
            const portalWidth = filterPortalRef.current.offsetWidth
            const rightEdge = filterPos.left + portalWidth
            if (rightEdge > window.innerWidth - 8) {
                const newLeft = Math.max(8, window.innerWidth - portalWidth - 8)
                if (newLeft !== filterPos.left) {
                    setFilterPos({top: filterPos.top, left: newLeft})
                }
            }
        }
    }, [filterPos])

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
                {!props.readonly && canEditBoardProperties &&
                <>
                    {/* Card properties */}

                    <ViewHeaderPropertiesMenu
                        properties={board.cardProperties}
                        activeView={activeView}
                    />

                    {/* Group by */}

                    {withGroupBy &&
                    <ViewHeaderGroupByMenu
                        properties={board.cardProperties}
                        activeView={activeView}
                        groupByProperty={groupByProperty}
                    />}

                    {/* Display by */}

                    {withDisplayBy &&
                    <ViewHeaderDisplayByMenu
                        properties={board.cardProperties}
                        activeView={activeView}
                        dateDisplayPropertyName={dateDisplayProperty?.name}
                    />}

                    {/* Filter */}

                    <div ref={filterBtnRef}>
                        <Button
                            active={hasFilter}
                            onClick={() => setShowFilter(!showFilter)}
                            onMouseOver={() => setLockFilterOnClose(true)}
                            onMouseLeave={() => setLockFilterOnClose(false)}
                        >
                            <FormattedMessage
                                id='ViewHeader.filter'
                                defaultMessage='Filter'
                            />
                        </Button>
                    </div>
                    {showFilter && filterPos &&
                    <RootPortal>
                        <div
                            ref={filterPortalRef}
                            className='ViewHeader__filterPortal'
                            style={{
                                position: 'fixed',
                                top: filterPos.top,
                                left: filterPos.left,
                                zIndex: 1000,
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
                    />
                    }
                </>
                }

                {/* Search */}

                <ViewHeaderSearch/>

                {/* Options menu */}

                {!props.readonly &&
                <>
                    <ViewHeaderActionsMenu
                        board={board}
                        activeView={activeView}
                        cards={cards}
                    />

                    {/* New card button */}

                    <BoardPermissionGate permissions={[Permission.ManageBoardCards]}>
                        <NewCardButton
                            addCard={props.addCard}
                            addCardFromTemplate={props.addCardFromTemplate}
                            addCardTemplate={props.addCardTemplate}
                            editCardTemplate={props.editCardTemplate}
                        />
                    </BoardPermissionGate>
                </>}
            </div>
        </div>
    )
}

export default React.memo(ViewHeader)
