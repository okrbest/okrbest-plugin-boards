// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo, useState, useCallback, useEffect} from 'react'
import {useIntl} from 'react-intl'

import {Utils} from '../../utils'
import mutator from '../../mutator'
import {BoardView} from '../../blocks/boardView'
import {FilterClause} from '../../blocks/filterClause'
import {createFilterGroup} from '../../blocks/filterGroup'
import {IPropertyTemplate} from '../../blocks/board'
import {Card} from '../../blocks/card'
import {useAppSelector} from '../../store/hooks'
import {getCards} from '../../store/cards'
import octoClient from '../../octoClient'
import Button from '../../widgets/buttons/button'
import Menu from '../../widgets/menu'
import MenuWrapper from '../../widgets/menuWrapper'

import './cardFilterValue.scss'

// 선택된 카드 정보 타입
interface ReferencedCard {
    id: string
    title: string
    boardId: string
}

// propertyValue에서 참조된 카드들 파싱
// JSON 형식: {"boardId":"...","cards":[{"id":"...","title":"..."}]}
// 이전 형식 호환: "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..." 또는 "boardId:cardId:cardTitle"
const parseReferencedCards = (propertyValue: string | string[] | undefined): ReferencedCard[] => {
    if (!propertyValue || typeof propertyValue !== 'string') {
        return []
    }

    // JSON 형식 (새 형식)
    if (propertyValue.startsWith('{')) {
        try {
            const parsed = JSON.parse(propertyValue)
            const boardId = parsed.boardId || ''
            const cards = parsed.cards || []
            return cards.map((c: {id: string, title: string}) => ({
                id: c.id,
                title: c.title || 'Untitled',
                boardId,
            })).filter((c: ReferencedCard) => c.id)
        } catch {
            return []
        }
    }

    // 이전 형식 호환: "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..."
    if (propertyValue.includes('|')) {
        const [boardId, cardsStr] = propertyValue.split('|')
        if (!cardsStr || !boardId) {
            return []
        }
        return cardsStr.split(',').map((cardStr) => {
            const colonIndex = cardStr.indexOf(':')
            if (colonIndex === -1) {
                return {id: cardStr, title: 'Untitled', boardId}
            }
            return {
                id: cardStr.substring(0, colonIndex),
                title: cardStr.substring(colonIndex + 1) || 'Untitled',
                boardId,
            }
        }).filter((c) => c.id)
    }

    // 이전 형식 호환: "boardId:cardId:cardTitle"
    const parts = propertyValue.split(':')
    if (parts.length >= 3) {
        return [{
            id: parts[1],
            title: parts.slice(2).join(':'),
            boardId: parts[0],
        }]
    }

    return []
}

type Props = {
    view: BoardView
    filter: FilterClause
    template: IPropertyTemplate
}

