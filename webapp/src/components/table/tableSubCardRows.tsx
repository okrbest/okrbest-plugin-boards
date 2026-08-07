// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'
import {useIntl} from 'react-intl'

import {Card} from '../../blocks/card'
import {Constants} from '../../constants'
import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'

import {useHasCardCapabilities} from '../../hooks/permissions'

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

    // A sub-card is born with its parent's property values, so whether it may be
    // created is the same question as whether the parent may be edited. Asking
    // the board instead left the row offered under every parent and refused
    // under the ones the rules keep shut.
    const canEditParent = useHasCardCapabilities(board.id, parentCard.id, ['canEditCard'])

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

            {canAddSubCard && !props.readonly && canEditParent &&
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
