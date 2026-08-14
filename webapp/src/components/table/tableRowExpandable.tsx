// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useEffect} from 'react'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Constants} from '../../constants'
import useSubCardInfo from '../../hooks/useSubCardInfo'
import {useHasCardCapabilities} from '../../hooks/permissions'
import {isOkrParentLevel} from '../../okrBoard'

import TableRow from './tableRow'
import TableSubCardRows from './tableSubCardRows'

type Props = {
    board: Board
    activeView: BoardView
    card: Card
    selectedCardIds: string[]
    readonly: boolean
    cardIdToFocusOnRender?: string
    isLastCard: boolean
    showCard: (cardId?: string) => void
    addCard: (groupByOptionId?: string) => Promise<void>
    addSubCard: (parentCard: Card) => Promise<void>
    onCardClicked: (e: React.MouseEvent, card: Card) => void
    onDrop: (srcCard: Card, dstCard: Card) => void
    isSubCard?: boolean
}

const TableRowExpandable = (props: Props): React.JSX.Element => {
    const {board, activeView, card} = props
    const {subCards, hasSubCards} = useSubCardInfo(card.id)

    // Same question TableSubCardRows asks before drawing the add row, asked one
    // level up so the row never opens a toggle onto a list it may not add to —
    // a 본부장 sees other divisions' cards through the visibility floor and can
    // add nothing under them (spec 008 FR-014).
    const canAddUnderCard = useHasCardCapabilities(board.id, card.id, ['canCommentCard'])

    // An OKR rung with one below it keeps the entry point open before any
    // sub-card exists. An Objective with no Key Results is where the ladder gets
    // built, and the row is where the user looks for the way to build it.
    const invitesSubCards = !props.readonly &&
        canAddUnderCard &&
        (card.fields.depth || 0) < Constants.maxCardDepth &&
        isOkrParentLevel(board.properties, card.fields.properties)

    const isExpandable = hasSubCards || invitesSubCards
    const [expanded, setExpanded] = useState(isExpandable)

    // Follow the reason for the list in both directions. Losing the last
    // sub-card collapses a plain row; gaining the first one opens it, which is
    // what makes the actions-menu entry point show its result (spec FR-010). No
    // signal is passed down from the creator — this is the signal.
    //
    // An OKR parent row stays open across both: the invitation does not depend
    // on the count, so adding or removing sub-cards does not close it.
    useEffect(() => {
        setExpanded(isExpandable)
    }, [isExpandable])

    const handleToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        setExpanded((prev) => !prev)
    }, [])

    return (
        <>
            <TableRow
                board={board}
                columnWidths={activeView.fields.columnWidths}
                isManualSort={activeView.fields.sortOptions.length === 0}
                groupById={activeView.fields.groupById}
                visiblePropertyIds={activeView.fields.visiblePropertyIds}
                collapsedOptionIds={activeView.fields.collapsedOptionIds}
                card={card}
                addCard={props.addCard}
                addSubCard={props.addSubCard}
                isSelected={props.selectedCardIds.includes(card.id)}
                selectedCardIds={props.selectedCardIds}
                focusOnMount={props.cardIdToFocusOnRender === card.id}
                isLastCard={props.isLastCard}
                onClick={(e) => props.onCardClicked(e, card)}
                showCard={props.showCard}
                readonly={props.readonly}
                onDrop={props.onDrop}
                hasSubCards={hasSubCards}
                isExpandable={isExpandable}
                isExpanded={expanded}
                onToggleExpand={handleToggle}
                isSubCard={props.isSubCard}
            />
            {isExpandable && expanded && (
                <TableSubCardRows
                    board={board}
                    activeView={activeView}
                    parentCard={card}
                    subCards={subCards}
                    cardIdToFocusOnRender={props.cardIdToFocusOnRender || ''}
                    selectedCardIds={props.selectedCardIds}
                    readonly={props.readonly}
                    showCard={props.showCard}
                    addCard={props.addCard}
                    addSubCard={props.addSubCard}
                    onCardClicked={props.onCardClicked}
                    onDrop={props.onDrop}
                />
            )}
        </>
    )
}

export default React.memo(TableRowExpandable)
