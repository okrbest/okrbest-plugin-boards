// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'

import TableRow from './tableRow'

type Props = {
    board: Board
    activeView: BoardView
    subCards: Card[]
    selectedCardIds: string[]
    readonly: boolean
    showCard: (cardId?: string) => void
    addCard: (groupByOptionId?: string) => Promise<void>
    onCardClicked: (e: React.MouseEvent, card: Card) => void
    onDrop: (srcCard: Card, dstCard: Card) => void
}

const TableSubCardRows = (props: Props): React.JSX.Element => {
    const {board, activeView, subCards} = props

    return (
        <>
            {subCards.map((card, idx) => (
                <TableRow
                    key={card.id}
                    board={board}
                    columnWidths={activeView.fields.columnWidths}
                    isManualSort={activeView.fields.sortOptions.length === 0}
                    groupById={activeView.fields.groupById}
                    visiblePropertyIds={activeView.fields.visiblePropertyIds}
                    collapsedOptionIds={activeView.fields.collapsedOptionIds}
                    card={card}
                    addCard={props.addCard}
                    isSelected={props.selectedCardIds.includes(card.id)}
                    focusOnMount={false}
                    isLastCard={idx === subCards.length - 1}
                    onClick={(e) => props.onCardClicked(e, card)}
                    showCard={props.showCard}
                    readonly={props.readonly}
                    onDrop={props.onDrop}
                    isSubCard={true}
                />
            ))}
        </>
    )
}

export default React.memo(TableSubCardRows)
