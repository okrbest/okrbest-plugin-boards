// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'
import {useIntl} from 'react-intl'

import {Card} from '../../blocks/card'
import {Constants} from '../../constants'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'

import {useCanAddSubCard} from '../../hooks/permissions'

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

    // Admission, not a rank. The server asks whether a rule put this user in the
    // parent's tree, and the screen has to ask the same thing: the OKR matrix
    // gives 팀장 and 팀원 only reading on Key Results while the Tasks they build
    // hang off exactly those cards, so a gate keyed on commenting hides the row
    // on the one rung the ladder is built from (009 FR-005). Reading alone is
    // still not enough — a 본부장 sees other divisions' cards through the full
    // visibility floor, and canAddSubCard deliberately says no there.
    const canAddUnderParent = useCanAddSubCard(board.id, parentCard.id)

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

            {canAddSubCard && !props.readonly && canAddUnderParent &&
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
