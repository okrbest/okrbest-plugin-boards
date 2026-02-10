// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'

import {Card} from '../../blocks/card'
import useSubCardInfo from '../../hooks/useSubCardInfo'

import './kanbanSubCardChips.scss'

type Props = {
    parentCardId: string
    showCard: (cardId?: string) => void
}

const KanbanSubCardChips = (props: Props): React.JSX.Element | null => {
    const {parentCardId, showCard} = props
    const {subCards, hasSubCards} = useSubCardInfo(parentCardId)

    const handleChipClick = useCallback((e: React.MouseEvent, cardId: string) => {
        e.stopPropagation()
        showCard(cardId)
    }, [showCard])

    const handleChipKeyDown = useCallback((e: React.KeyboardEvent, cardId: string) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            showCard(cardId)
        }
    }, [showCard])

    if (!hasSubCards) {
        return null
    }

    return (
        <div className='KanbanSubCardChips'>
            {subCards.map((card: Card) => (
                <div
                    key={card.id}
                    className='KanbanSubCardChips__chip'
                    onClick={(e) => handleChipClick(e, card.id)}
                    onKeyDown={(e) => handleChipKeyDown(e, card.id)}
                    role='button'
                    tabIndex={0}
                >
                    <span className='KanbanSubCardChips__chip-icon'>
                        {card.fields.icon || '\uD83D\uDCC4'}
                    </span>
                    <span className='KanbanSubCardChips__chip-title'>
                        {card.title || 'Untitled'}
                    </span>
                </div>
            ))}
        </div>
    )
}

export default React.memo(KanbanSubCardChips)
