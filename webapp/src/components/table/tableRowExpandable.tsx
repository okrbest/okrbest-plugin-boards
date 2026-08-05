// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useEffect} from 'react'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import useSubCardInfo from '../../hooks/useSubCardInfo'

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
    const [expanded, setExpanded] = useState(hasSubCards)

    // Follow the sub-card count in both directions. Losing the last sub-card
    // collapses the row; gaining the first one opens it, which is what makes
    // the actions-menu entry point show its result (spec FR-010). No signal is
    // passed down from the creator — the count is the signal.
    useEffect(() => {
        setExpanded(hasSubCards)
    }, [hasSubCards])

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
                isExpanded={expanded}
                onToggleExpand={handleToggle}
                isSubCard={props.isSubCard}
            />
            {hasSubCards && expanded && (
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
