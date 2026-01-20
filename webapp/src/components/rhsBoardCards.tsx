// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo, useEffect, useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {generatePath} from 'react-router-dom'

import {Board} from '../blocks/board'
import {Card} from '../blocks/card'
// import {Block} from '../blocks/block' // 미사용
import {sortBoardViewsAlphabetically} from '../blocks/boardView'
import {Utils} from '../utils'
import CompassIcon from '../widgets/icons/compassIcon'
import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../telemetry/telemetryClient'
import {useAppSelector, useAppDispatch} from '../store/hooks'
import {getCards} from '../store/cards'
import {loadBoardData} from '../store/initialLoad'
import {getCurrentViewId, getViews} from '../store/views'
import {getCurrentTeamId} from '../store/teams'
import Tooltip from '../widgets/tooltip'

import './rhsBoardCards.scss'

interface Props {
    board: Board
    onBackClick: () => void
}

const RHSBoardCards = (props: Props) => {
    const {board, onBackClick} = props
    const intl = useIntl()
    const dispatch = useAppDispatch()
    const [showCopyNotification, setShowCopyNotification] = useState(false)
    const [fadeOut, setFadeOut] = useState(false)

    const untitledBoardTitle = intl.formatMessage({id: 'BoardComponent.untitled-board', defaultMessage: 'Untitled Board'})

    // 실제 보드의 카드 데이터 가져오기
    const allCardsObj = useAppSelector(getCards)
    const boardCards = useMemo(() => {
        // getCards는 객체를 반환하므로 Object.values로 배열로 변환
        const allCards = Object.values(allCardsObj)
        // 선택된 보드의 카드만 필터링
        const filteredCards = allCards.filter(card => card.boardId === board.id)
        return filteredCards
    }, [allCardsObj, board.id])

    // 현재 활성화된 view ID와 team ID 가져오기
    const currentViewId = useAppSelector(getCurrentViewId)
    const currentTeamId = useAppSelector(getCurrentTeamId)
    const allViews = useAppSelector(getViews)

    // 해당 보드의 views만 필터링하고 정렬
    const currentBoardViews = useMemo(() => {
        const filteredViews = Object.values(allViews).filter(view => view.boardId === board.id)
        const sortedViews = sortBoardViewsAlphabetically(filteredViews)
        return sortedViews
    }, [allViews, board.id, currentViewId])

    // 선택된 보드의 데이터 로드
    useEffect(() => {
        if (board.id) {
            dispatch(loadBoardData(board.id))
        }
    }, [board.id, dispatch])

    // 카드가 로드되지 않았을 때를 위한 로딩 상태
    const isLoading = Object.keys(allCardsObj).length === 0

    // 디버깅을 위한 viewId 정보 로그 (현재 사용되지 않음)
    // const viewId = useMemo(() => {
    //     return currentViewId // 디버깅용으로만 사용
    // }, [currentViewId, currentBoardViews])

    const handleCardClicked = (card: Card) => {
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ViewCard, {board: board.id, card: card.id})
        
        // workspace.tsx의 showCard 함수 방식을 참조하여 같은 탭에서 카드 열기
        const windowAny = window as any
        
        // 카테고리에서 클릭할 때와 동일하게 첫 번째 view 사용
        const finalViewId = currentBoardViews.length > 0 ? currentBoardViews[0].id : ''
        
        if (!finalViewId) {
            console.warn('No valid viewId found for board:', board.id)
            return
        }
        
        const params = {
            teamId: currentTeamId,
            boardId: board.id,
            viewId: finalViewId,
            cardId: card.id
        }
        
        // Utils.getBoardPagePath를 사용해서 올바른 경로 생성
        const cardPath = generatePath('/team/:teamId/:boardId?/:viewId?/:cardId?', params)
        const cardUrl = `${windowAny.frontendBaseURL}${cardPath}`
        
        // 새 탭에서 카드 열기
        window.open(cardUrl, '_blank', 'noopener')
    }

    const handleBoardTitleClick = () => {
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ViewBoard, {board: board.id})
        
        // 보드 페이지를 새 탭에서 열기
        const windowAny = window as any
        
        // 카테고리에서 클릭할 때와 동일하게 첫 번째 view로 이동 (viewId 없이)
        // Utils.showBoard와 동일한 로직: viewId를 undefined로 설정하여 첫 번째 view 선택
        const params = {
            teamId: currentTeamId,
            boardId: board.id,
            viewId: undefined  // 첫 번째 view로 이동
        }
        const boardPath = generatePath('/team/:teamId/:boardId?/:viewId?', params)
        const boardUrl = `${windowAny.frontendBaseURL}${boardPath}`
        window.open(boardUrl, '_blank', 'noopener')
    }

    const handleCopyCardLink = (card: Card, e: React.MouseEvent) => {
        e.stopPropagation() // 카드 클릭 이벤트 방지
        
        // 카테고리에서 클릭할 때와 동일하게 첫 번째 view 사용
        const finalViewId = currentBoardViews.length > 0 ? currentBoardViews[0].id : ''
        
        if (!finalViewId) {
            console.warn('No valid viewId found for board:', board.id)
            return
        }
        
        const params = {
            teamId: currentTeamId,
            boardId: board.id,
            viewId: finalViewId,
            cardId: card.id
        }
        
        // Utils.getBoardPagePath를 사용해서 올바른 경로 생성
        const cardPath = generatePath('/team/:teamId/:boardId?/:viewId?/:cardId?', params)
        const windowAny = window as any
        const cardUrl = `${window.location.origin}${windowAny.frontendBaseURL}${cardPath}`
        
        // 클립보드에 복사
        navigator.clipboard.writeText(cardUrl).then(() => {
            // 성공 메시지 표시
            setFadeOut(false)
            setShowCopyNotification(true)
            // 2.8초 후 페이드아웃 시작
            setTimeout(() => {
                setFadeOut(true)
                // 0.2초 후 완전히 숨기기
                setTimeout(() => setShowCopyNotification(false), 200)
            }, 2800)
        }).catch((err) => {
            console.error('링크 복사 실패:', err)
        })
    }

    return (
        <div className='focalboard-body'>
            <div className='RHSBoardCards'>
                {/* 복사 성공 메시지 */}
                {showCopyNotification && (
                    <div className={`copy-notification ${fadeOut ? 'fade-out' : ''}`}>
                        {intl.formatMessage({id: 'CardActionsMenu.copiedLink', defaultMessage: 'Copied!'})}
                    </div>
                )}

                <div className='rhs-board-cards-header'>
                    <button 
                        className='back-button' 
                        onClick={onBackClick} 
                        data-testid='back-button'
                    >
                        <CompassIcon icon='chevron-left'/>
                    </button>
  
                    <div className='board-title-wrapper'>
                        <Tooltip
                            title={intl.formatMessage({id: 'RHSBoardCards.openBoard', defaultMessage: 'Open board'})}
                            placement='bottom'
                        >
                            <div 
                                className='board-title' 
                                onClick={handleBoardTitleClick}
                            >
                                {board.icon && <span className='icon'>{board.icon}</span>}
                                <span className='title'>{board.title || untitledBoardTitle}</span>
                            </div>
                        </Tooltip>
                    </div>
                </div>

                <div className='cards-container'>
                    {isLoading ? (
                        <div className='empty-state'>
                            <FormattedMessage 
                                id='RHSBoardCards.loading' 
                                defaultMessage='카드를 불러오는 중...'
                            />
                        </div>
                    ) : boardCards.length > 0 ? (
                        <div className='cards-list'>
                            {boardCards.map((card) => (
                                <div
                                    key={card.id}
                                    className='card-item'
                                >
                                    <div 
                                        className='card-content'
                                        onClick={() => handleCardClicked(card)}
                                    >
                                        <Tooltip
                                            title={intl.formatMessage({id: 'RHSBoardCards.goToCard', defaultMessage: 'Go to card'})}
                                            placement='bottom'
                                        >
                                            <div className='card-content-inner'>
                                                <div className='card-title-row'>
                                                    <div className='card-icon'>
                                                        {card.fields.icon || '📋'}
                                                    </div>
                                                    <div 
                                                        className='card-title'
                                                    >
                                                        {card.title || <FormattedMessage id='KanbanCard.untitled' defaultMessage='Untitled'/>}
                                                    </div>
                                                </div>
                                                <div className='card-assignee'>
                                                    <FormattedMessage 
                                                        id='RHSBoardCards.assignee' 
                                                        defaultMessage='담당자: {assignee}'
                                                        values={{
                                                            assignee: card.fields.properties?.assignee || intl.formatMessage({id: 'RHSBoardCards.unassigned', defaultMessage: '미지정'})
                                                        }}
                                                    />
                                                </div>
                                                <div className='card-updated'>
                                                    <FormattedMessage 
                                                        id='RHSBoardCards.lastUpdated' 
                                                        defaultMessage='마지막 업데이트 시간: {time}'
                                                        values={{
                                                            time: Utils.displayDateTime(new Date(card.updateAt), intl)
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </Tooltip>
                                    </div>
                                    <Tooltip
                                        title={intl.formatMessage({id: 'RHSBoardCards.copyCardLink', defaultMessage: 'Copy card link'})}
                                        placement='left'
                                    >
                                        <button 
                                            className='copy-link-button' 
                                            onClick={(e) => handleCopyCardLink(card, e)}
                                        >
                                            <CompassIcon icon='link-variant'/>
                                        </button>
                                    </Tooltip>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className='empty-state'>
                            <FormattedMessage 
                                id='RHSBoardCards.no-cards' 
                                defaultMessage='이 보드에는 카드가 없습니다.'
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default RHSBoardCards 
