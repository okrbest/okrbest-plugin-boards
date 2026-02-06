// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {Block} from '../../blocks/block'
import {Card} from '../../blocks/card'
import octoClient from '../../octoClient'
import CompassIcon from '../../widgets/icons/compassIcon'

import './cardLinkSelector.scss'

const MAX_CARD_DEPTH = 2

type Props = {
    boardId: string
    currentCardId: string
    currentCardDepth: number
    onSelect: (card: Card) => void
    onClose: () => void
}

const CardLinkSelector = (props: Props): JSX.Element => {
    const {boardId, currentCardId, currentCardDepth, onSelect, onClose} = props
    const intl = useIntl()

    const [cards, setCards] = useState<Card[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        const fetchCards = async () => {
            setLoading(true)
            try {
                const blocks = await octoClient.getAllBlocks(boardId)
                const cardBlocks = blocks.filter((block: Block) => block.type === 'card') as Card[]

                cardBlocks.sort((a, b) => {
                    const titleA = a.title || ''
                    const titleB = b.title || ''

                    if (!titleA && !titleB) {
                        return 0
                    }
                    if (!titleA) {
                        return 1
                    }
                    if (!titleB) {
                        return -1
                    }

                    return titleA.localeCompare(titleB)
                })
                setCards(cardBlocks)
            } catch (error) {
                console.error('Failed to fetch cards:', error)
                setCards([])
            } finally {
                setLoading(false)
            }
        }
        fetchCards()
    }, [boardId])

    // 카드의 실제 부모 카드 ID를 가져오는 헬퍼 함수
    // Block.parentId가 boardId와 같으면 최상위 카드이므로 빈 문자열 반환
    const getParentCardId = useCallback((card: Card): string => {
        // fields.parentCardId가 있으면 사용 (새로 저장된 카드)
        if (card.fields?.parentCardId) {
            return card.fields.parentCardId
        }
        // 없으면 block.parentId 사용 (단, boardId와 다를 때만)
        if (card.parentId && card.parentId !== boardId) {
            return card.parentId
        }
        return ''
    }, [boardId])

    // 현재 카드의 조상(부모, 부모의 부모 등) ID 집합 계산
    const ancestorIds = useMemo(() => {
        const ancestors = new Set<string>()
        const cardMap = new Map<string, Card>()

        // 카드 ID → 카드 맵 생성
        cards.forEach((card) => {
            cardMap.set(card.id, card)
        })

        // 현재 카드부터 시작해서 부모 체인 추적
        const currentCard = cardMap.get(currentCardId)
        let parentId = currentCard ? getParentCardId(currentCard) : ''

        while (parentId) {
            ancestors.add(parentId)
            const parentCard = cardMap.get(parentId)
            parentId = parentCard ? getParentCardId(parentCard) : ''
        }

        return ancestors
    }, [cards, currentCardId, getParentCardId])

    const canLinkCard = useCallback((card: Card): {canLink: boolean; reason?: string} => {
        if (card.id === currentCardId) {
            return {
                canLink: false,
                reason: intl.formatMessage({id: 'CardLinkSelector.cannotLinkSelf', defaultMessage: 'Cannot link self'}),
            }
        }

        // 현재 카드의 조상인 경우 순환 참조 방지
        if (ancestorIds.has(card.id)) {
            return {
                canLink: false,
                reason: intl.formatMessage({id: 'CardLinkSelector.isAncestor', defaultMessage: 'Parent card'}),
            }
        }

        const cardDepth = card.fields?.depth || 0
        if (cardDepth > 0) {
            return {
                canLink: false,
                reason: intl.formatMessage({id: 'CardLinkSelector.alreadySubCard', defaultMessage: 'Already a sub-card'}),
            }
        }

        if (currentCardDepth + 1 > MAX_CARD_DEPTH) {
            return {
                canLink: false,
                reason: intl.formatMessage({id: 'CardLinkSelector.depthExceeded', defaultMessage: 'Depth limit exceeded'}),
            }
        }

        return {canLink: true}
    }, [currentCardId, currentCardDepth, intl, ancestorIds])

    const filteredCards = useMemo(() => {
        if (!searchQuery.trim()) {
            return cards
        }
        const query = searchQuery.toLowerCase().trim()
        return cards.filter((card) => {
            const title = card.title || ''
            return title.toLowerCase().includes(query)
        })
    }, [cards, searchQuery])

    const handleCardSelect = useCallback((card: Card) => {
        const {canLink} = canLinkCard(card)
        if (canLink) {
            onSelect(card)
        }
    }, [canLinkCard, onSelect])

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
    }, [])

    const handleBackdropClick = useCallback(() => {
        onClose()
    }, [onClose])

    return (
        <div className='CardLinkSelector'>
            <div
                className='CardLinkSelector__backdrop'
                onClick={handleBackdropClick}
            />
            <div className='CardLinkSelector__dropdown'>
                <div className='CardLinkSelector__header'>
                    <FormattedMessage
                        id='CardLinkSelector.header'
                        defaultMessage='Link existing card'
                    />
                </div>
                <div className='CardLinkSelector__search'>
                    <CompassIcon icon='magnify'/>
                    <input
                        className='CardLinkSelector__searchInput'
                        type='text'
                        placeholder={intl.formatMessage({id: 'CardLinkSelector.searchPlaceholder', defaultMessage: 'Search cards...'})}
                        value={searchQuery}
                        onChange={handleSearchChange}
                        autoFocus={true}
                    />
                </div>

                {loading && (
                    <div className='CardLinkSelector__loading'>
                        <FormattedMessage
                            id='CardLinkSelector.loading'
                            defaultMessage='Loading...'
                        />
                    </div>
                )}

                {!loading && filteredCards.length === 0 && (
                    <div className='CardLinkSelector__empty'>
                        <FormattedMessage
                            id='CardLinkSelector.empty'
                            defaultMessage='No cards available to link'
                        />
                    </div>
                )}

                {!loading && filteredCards.length > 0 && (
                    <div className='CardLinkSelector__list'>
                        {filteredCards.map((card) => {
                            const {canLink, reason} = canLinkCard(card)
                            return (
                                <div
                                    key={card.id}
                                    className={`CardLinkSelector__item ${!canLink ? 'CardLinkSelector__item--disabled' : ''}`}
                                    onClick={() => handleCardSelect(card)}
                                    role='button'
                                    tabIndex={canLink ? 0 : -1}
                                    onKeyDown={(e) => {
                                        if ((e.key === 'Enter' || e.key === ' ') && canLink) {
                                            handleCardSelect(card)
                                        }
                                    }}
                                >
                                    <span className='CardLinkSelector__itemIcon'>
                                        {card.fields?.icon || '📄'}
                                    </span>
                                    <span className='CardLinkSelector__itemTitle'>
                                        {card.title || intl.formatMessage({id: 'CardLinkSelector.untitled', defaultMessage: 'Untitled'})}
                                    </span>
                                    {!canLink && reason && (
                                        <span className='CardLinkSelector__itemReason'>
                                            {reason}
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default React.memo(CardLinkSelector)