const CardFilterValue = (props: Props): React.JSX.Element => {
    const {filter, view, template} = props
    const intl = useIntl()
    const emptyDisplayValue = intl.formatMessage({id: 'FilterValue.empty', defaultMessage: '(empty)'})

    // Redux store에서 현재 보드의 모든 카드 가져오기
    const allCards = useAppSelector(getCards)

    // 참조된 카드 목록을 담을 state (API에서 가져온 실제 데이터)
    const [referencedCardsMap, setReferencedCardsMap] = useState<Map<string, ReferencedCard>>(new Map())
    const [loading, setLoading] = useState(false)

    // 현재 보드의 카드들에서 해당 속성에 참조된 모든 카드 수집
    const collectedCards = useMemo(() => {
        const cardsMap = new Map<string, ReferencedCard>()

        Object.values(allCards).forEach((card: Card) => {
            const propValue = card.fields.properties[template.id]
            const refs = parseReferencedCards(propValue as string)
            refs.forEach((ref) => {
                if (!cardsMap.has(ref.id)) {
                    cardsMap.set(ref.id, ref)
                }
            })
        })

        return cardsMap
    }, [allCards, template.id])

    // 참조된 카드들의 최신 정보를 가져오기
    const fetchCardDetails = useCallback(async () => {
        if (collectedCards.size === 0) {
            return
        }

        setLoading(true)

        // 보드별로 카드 그룹화
        const boardGroups = new Map<string, string[]>()
        collectedCards.forEach((card) => {
            const cardIds = boardGroups.get(card.boardId) || []
            cardIds.push(card.id)
            boardGroups.set(card.boardId, cardIds)
        })

        const updatedMap = new Map<string, ReferencedCard>()

        try {
            // 각 보드에서 카드 정보 가져오기
            for (const [boardId, cardIds] of boardGroups) {
                try {
                    const blocks = await octoClient.getAllBlocks(boardId)
                    const cardBlocks = blocks.filter((b) => b.type === 'card') as Card[]

                    cardIds.forEach((cardId) => {
                        const foundCard = cardBlocks.find((c) => c.id === cardId)
                        if (foundCard) {
                            updatedMap.set(cardId, {
                                id: cardId,
                                title: foundCard.title || 'Untitled',
                                boardId,
                            })
                        } else {
                            // 카드가 삭제되었을 수 있음, 기존 정보 유지
                            const existing = collectedCards.get(cardId)
                            if (existing) {
                                updatedMap.set(cardId, existing)
                            }
                        }
                    })
                } catch {
                    // 보드 접근 실패 시 기존 정보 유지
                    cardIds.forEach((cardId) => {
                        const existing = collectedCards.get(cardId)
                        if (existing) {
                            updatedMap.set(cardId, existing)
                        }
                    })
                }
            }
        } finally {
            setReferencedCardsMap(updatedMap.size > 0 ? updatedMap : collectedCards)
            setLoading(false)
        }
    }, [collectedCards])

    // 컴포넌트 마운트 시 카드 정보 가져오기
    useEffect(() => {
        if (collectedCards.size > 0) {
            fetchCardDetails()
        } else {
            setReferencedCardsMap(new Map())
        }
    }, [collectedCards, fetchCardDetails])

    // 필터 값에서 카드 ID 추출
    // JSON 형식: {"id":"cardId","title":"cardTitle"}
    // 이전 형식 호환: "cardId:title" 또는 "cardId"
    const extractCardIdFromFilterValue = useCallback((filterValue: string): string => {
        // JSON 형식
        if (filterValue.startsWith('{')) {
            try {
                const parsed = JSON.parse(filterValue)
                return parsed.id || ''
            } catch {
                return ''
            }
        }
        // 이전 형식 호환: "cardId:title" 또는 "cardId"
        const colonIndex = filterValue.indexOf(':')
        return colonIndex === -1 ? filterValue : filterValue.substring(0, colonIndex)
    }, [])

    // 필터 값에서 카드 ID 목록 추출
    const filterCardIds = useMemo(() => {
        return filter.values.map(extractCardIdFromFilterValue)
    }, [filter.values, extractCardIdFromFilterValue])

    // 필터 값에서 제목 추출
    // JSON 형식: {"id":"cardId","title":"cardTitle"}
    // 이전 형식 호환: "cardId:title" 또는 "cardId"
    const extractTitleFromFilterValue = useCallback((filterValue: string): string | null => {
        // JSON 형식
        if (filterValue.startsWith('{')) {
            try {
                const parsed = JSON.parse(filterValue)
                return parsed.title || null
            } catch {
                return null
            }
        }
        // 이전 형식 호환: "cardId:title"
        const colonIndex = filterValue.indexOf(':')
        if (colonIndex !== -1 && filterValue.length > colonIndex + 1) {
            return filterValue.substring(colonIndex + 1)
        }
        return null
    }, [])

    // 선택된 카드들의 표시 값
    const displayValue = useMemo(() => {
        if (filter.values.length === 0) {
            return emptyDisplayValue
        }

        return filter.values.map((filterValue) => {
            const cardId = extractCardIdFromFilterValue(filterValue)
            // 필터 값에 제목이 있으면 사용, 없으면 맵에서 찾기
            const title = extractTitleFromFilterValue(filterValue)
            if (title) {
                return title
            }
            const card = referencedCardsMap.get(cardId) || collectedCards.get(cardId)
            return card?.title || '(Unknown)'
        }).join(', ')
    }, [filter.values, referencedCardsMap, collectedCards, emptyDisplayValue, extractCardIdFromFilterValue, extractTitleFromFilterValue])

    // 선택 가능한 카드 목록
    const availableCards = useMemo(() => {
        return Array.from(referencedCardsMap.size > 0 ? referencedCardsMap.values() : collectedCards.values())
            .sort((a, b) => a.title.localeCompare(b.title))
    }, [referencedCardsMap, collectedCards])

    if (availableCards.length === 0) {
        return (
            <div className='CardFilterValue CardFilterValue--empty'>
                {loading
                    ? intl.formatMessage({id: 'CardFilterValue.loading', defaultMessage: 'Loading...'})
                    : intl.formatMessage({id: 'CardFilterValue.noCards', defaultMessage: 'No cards referenced'})
                }
            </div>
        )
    }

    return (
        <MenuWrapper className='CardFilterValue'>
            <Button>{displayValue}</Button>
            <Menu>
                {availableCards.map((card) => (
                    <Menu.Switch
                        key={card.id}
                        id={card.id}
                        name={card.title}
                        isOn={filterCardIds.includes(card.id)}
                        suppressItemClicked={true}
                        onClick={(cardId: string) => {
                            const filterIndex = view.fields.filter.filters.indexOf(filter)
                            Utils.assert(filterIndex >= 0, "Can't find filter")

                            const filterGroup = createFilterGroup(view.fields.filter)
                            const newFilter = filterGroup.filters[filterIndex] as FilterClause
                            Utils.assert(newFilter, `No filter at index ${filterIndex}`)

                            // 선택된 카드의 제목 찾기
                            const selectedCard = availableCards.find((c) => c.id === cardId)
                            const cardTitle = selectedCard?.title || 'Untitled'

                            if (filterCardIds.includes(cardId)) {
                                // 제거: 카드 ID로 시작하는 값 제거
                                newFilter.values = newFilter.values.filter((v) => extractCardIdFromFilterValue(v) !== cardId)
                            } else {
                                // 추가: JSON 형식으로 저장 {"id":"cardId","title":"cardTitle"}
                                newFilter.values.push(JSON.stringify({id: cardId, title: cardTitle}))
                            }
                            mutator.changeViewFilter(view.boardId, view.id, view.fields.filter, filterGroup)
                        }}
                    />
                ))}
            </Menu>
        </MenuWrapper>
    )
}

export default CardFilterValue

