// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import mutator from '../../mutator'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {setSubCards, addSubCard, setSubCardCount, getSubCards, getSubCardCount} from '../../store/cards'
import Button from '../../widgets/buttons/button'
import CompassIcon from '../../widgets/icons/compassIcon'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'
import {Permission} from '../../constants'

import './subCards.scss'

type Props = {
    board: Board
    card: Card
    readonly: boolean
    onCardClick: (cardId: string) => void
}

const SubCards = (props: Props): JSX.Element => {
    const {board, card, readonly, onCardClick} = props
    const [isLoading, setIsLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const dispatch = useAppDispatch()
    const subCards = useAppSelector(getSubCards(card.id))
    const subCardCount = useAppSelector(getSubCardCount(card.id))
    const canEditBoardCards = useHasCurrentBoardPermissions([Permission.ManageBoardCards])
    const intl = useIntl()

    const currentDepth = card.fields.depth || 0
    const canAddSubCard = currentDepth < 2

    useEffect(() => {
        const loadSubCards = async () => {
            setIsLoading(true)
            try {
                const cards = await mutator.fetchSubCards(card.id)
                dispatch(setSubCards({parentCardId: card.id, subCards: cards}))
                dispatch(setSubCardCount({parentCardId: card.id, count: cards.length}))
            } finally {
                setIsLoading(false)
            }
        }
        loadSubCards()
    }, [card.id, dispatch])

    const handleAddSubCard = useCallback(async () => {
        if (isAdding) {
            return
        }
        setIsAdding(true)
        try {
            const newCard = await mutator.createSubCard(
                board.id,
                card.id,
                '',
                async (createdCard) => {
                    dispatch(addSubCard({parentCardId: card.id, subCard: createdCard}))
                    onCardClick(createdCard.id)
                },
            )
            if (newCard) {
                onCardClick(newCard.id)
            }
        } finally {
            setIsAdding(false)
        }
    }, [board.id, card.id, dispatch, isAdding, onCardClick])

    const handleCardClick = useCallback((subCardId: string) => {
        onCardClick(subCardId)
    }, [onCardClick])

    if (isLoading) {
        return (
            <div className='SubCards'>
                <div className='SubCards__header'>
                    <CompassIcon icon='card-multiple-outline'/>
                    <span>
                        <FormattedMessage
                            id='SubCards.title'
                            defaultMessage='Sub-cards'
                        />
                    </span>
                </div>
                <div className='SubCards__loading'>
                    <FormattedMessage
                        id='SubCards.loading'
                        defaultMessage='Loading...'
                    />
                </div>
            </div>
        )
    }

    return (
        <div className='SubCards'>
            <div className='SubCards__header'>
                <CompassIcon icon='card-multiple-outline'/>
                <span>
                    <FormattedMessage
                        id='SubCards.title'
                        defaultMessage='Sub-cards'
                    />
                </span>
                {subCardCount > 0 && (
                    <span className='SubCards__count'>{subCardCount}</span>
                )}
            </div>

            {subCards.length > 0 && (
                <div className='SubCards__list'>
                    {subCards.map((subCard) => (
                        <div
                            key={subCard.id}
                            className='SubCards__item'
                            onClick={() => handleCardClick(subCard.id)}
                            role='button'
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    handleCardClick(subCard.id)
                                }
                            }}
                        >
                            {subCard.fields.icon && (
                                <span className='SubCards__item-icon'>{subCard.fields.icon}</span>
                            )}
                            <span className='SubCards__item-title'>
                                {subCard.title || intl.formatMessage({id: 'SubCards.untitled', defaultMessage: 'Untitled'})}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {!readonly && canEditBoardCards && canAddSubCard && (
                <Button
                    className='SubCards__add'
                    emphasis='tertiary'
                    size='small'
                    onClick={handleAddSubCard}
                    disabled={isAdding}
                    icon={<CompassIcon icon='plus'/>}
                >
                    <FormattedMessage
                        id='SubCards.add'
                        defaultMessage='Add sub-card'
                    />
                </Button>
            )}

            {subCards.length === 0 && (readonly || !canEditBoardCards || !canAddSubCard) && (
                <div className='SubCards__empty'>
                    <FormattedMessage
                        id='SubCards.empty'
                        defaultMessage='No sub-cards'
                    />
                </div>
            )}
        </div>
    )
}

export default React.memo(SubCards)
