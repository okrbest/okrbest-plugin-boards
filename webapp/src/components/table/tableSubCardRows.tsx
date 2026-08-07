// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'
import {useIntl} from 'react-intl'

import {Card} from '../../blocks/card'
import {Constants} from '../../constants'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'

import TableAddRow from './tableAddRow'
import TableRowExpandable from './tableRowExpandable'

type Props = {
    board: Board
    activeView: BoardView
    parentCard: Card
    subCards: Card[]
    selectedCardIds: string[]
    readonly: boolean
    cardIdToFocusOnRender: string
    showCard: (cardId?: string) => void
    addCard: (groupByOptionId?: string) => Promise<void>
    addSubCard: (parentCard: Card) => Promise<void>
    onCardClicked: (e: React.MouseEvent, card: Card) => void
    onDrop: (srcCard: Card, dstCard: Card) => void
}

const TableSubCardRows = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const {board, activeView, parentCard, subCards} = props

    // A card at the limit cannot hold another level, so the entry point is not
    // offered rather than offered and refused (spec FR-011).
    const canAddSubCard = (parentCard.fields.depth || 0) < Constants.maxCardDepth

    // Not gated on the parent's edit permission, and that is deliberate. A
    // sub-card no longer copies its parent's property values — it is born with
    // the ones the rules admit its author to — so a 팀장 may add a Key Results
    // card under an Object card they can only read. Asking about the parent
    // would hide the row exactly where the OKR ladder needs it.
    const onAddSubCard = useCallback(() => {
        props.addSubCard(parentCard)
    }, [props.addSubCard, parentCard])

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
                    cardIdToFocusOnRender={props.cardIdToFocusOnRender}
                    isLastCard={idx === subCards.length - 1}
                    showCard={props.showCard}
                    addCard={props.addCard}
                    addSubCard={props.addSubCard}
                    onCardClicked={props.onCardClicked}
                    onDrop={props.onDrop}
                    isSubCard={true}
                />
            ))}

            {canAddSubCard && !props.readonly &&
            <TableAddRow
                label={intl.formatMessage({id: 'TableComponent.plus-new-subcard', defaultMessage: '+ New sub-card'})}
                onClick={onAddSubCard}
                depth={(parentCard.fields.depth || 0) + 1}
                parentCardId={parentCard.id}
            />}
        </>
    )
}

export default React.memo(TableSubCardRows)
