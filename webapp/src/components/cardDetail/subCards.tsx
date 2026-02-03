// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {Card} from '../../blocks/card'
import {Board} from '../../blocks/board'
import mutator from '../../mutator'
import {useAppDispatch} from '../../store/hooks'
import {setSubCards, addSubCard, setSubCardCount} from '../../store/cards'
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
    const [subCards, setLocalSubCards] = useState<Card[]>([])
    const dispatch = useAppDispatch()
    const canEditBoardCards = useHasCurrentBoardPermissions([Permission.ManageBoardCards])
    const intl = useIntl()

    const currentDepth = card.fields.depth || 0
    const canAddSubCard = currentDepth < 2

    useEffect(() => {
        const loadSubCards = async () => {
            setIsLoading(true)
            try {
                const cards = await mutator.fetchSubCards(card.id)
                setLocalSubCards(cards)
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
                    setLocalSubCards((prev) => [...prev, createdCard])
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
                    <CompassIcon icon='format-list-bulleted'/>
                    <span className='SubCards__header-title'>
                        <FormattedMessage
                            id='SubCards.title'
                            defaultMessage='하위 작업'
                        />
                    </span>
                </div>
                <div className='SubCards__loading'>
                    <FormattedMessage
                        id='SubCards.loading'
                        defaultMessage='로딩 중...'
                    />
                </div>
            </div>
        )
    }

    return (
        <div className='SubCards'>
            <div className='SubCards__header'>
                <CompassIcon icon='format-list-bulleted'/>
                <span className='SubCards__header-title'>
                    <FormattedMessage
                        id='SubCards.title'
                        defaultMessage='Sub-tasks'
                    />
                </span>
            </div>

            <div className='SubCards__content'>
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
                                <span className='SubCards__item-icon'>
                                    {subCard.fields.icon || '📄'}
                                </span>
                                <span className='SubCards__item-title'>
                                    {subCard.title || intl.formatMessage({id: 'SubCards.untitled', defaultMessage: '제목 없음'})}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {!readonly && canEditBoardCards && canAddSubCard && (
                    <div
                        className='SubCards__add'
                        onClick={handleAddSubCard}
                        role='button'
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                handleAddSubCard()
                            }
                        }}
                    >
                        <CompassIcon icon='plus'/>
                        <span>
                        <FormattedMessage
                            id='SubCards.addNew'
                            defaultMessage='새 페이지 추가하기'
                        />
                        </span>
                    </div>
                )}

                {subCards.length === 0 && (readonly || !canEditBoardCards || !canAddSubCard) && (
                    <div className='SubCards__empty'>
                    <FormattedMessage
                        id='SubCards.empty'
                        defaultMessage='하위 작업 없음'
                    />
                    </div>
                )}
            </div>
        </div>
    )
}

export default React.memo(SubCards)
