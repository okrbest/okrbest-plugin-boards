// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'

import TableRowExpandable from './tableRowExpandable'

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
                <TableRowExpandable
                    key={card.id}
                    board={board}
                    activeView={activeView}
                    card={card}
                    selectedCardIds={props.selectedCardIds}
                    readonly={props.readonly}
                    isLastCard={idx === subCards.length - 1}
                    showCard={props.showCard}
                    addCard={props.addCard}
                    onCardClicked={props.onCardClicked}
                    onDrop={props.onDrop}
                    isSubCard={true}
                />
            ))}
        </>
    )
}

export default React.memo(TableSubCardRows)
