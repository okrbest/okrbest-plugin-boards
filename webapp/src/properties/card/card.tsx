// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useEffect, useMemo} from 'react'
import {useIntl} from 'react-intl'
import {generatePath} from 'react-router-dom'

import {Card} from '../../blocks/card'
import {Block} from '../../blocks/block'
import mutator from '../../mutator'
import octoClient from '../../octoClient'
import {useAppSelector} from '../../store/hooks'
import {getCurrentTeamId} from '../../store/teams'
import {getCards} from '../../store/cards'
import IconButton from '../../widgets/buttons/iconButton'
import EditIcon from '../../widgets/icons/edit'
import CloseIcon from '../../widgets/icons/close'
import SearchIcon from '../../widgets/icons/search'

import {PropertyProps} from '../types'

import './card.scss'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const windowAny = window as any
const linkedBoardInFlight = new Map<string, Promise<Card[]>>()

// 선택된 카드 정보 타입
interface SelectedCard {
    id: string
    title: string
}

// JSON 저장 형식
interface CardPropertyValue {
    boardId: string
    cards: SelectedCard[]
}

// 저장 형식: JSON {"boardId":"...","cards":[{"id":"...","title":"..."}]}
// 하위 호환: 이전 형식 "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..." 및 "boardId:cardId:cardTitle"
const parsePropertyValue = (value: string | string[] | undefined): {boardId: string, selectedCards: SelectedCard[]} => {
    if (!value || typeof value !== 'string') {
        return {boardId: '', selectedCards: []}
    }

    // JSON 형식 (새 형식)
    if (value.startsWith('{')) {
        try {
            const parsed: CardPropertyValue = JSON.parse(value)
            return {
                boardId: parsed.boardId || '',
                selectedCards: (parsed.cards || []).filter((c) => c.id),
            }
        } catch {
            return {boardId: '', selectedCards: []}
        }
    }

    // 이전 형식 호환: "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..."
    if (value.includes('|')) {
        const [boardId, cardsStr] = value.split('|')
        if (!cardsStr) {
            return {boardId, selectedCards: []}
        }
        const selectedCards: SelectedCard[] = cardsStr.split(',').map((cardStr) => {
            const colonIndex = cardStr.indexOf(':')
            if (colonIndex === -1) {
                return {id: cardStr, title: 'Untitled'}
            }
            return {
                id: cardStr.substring(0, colonIndex),
                title: cardStr.substring(colonIndex + 1) || 'Untitled',
            }
        }).filter((c) => c.id)
        return {boardId, selectedCards}
    }

    // 이전 형식 호환: "boardId:cardId:cardTitle"
    const parts = value.split(':')
    if (parts.length >= 1) {
        const boardId = parts[0]
        if (parts.length >= 3) {
            return {
                boardId,
                selectedCards: [{id: parts[1], title: parts.slice(2).join(':')}],
            }
        }
        return {boardId, selectedCards: []}
    }

    return {boardId: '', selectedCards: []}
}

const serializePropertyValue = (boardId: string, selectedCards: SelectedCard[]): string => {
    if (!boardId) {
        return ''
    }
    const data: CardPropertyValue = {
        boardId,
        cards: selectedCards,
    }
    return JSON.stringify(data)
}

const clearLinkedBoardCardCacheForTests = () => {
    linkedBoardInFlight.clear()
}

const sortCardsByTitle = (cardBlocks: Card[]) => {
    return [...cardBlocks].sort((a, b) => {
        const titleA = a.title || ''
        const titleB = b.title || ''

        // 빈 제목은 항상 뒤로
        if (!titleA && !titleB) return 0
        if (!titleA) return 1
        if (!titleB) return -1

        return titleA.localeCompare(titleB)
    })
}

const toCardsById = (cardBlocks: Card[]) => cardBlocks.reduce((acc, cardBlock) => {
    acc[cardBlock.id] = cardBlock
    return acc
}, {} as {[key: string]: Card})

const mergeCardsById = (currentCardsById: {[key: string]: Card}, cardBlocks: Card[]) => ({
    ...currentCardsById,
    ...toCardsById(cardBlocks),
})

