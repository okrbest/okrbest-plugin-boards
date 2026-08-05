// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo} from 'react'

import {FormattedMessage, useIntl} from 'react-intl'

import {IPropertyOption, IPropertyTemplate, Board, BoardGroup} from '../../blocks/board'
import {createBoardView, BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import {Constants, Permission} from '../../constants'
import mutator from '../../mutator'
import {Utils} from '../../utils'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {updateView} from '../../store/views'
import {getCurrentBoardCards, getCurrentBoardSubCardsByParent} from '../../store/cards'
import {useHasCapabilities, useHasCurrentBoardPermissions} from '../../hooks/permissions'

import BoardPermissionGate from '../permissions/boardPermissionGate'

import './table.scss'

import HiddenCardCount from '../../components/hiddenCardCount/hiddenCardCount'

import TableHeaders from './tableHeaders'
import TableRows from './tableRows'
import TableGroup from './tableGroup'
import CalculationRow from './calculation/calculationRow'
import {ColumnResizeProvider} from './tableColumnResizeContext'
import {moveInCardOrder} from './cardOrderMove'
import {TableDragProvider, useTableDrag} from './tableDragContext'
import TableDropIndicator from './tableDropIndicator'
import {applyTableDrop} from './applyTableDrop'
import {DragItem, DropIntent, RowMetric} from './tableDropTarget'

type Props = {
    selectedCardIds: string[]
    board: Board
    cards: Card[]
    activeView: BoardView
    views: BoardView[]
    visibleGroups: BoardGroup[]
    groupByProperty?: IPropertyTemplate
    readonly: boolean
    cardIdToFocusOnRender: string
    showCard: (cardId?: string) => void
    addCard: (groupByOptionId?: string) => Promise<void>
    addSubCard: (parentCard: Card) => Promise<void>
    onCardClicked: (e: React.MouseEvent, card: Card) => void
    hiddenCardsCount: number
    showHiddenCardCountNotification: (show: boolean) => void
}

const ConnectedDropIndicator = (): React.JSX.Element | null => {
    const {intent, draggingSubtree} = useTableDrag()

    // 드래그 중인데 판정이 없으면 놓을 수 없는 자리다. 표에 커서 상태를 건다.
    useEffect(() => {
        const table = document.querySelector('.Table')
        if (!table) {
            return undefined
        }
        const noDrop = draggingSubtree.size > 0 && !intent
        table.classList.toggle('dragging-no-drop', noDrop)
        return () => table.classList.remove('dragging-no-drop')
    }, [intent, draggingSubtree])

    return <TableDropIndicator intent={intent}/>
}

const Table = (props: Props): React.JSX.Element => {
    const {board, cards, activeView, visibleGroups, groupByProperty, views, hiddenCardsCount} = props
    const isManualSort = activeView.fields.sortOptions?.length === 0
    const canEditBoardProperties = useHasCurrentBoardPermissions([Permission.ManageBoardProperties])
    const canEditCards = useHasCurrentBoardPermissions([Permission.ManageBoardCards])
    const canEditCardsByCapability = useHasCapabilities(board.id, ['canEditCard'])
    const canManageBoardByCapability = useHasCapabilities(board.id, ['canManageBoard'])
    const dispatch = useAppDispatch()

    // props.cards는 최상위 카드만 담는다. 순서 목록의 시드는 하위 카드까지
    // 포함해야 삽입 위치가 어긋나지 않는다.
    const allBoardCards = useAppSelector(getCurrentBoardCards)
    const subCardsByParent = useAppSelector(getCurrentBoardSubCardsByParent)
    const intl = useIntl()

    const columnMinWidths = useMemo(() => {
        const min: Record<string, number> = {[Constants.titleColumnId]: Constants.minColumnWidth}
        for (const propId of activeView.fields.visiblePropertyIds) {
            const t = board.cardProperties.find((p) => p.id === propId)?.type
            min[propId] = (t === 'person' || t === 'multiPerson')
                ? Constants.minPersonColumnWidth
                : t === 'card'
                    ? Constants.minCardColumnWidth
                    : (t === 'date' || t === 'createdTime' || t === 'updatedTime')
                        ? Constants.minDateColumnWidth
                        : Constants.minColumnWidth
        }
        return min
    }, [board.cardProperties, activeView.fields.visiblePropertyIds])

    const resizeColumn = useCallback(async (columnId: string, width: number) => {
        const columnWidths = {...activeView.fields.columnWidths}
        const minW = columnMinWidths[columnId] ?? Constants.minColumnWidth
        const newWidth = Math.max(minW, width)
        if (newWidth !== columnWidths[columnId]) {
            Utils.log(`Resize of column finished: prev=${columnWidths[columnId]}, new=${newWidth}`)

            columnWidths[columnId] = newWidth

            const newView = createBoardView(activeView)
            newView.fields.columnWidths = columnWidths
            try {
                dispatch(updateView(newView))
                await mutator.updateBlock(board.id, newView, activeView, 'resize column')
            } catch {
                dispatch(updateView(activeView))
            }
        }
    }, [activeView, columnMinWidths])

    const hideGroup = useCallback((groupById: string): void => {
        const index: number = activeView.fields.collapsedOptionIds.indexOf(groupById)
        const newValue: string[] = [...activeView.fields.collapsedOptionIds]
        if (index > -1) {
            newValue.splice(index, 1)
        } else if (groupById !== '') {
            newValue.push(groupById)
        }

        const newView = createBoardView(activeView)
        newView.fields.collapsedOptionIds = newValue
        dispatch(updateView(newView))
        mutator.performAsUndoGroup(async () => {
            try {
                await mutator.updateBlock(board.id, newView, activeView, 'hide group')
            } catch {
                dispatch(updateView(activeView))
            }
        })
    }, [activeView, board.id, dispatch])

    const onDropToGroupHeader = useCallback(async (option: IPropertyOption, dstOption?: IPropertyOption) => {
        if (dstOption) {
            Utils.log(`ondrop. Header target: ${dstOption.value}, source: ${option?.value}`)

            // Move option to new index
            const visibleOptionIds = visibleGroups.map((o) => o.option.id)
            const srcIndex = visibleOptionIds.indexOf(dstOption.id)
            const destIndex = visibleOptionIds.indexOf(option.id)

            visibleOptionIds.splice(srcIndex, 0, visibleOptionIds.splice(destIndex, 1)[0])
            Utils.log(`ondrop. updated visibleoptionids: ${visibleOptionIds}`)

            await mutator.changeViewVisibleOptionIds(board.id, activeView.id, activeView.fields.visibleOptionIds, visibleOptionIds)
        }
    }, [activeView, visibleGroups])

    const onDropToCard = useCallback((srcCard: Card, dstCard: Card) => {
        Utils.log(`onDropToCard: ${dstCard.title}`)
        onDropToGroup(srcCard, dstCard.fields.properties[activeView.fields.groupById!] as string, dstCard.id)
    }, [activeView.fields.groupById, cards])

    const onDropToGroup = useCallback((srcCard: Card, groupID: string, dstCardID: string) => {
        Utils.log(`onDropToGroup: ${srcCard.title}`)
        const {selectedCardIds} = props

        const draggedCardIds = Array.from(new Set(selectedCardIds).add(srcCard.id))
        const description = draggedCardIds.length > 1 ? `drag ${draggedCardIds.length} cards` : 'drag card'

        // 그룹 변경과 순서 변경을 하나의 되돌리기 그룹으로 묶는다. 둘로 갈라
        // 두면 Ctrl+Z 한 번에 절반만 돌아온다 (FR-028).
        //
        // 안쪽 mutator 호출을 다시 performAsUndoGroup으로 감싸지 않는다 —
        // 되돌리기 그룹은 중첩할 수 없고, 하위 호출은 열려 있는 그룹에 스스로
        // 참여한다.
        mutator.performAsUndoGroup(async () => {
            if (activeView.fields.groupById !== undefined) {
                const cardsById: { [key: string]: Card } = cards.reduce((acc: { [key: string]: Card }, card: Card): { [key: string]: Card } => {
                    acc[card.id] = card
                    return acc
                }, {})
                const draggedCards: Card[] = draggedCardIds.map((o: string) => cardsById[o])
                // Update properties of dragged cards
                const awaits = []
                const getGroupValue = (optionId?: string | string[]): string | string[] | undefined => {
                    if (!groupByProperty || !optionId || optionId === 'undefined') {
                        return undefined
                    }

                    if (Array.isArray(optionId)) {
                        if (optionId.length === 0) {
                            return undefined
                        }
                        if (groupByProperty.type === 'multiSelect' || groupByProperty.type === 'multiPerson') {
                            return [...optionId].sort()
                        }
                        return optionId[0]
                    }

                    if (groupByProperty.type === 'multiSelect' || groupByProperty.type === 'multiPerson') {
                        const ids = optionId.split(',').map((id) => id.trim()).filter((id) => id)
                        if (ids.length === 0) {
                            return undefined
                        }
                        return ids.sort()
                    }

                    return optionId
                }
                const isSameGroupValue = (a?: string | string[], b?: string | string[]): boolean => {
                    if (a === b) {
                        return true
                    }

                    if (Array.isArray(a) && Array.isArray(b)) {
                        if (a.length !== b.length) {
                            return false
                        }
                        for (let i = 0; i < a.length; i++) {
                            if (a[i] !== b[i]) {
                                return false
                            }
                        }
                        return true
                    }

                    return false
                }

                for (const draggedCard of draggedCards) {
                    Utils.log(`draggedCard: ${draggedCard.title}, column: ${draggedCard.fields.properties}`)
                    Utils.log(`droppedColumn:  ${groupID}`)
                    const oldOptionId = draggedCard.fields.properties[groupByProperty!.id]
                    Utils.log(`ondrop. oldValue: ${oldOptionId}`)

                    const newValue = getGroupValue(groupID)
                    if (!isSameGroupValue(oldOptionId, newValue)) {
                        awaits.push(mutator.changePropertyValue(board.id, draggedCard, groupByProperty!.id, newValue, description))
                    }
                }
                await Promise.all(awaits)
            }

            // Update dstCard order
            if (!isManualSort) {
                return
            }

            // 시드는 보드 전체 카드로 채운다. 최상위 카드만 넘기면 하위 카드
            // id가 순서 목록에서 빠져 삽입 위치가 어긋난다.
            const allCardIds = allBoardCards.map((card) => card.id)

            let cardOrder: string[]
            if (dstCardID) {
                cardOrder = moveInCardOrder({
                    cardOrder: activeView.fields.cardOrder,
                    allCardIds,
                    movingIds: draggedCardIds,
                    destCardId: dstCardID,
                })
            } else {
                // Find index of first group item
                const firstCard = cards.find((card) => card.fields.properties[activeView.fields.groupById!] === groupID)
                if (!firstCard) {
                    // if not found, this is the only item in group.
                    return
                }
                cardOrder = Array.from(new Set([...activeView.fields.cardOrder, ...allCardIds]))
                    .filter((id) => !draggedCardIds.includes(id))
                cardOrder.splice(cardOrder.indexOf(firstCard.id), 0, ...draggedCardIds)
            }

            await mutator.changeViewCardOrder(board.id, activeView.id, activeView.fields.cardOrder, cardOrder, description)
        })
    }, [activeView, cards, allBoardCards, props.selectedCardIds, groupByProperty, isManualSort, board.id])

    const onTableDrop = useCallback((intent: DropIntent, item: DragItem, rows: readonly RowMetric[]) => {
        applyTableDrop({
            intent,
            item,
            board,
            activeView,
            allCards: allBoardCards,
            rows,
            subCardsByParent,
            groupByPropertyId: activeView.fields.groupById,
            failureMessage: intl.formatMessage({
                id: 'TableRow.move-failed',
                defaultMessage: '카드를 옮기지 못했습니다.',
            }),
        })
    }, [board, activeView, allBoardCards, subCardsByParent, intl])

    const propertyNameChanged = useCallback(async (option: IPropertyOption, text: string): Promise<void> => {
        await mutator.changePropertyOptionValue(board.id, board.cardProperties, groupByProperty!, option, text)
    }, [board, groupByProperty])

    return (
        <div className='Table'>
            <TableDragProvider
                titleCellLeft={0}
                onDrop={onTableDrop}
            >
                <ConnectedDropIndicator/>
            <ColumnResizeProvider
                columnWidths={activeView.fields.columnWidths}
                columnMinWidths={columnMinWidths}
                onResizeColumn={resizeColumn}
            >
                <div className='octo-table-body'>
                    <TableHeaders
                        board={board}
                        cards={cards}
                        activeView={activeView}
                        views={views}
                        readonly={props.readonly || !(canEditBoardProperties || canManageBoardByCapability)}
                    />

                    {/* Table rows */}
                    <div className='table-row-container'>
                        {activeView.fields.groupById &&
                    visibleGroups.map((group) => {
                        return (
                            <TableGroup
                                key={group.option.id}
                                board={board}
                                activeView={activeView}
                                groupByProperty={groupByProperty}
                                group={group}
                                readonly={props.readonly || !(canEditCards || canEditCardsByCapability)}
                                selectedCardIds={props.selectedCardIds}
                                cardIdToFocusOnRender={props.cardIdToFocusOnRender}
                                hideGroup={hideGroup}
                                addCard={props.addCard}
                addSubCard={props.addSubCard}
                                showCard={props.showCard}
                                propertyNameChanged={propertyNameChanged}
                                onCardClicked={props.onCardClicked}
                                onDropToGroupHeader={onDropToGroupHeader}
                                onDropToCard={onDropToCard}
                                onDropToGroup={onDropToGroup}
                            />)
                    })
                        }

                        {/* No Grouping, Rows, one per card */}
                        {!activeView.fields.groupById &&
                        <TableRows
                            board={board}
                            activeView={activeView}
                            cards={cards}
                            selectedCardIds={props.selectedCardIds}
                            readonly={props.readonly || !(canEditCards || canEditCardsByCapability)}
                            cardIdToFocusOnRender={props.cardIdToFocusOnRender}
                            showCard={props.showCard}
                            addCard={props.addCard}
                addSubCard={props.addSubCard}
                            onCardClicked={props.onCardClicked}
                            onDrop={onDropToCard}
                        />
                        }
                    </div>

                    {/* Add New row */}
                    <div className='octo-table-footer'>
                        {!props.readonly && !activeView.fields.groupById &&
                        <BoardPermissionGate permissions={[Permission.ManageBoardCards]}>
                            <div
                                className='octo-table-cell'
                                onClick={() => {
                                    props.addCard('')
                                }}
                            >
                                <FormattedMessage
                                    id='TableComponent.plus-new'
                                    defaultMessage='+ New'
                                />
                            </div>
                        </BoardPermissionGate>
                        }
                    </div>

                    <CalculationRow
                        board={board}
                        cards={cards}
                        activeView={activeView}
                        readonly={props.readonly || !(canEditBoardProperties || canManageBoardByCapability)}
                    />
                </div>
            </ColumnResizeProvider>
            </TableDragProvider>

            {hiddenCardsCount > 0 &&
            <HiddenCardCount
                showHiddenCardNotification={props.showHiddenCardCountNotification}
                hiddenCardsCount={hiddenCardsCount}
            />}
        </div>
    )
}

export default Table
