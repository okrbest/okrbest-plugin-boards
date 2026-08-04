// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'

import './table.scss'

import TableRowExpandable from './tableRowExpandable'

type Props = {
    board: Board
    activeView: BoardView
    cards: readonly Card[]
    selectedCardIds: string[]
    readonly: boolean
    cardIdToFocusOnRender: string
    showCard: (cardId?: string) => void
    addCard: (groupByOptionId?: string) => Promise<void>
    addSubCard: (parentCard: Card) => Promise<void>
    onCardClicked: (e: React.MouseEvent, card: Card) => void
    onDrop: (srcCard: Card, dstCard: Card) => void
}

const TableRows = (props: Props): React.JSX.Element => {
    const {board, cards, activeView} = props

    const onClickRow = useCallback((e: React.MouseEvent, card: Card) => {
        props.onCardClicked(e, card)
    }, [props.onCardClicked])

    return (
        <>
            {cards.map((card, idx) => {
                return (
                    <TableRowExpandable
                        key={card.id + card.updateAt}
                        board={board}
                        activeView={activeView}
                        card={card}
                        selectedCardIds={props.selectedCardIds}
                        readonly={props.readonly}
                        cardIdToFocusOnRender={props.cardIdToFocusOnRender}
                        isLastCard={idx === (cards.length - 1)}
                        showCard={props.showCard}
                        addCard={props.addCard}
                addSubCard={props.addSubCard}
                        onCardClicked={onClickRow}
                        onDrop={props.onDrop}
                    />)
            })}
        </>
    )
}

export default TableRows