const CardPropertyEditor = (props: PropertyProps) => {
    const {propertyValue, propertyTemplate, board, card} = props
    const intl = useIntl()
    const currentTeamId = useAppSelector(getCurrentTeamId)
    const allCards = useAppSelector(getCards)

    const [open, setOpen] = useState(false)
    const [cards, setCards] = useState<Card[]>([])
    const [linkedCardsById, setLinkedCardsById] = useState<{[key: string]: Card}>({})
    const [loading, setLoading] = useState(false)
    const [boardAccessError, setBoardAccessError] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const isEditable = !props.readOnly && Boolean(board)

    const emptyDisplayValue = props.showEmptyPlaceholder
        ? intl.formatMessage({id: 'PropertyValueElement.empty', defaultMessage: 'Empty'})
        : ''

    // 연결된 보드 ID는 속성 템플릿에서 가져옴
    const linkedBoardId = propertyTemplate.options?.[0]?.id || ''
    const isLinkedToCurrentBoard = linkedBoardId === board.id

    // propertyValue 파싱 (선택된 카드 정보만)
    const {selectedCards} = useMemo(
        () => parsePropertyValue(propertyValue),
        [propertyValue],
    )
    const selectedCardIds = useMemo(() => selectedCards.map((c) => c.id), [selectedCards])

    const hasSelectedCards = selectedCards.length > 0

    const saveLinkedCardsForTitleSync = useCallback((cardBlocks: Card[]) => {
        setLinkedCardsById((previousCardsById) => mergeCardsById(previousCardsById, cardBlocks))
    }, [])

    const saveLinkedCardsForDropdown = useCallback((cardBlocks: Card[]) => {
        setLinkedCardsById((previousCardsById) => mergeCardsById(previousCardsById, cardBlocks))
        setCards(sortCardsByTitle(cardBlocks))
    }, [])

    const currentBoardCards = useMemo(() => {
        if (!isLinkedToCurrentBoard) {
            return []
        }
        return sortCardsByTitle(Object.values(allCards).filter((candidateCard) => candidateCard.boardId === linkedBoardId))
    }, [isLinkedToCurrentBoard, allCards, linkedBoardId])

    const resolveTitlesByIds = useCallback(async (cardIds: string[] = []): Promise<Card[]> => {
        if (cardIds.length === 0) {
            return []
        }
        const cardBlocks = await octoClient.getCardsByIDs(linkedBoardId, cardIds) as Card[]
        if (cardBlocks.length > 0) {
            return cardBlocks
        }

        // 서버 벌크 API 미배포/실패 상황을 위한 안전 폴백
        const allBlocks = await octoClient.getAllBlocks(linkedBoardId)
        const allCardBlocks = allBlocks.filter((block: Block) => block.type === 'card') as Card[]
        const cardIdSet = new Set(cardIds)
        return allCardBlocks.filter((candidateCard) => cardIdSet.has(candidateCard.id))
    }, [linkedBoardId])

    const fetchAllCardsForLinkedBoard = useCallback(async (): Promise<Card[]> => {
        const linkedBoard = await octoClient.getBoard(linkedBoardId)
        if (!linkedBoard) {
            throw new Error('linked board not accessible')
        }

        const blocks = await octoClient.getAllBlocks(linkedBoardId)
        return blocks.filter((block: Block) => block.type === 'card') as Card[]
    }, [linkedBoardId])

    const fetchSelectedCardsForTitleSync = useCallback(async (): Promise<Card[]> => {
        const linkedBoard = await octoClient.getBoard(linkedBoardId)
        if (!linkedBoard) {
            throw new Error('linked board not accessible')
        }

        return resolveTitlesByIds(selectedCardIds)
    }, [linkedBoardId, resolveTitlesByIds, selectedCardIds])

    const fetchCards = useCallback(async ({forDropdown = false, showLoading = false}: {forDropdown?: boolean, showLoading?: boolean} = {}) => {
        if (!linkedBoardId || isLinkedToCurrentBoard) {
            return
        }
        if (showLoading) {
            setLoading(true)
        }
        setBoardAccessError(false)

        try {
            const inFlightKey = forDropdown ? `${linkedBoardId}:all` : `${linkedBoardId}:ids:${selectedCardIds.join(',')}`
            let inFlightRequest = linkedBoardInFlight.get(inFlightKey)
            if (!inFlightRequest) {
                inFlightRequest = forDropdown ? fetchAllCardsForLinkedBoard() : fetchSelectedCardsForTitleSync()
                linkedBoardInFlight.set(inFlightKey, inFlightRequest)
                void inFlightRequest.finally(() => {
                    const currentInFlight = linkedBoardInFlight.get(inFlightKey)
                    if (currentInFlight === inFlightRequest) {
                        linkedBoardInFlight.delete(inFlightKey)
                    }
                })
            }

            const fetchedCards = await inFlightRequest
            const sortedCards = sortCardsByTitle(fetchedCards)

            if (forDropdown) {
                saveLinkedCardsForDropdown(sortedCards)
            } else {
                saveLinkedCardsForTitleSync(sortedCards)
            }
        } catch (error) {
            console.error('Failed to fetch cards:', error)
            setBoardAccessError(true)
            if (forDropdown) {
                setCards([])
            }
        } finally {
            if (showLoading) {
                setLoading(false)
            }
        }
    }, [
        linkedBoardId,
        isLinkedToCurrentBoard,
        selectedCardIds,
        saveLinkedCardsForDropdown,
        saveLinkedCardsForTitleSync,
        fetchAllCardsForLinkedBoard,
        fetchSelectedCardsForTitleSync,
    ])

    // 드롭다운 열 때 카드 목록 가져오기
    useEffect(() => {
        if (open && linkedBoardId) {
            if (isLinkedToCurrentBoard) {
                setCards(currentBoardCards)
            } else {
                fetchCards({forDropdown: true, showLoading: true})
            }
            setSearchQuery('') // 드롭다운 열 때 검색어 초기화
        }
    }, [open, linkedBoardId, isLinkedToCurrentBoard, currentBoardCards, fetchCards])

    useEffect(() => {
        if (!linkedBoardId || isLinkedToCurrentBoard || selectedCardIds.length === 0) {
            return
        }
        fetchCards({forDropdown: false})
    }, [linkedBoardId, isLinkedToCurrentBoard, selectedCardIds, fetchCards])

    useEffect(() => {
        if (!linkedBoardId || isLinkedToCurrentBoard || selectedCardIds.length === 0) {
            return
        }

        const handleWindowFocus = () => {
            fetchCards({forDropdown: false})
        }

        window.addEventListener('focus', handleWindowFocus)
        return () => {
            window.removeEventListener('focus', handleWindowFocus)
        }
    }, [linkedBoardId, isLinkedToCurrentBoard, selectedCardIds, fetchCards])

    // 카드 추가
    const handleCardAdd = useCallback(async (selectedCard: Card) => {
        // 이미 선택된 카드인지 확인
        if (selectedCards.some((c) => c.id === selectedCard.id)) {
            return
        }
        const newSelectedCards = [...selectedCards, {id: selectedCard.id, title: selectedCard.title || 'Untitled'}]
        const newValue = serializePropertyValue(linkedBoardId, newSelectedCards)
        await mutator.changePropertyValue(board.id, card, propertyTemplate.id, newValue)
    }, [linkedBoardId, selectedCards, board, card, propertyTemplate])

    // 카드 삭제
    const handleCardRemove = useCallback(async (cardIdToRemove: string) => {
        const newSelectedCards = selectedCards.filter((c) => c.id !== cardIdToRemove)
        const newValue = serializePropertyValue(linkedBoardId, newSelectedCards)
        await mutator.changePropertyValue(board.id, card, propertyTemplate.id, newValue)
    }, [linkedBoardId, selectedCards, board, card, propertyTemplate])

    // 선택된 카드로 이동
    const handleCardClick = useCallback((cardId: string) => {
        if (!linkedBoardId || !cardId || !currentTeamId) {
            return
        }
        const params = {
            teamId: currentTeamId,
            boardId: linkedBoardId,
            viewId: '0',
            cardId,
        }
        const cardPath = generatePath('/team/:teamId/:boardId/:viewId/:cardId', params)
        const cardUrl = `${window.location.origin}${windowAny.frontendBaseURL || ''}${cardPath}`
        window.open(cardUrl, '_blank', 'noopener')
    }, [linkedBoardId, currentTeamId])

    // 빈 상태에서 전체 영역 클릭 시 드롭다운 열기
    const handleContainerClick = useCallback(() => {
        if (isEditable && !hasSelectedCards && !open) {
            setOpen(true)
        }
    }, [isEditable, hasSelectedCards, open])

    const resolvedSelectedCards = useMemo(() => {
        return selectedCards.map((selectedCard) => {
            const currentBoardCard = linkedBoardId === board.id ? allCards[selectedCard.id] : undefined
            const linkedBoardCard = linkedCardsById[selectedCard.id]
            const resolvedTitle = currentBoardCard?.title || linkedBoardCard?.title || selectedCard.title || intl.formatMessage({id: 'CardProperty.untitled', defaultMessage: 'Untitled'})
            return {
                id: selectedCard.id,
                title: resolvedTitle,
            }
        })
    }, [selectedCards, linkedBoardId, board.id, allCards, linkedCardsById, intl])

    // 이미 선택된 카드 ID 목록
    const selectedCardIdSet = useMemo(() => new Set(selectedCards.map((c) => c.id)), [selectedCards])

    // 검색 필터링된 카드 목록
    const cardsForDropdown = isLinkedToCurrentBoard ? currentBoardCards : cards
    const filteredCards = useMemo(() => {
        if (!searchQuery.trim()) {
            return cardsForDropdown
        }
        const query = searchQuery.toLowerCase().trim()
        return cardsForDropdown.filter((c) => {
            const title = c.title || ''
            return title.toLowerCase().includes(query)
        })
    }, [cardsForDropdown, searchQuery])

    // 보드가 선택되지 않은 경우 안내 메시지 표시
    if (!linkedBoardId) {
        return (
            <div className={`CardProperty ${props.property.valueClassName(!isEditable)}`}>
                <span className='CardProperty-placeholder'>
                    {intl.formatMessage({id: 'CardProperty.selectBoardFirst', defaultMessage: 'Select a board first'})}
                </span>
            </div>
        )
    }

    return (
        <div
            className={`CardProperty ${props.property.valueClassName(!isEditable)} ${!hasSelectedCards && isEditable ? 'CardProperty--clickable' : ''} ${boardAccessError ? 'CardProperty--error' : ''}`}
            onClick={handleContainerClick}
        >
            {boardAccessError ? (
                <span className='CardProperty-errorText'>
                    {intl.formatMessage({id: 'CardProperty.boardNotAccessible', defaultMessage: 'Board not accessible'})}
                </span>
            ) : hasSelectedCards ? (
                <div className='CardProperty-tags'>
                    {resolvedSelectedCards.map((c) => (
                        <div
                            key={c.id}
                            className='CardProperty-tag'
                        >
                            <span
                                className='CardProperty-tagText'
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleCardClick(c.id)
                                }}
                                title={intl.formatMessage({id: 'CardProperty.openCard', defaultMessage: 'Open card'})}
                            >
                                {c.title}
                            </span>
                            {isEditable && (
                                <IconButton
                                    className='CardProperty-tagRemove'
                                    icon={<CloseIcon/>}
                                    title={intl.formatMessage({id: 'CardProperty.removeCard', defaultMessage: 'Remove'})}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleCardRemove(c.id)
                                    }}
                                />
                            )}
                        </div>
                    ))}
                    {isEditable && (
                        <IconButton
                            className='CardProperty-addButton'
                            title={intl.formatMessage({id: 'CardProperty.addCard', defaultMessage: 'Add card'})}
                            icon={<EditIcon/>}
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpen(true)
                            }}
                        />
                    )}
                </div>
            ) : (
                <>
                    <span className='CardProperty-placeholder'>
                        {emptyDisplayValue}
                    </span>
                    {isEditable && (
                        <IconButton
                            className='CardProperty-editButton'
                            title={intl.formatMessage({id: 'CardProperty.selectCard', defaultMessage: 'Select a card'})}
                            icon={<EditIcon/>}
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpen(true)
                            }}
                        />
                    )}
                </>
            )}
            
            {open && (
                <div
                    className='CardProperty-dropdown'
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className='CardProperty-header'>
                        {intl.formatMessage({id: 'CardProperty.selectCard', defaultMessage: 'Select a card'})}
                    </div>
                    <div className='CardProperty-search'>
                        <SearchIcon/>
                        <input
                            type='text'
                            className='CardProperty-searchInput'
                            placeholder={intl.formatMessage({id: 'CardProperty.searchCards', defaultMessage: 'Search cards...'})}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                        />
                    </div>
                    {loading ? (
                        <div className='CardProperty-loading'>
                            {intl.formatMessage({id: 'CardProperty.loading', defaultMessage: 'Loading...'})}
                        </div>
                    ) : boardAccessError ? (
                        <div className='CardProperty-error'>
                            {intl.formatMessage({id: 'CardProperty.boardAccessError', defaultMessage: 'Board has been deleted or is no longer accessible. Please select a different board.'})}
                        </div>
                    ) : cardsForDropdown.length === 0 ? (
                        <div className='CardProperty-empty'>
                            {intl.formatMessage({id: 'CardProperty.noCards', defaultMessage: 'No cards available'})}
                        </div>
                    ) : filteredCards.length === 0 ? (
                        <div className='CardProperty-empty'>
                            {intl.formatMessage({id: 'CardProperty.noCardsFound', defaultMessage: 'No cards found'})}
                        </div>
                    ) : (
                        <div className='CardProperty-list'>
                            {filteredCards.map((c) => {
                                const isSelected = selectedCardIdSet.has(c.id)
                                return (
                                    <div
                                        key={c.id}
                                        className={`CardProperty-item ${isSelected ? 'CardProperty-item--selected' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (!isSelected) {
                                                handleCardAdd(c)
                                            }
                                        }}
                                    >
                                        <span className='CardProperty-title'>
                                            {c.title || intl.formatMessage({id: 'CardProperty.untitled', defaultMessage: 'Untitled'})}
                                        </span>
                                        {isSelected && (
                                            <span className='CardProperty-check'>✓</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    <div
                        className='CardProperty-backdrop'
                        onClick={() => setOpen(false)}
                    />
                </div>
            )}
        </div>
    )
}

export default React.memo(CardPropertyEditor)
export {clearLinkedBoardCardCacheForTests}
