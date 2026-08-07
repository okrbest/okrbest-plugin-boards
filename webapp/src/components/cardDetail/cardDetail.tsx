// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState, Fragment} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {BlockIcons} from '../../blockIcons'
import {Card} from '../../blocks/card'
import {BoardView} from '../../blocks/boardView'
import {Board} from '../../blocks/board'
import {CommentBlock} from '../../blocks/commentBlock'
import {AttachmentBlock} from '../../blocks/attachmentBlock'
import {ContentBlock} from '../../blocks/contentBlock'
import {Block} from '../../blocks/block'
import mutator from '../../mutator'
import Button from '../../widgets/buttons/button'
import {Focusable} from '../../widgets/editable'
import EditableArea from '../../widgets/editableArea'
import CompassIcon from '../../widgets/icons/compassIcon'
import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'

import BlockIconSelector from '../blockIconSelector'

import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {setCurrent as setCurrentCard} from '../../store/cards'
import {Constants, Permission} from '../../constants'
import {useHasCurrentBoardCardPermissions} from '../../hooks/permissions'
import BlockSuiteEditor from '../blockSuite/BlockSuiteEditor'

import CardSkeleton from '../../svg/card-skeleton'

import CommentsList from './commentsList'
import CardDetailProperties from './cardDetailProperties'
import AttachmentList from './attachment'
import SubCards from './subCards'

import './cardDetail.scss'

// export const OnboardingBoardTitle = 'Welcome to Boards!'
export const OnboardingBoardTitle = 'Boards에 오신 것을 환영합니다!'
// export const OnboardingCardTitle = 'Create a new card'
export const OnboardingCardTitle = '새 카드 만들기'

type Props = {
    board: Board
    activeView: BoardView
    views: BoardView[]
    cards: Card[]
    card: Card
    comments: CommentBlock[]
    attachments: AttachmentBlock[]
    contents: Array<ContentBlock|ContentBlock[]>
    readonly: boolean
    onClose: () => void
    onDelete: (block: Block) => void
    addAttachment: () => void
    onCardClick?: (cardId: string) => void
}

const CardDetail = (props: Props): React.JSX.Element|null => {
    const {card, comments, attachments, onDelete, addAttachment} = props
    const {limited} = card
    const [title, setTitle] = useState(card.title)
    const [serverTitle, setServerTitle] = useState(card.title)
    const titleRef = useRef<Focusable>(null)
    const saveTitle = useCallback(() => {
        if (title !== card.title) {
            mutator.changeBlockTitle(props.board.id, card.id, card.title, title)
        }
    }, [card.title, title])
    // Judged per card, not per board: the access rules can leave a board
    // editor with only commenting on this particular card.
    const canEditBoardCards = useHasCurrentBoardCardPermissions(card.id, [Permission.ManageBoardCards])
    const canCommentBoardCards = useHasCurrentBoardCardPermissions(card.id, [Permission.CommentBoardCards])

    const saveTitleRef = useRef<() => void>(saveTitle)
    saveTitleRef.current = saveTitle
    const intl = useIntl()

    useEffect(() => {
        if (!title) {
            setTimeout(() => titleRef.current?.focus(), 300)
        }
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ViewCard, {board: props.board.id, view: props.activeView.id, card: card.id})
    }, [])

    useEffect(() => {
        if (serverTitle === title) {
            setTitle(card.title)
        }
        setServerTitle(card.title)
    }, [card.title, title])

    useEffect(() => {
        return () => {
            saveTitleRef.current && saveTitleRef.current()
        }
    }, [])

    const setRandomIcon = useCallback(() => {
        const newIcon = BlockIcons.shared.randomIcon()
        mutator.changeBlockIcon(props.board.id, card.id, card.fields.icon, newIcon)
    }, [card.id, card.fields.icon])

    const dispatch = useAppDispatch()
    useEffect(() => {
        dispatch(setCurrentCard(card.id))
    }, [card.id])

    if (!card) {
        return null
    }

    return (
        <>
            <div className={`CardDetail ${limited ? ' CardDetail--is-limited' : ''}`}>
                {/* Said out loud rather than left to be discovered. Fields the
                    card rules keep shut are rendered read only, which on its own
                    reads as the screen being broken. */}
                {!props.readonly && !canEditBoardCards && !limited &&
                    <div className='CardDetail__readonly-notice'>
                        <CompassIcon icon='information-outline'/>
                        <span>
                            {canCommentBoardCards ? (
                                <FormattedMessage
                                    id='CardDetail.readonly-can-comment'
                                    defaultMessage='이 카드를 편집할 권한이 없습니다. 댓글은 남길 수 있습니다.'
                                />
                            ) : (
                                <FormattedMessage
                                    id='CardDetail.readonly'
                                    defaultMessage='이 카드를 편집할 권한이 없습니다.'
                                />
                            )}
                        </span>
                    </div>}

                <BlockIconSelector
                    block={card}
                    size='l'
                    readonly={props.readonly || !canEditBoardCards || limited}
                />
                {!props.readonly && canEditBoardCards && !card.fields.icon &&
                    <div className='add-buttons'>
                        <Button
                            emphasis='default'
                            size='small'
                            onClick={setRandomIcon}
                            icon={
                                <CompassIcon
                                    icon='emoticon-outline'
                                />}

                        >
                            <FormattedMessage
                                id='CardDetail.add-icon'
                                defaultMessage='Add icon'
                            />
                        </Button>
                    </div>}

                <EditableArea
                    ref={titleRef}
                    className='title'
                    value={title}
                    placeholderText='Untitled'
                    onChange={(newTitle: string) => setTitle(newTitle)}
                    saveOnEsc={true}
                    onSave={saveTitle}
                    onCancel={() => setTitle(props.card.title)}
                    readonly={props.readonly || !canEditBoardCards || limited}
                    spellCheck={true}
                />

                {/* Hidden (limited) card copy + CTA */}

                {limited && <div className='CardDetail__limited-wrapper'>
                    <CardSkeleton
                        className='CardDetail__limited-bg'
                    />
                    <p className='CardDetail__limited-title'>
                        <FormattedMessage
                            id='CardDetail.limited-title'
                            defaultMessage='This card is hidden'
                        />
                    </p>
                    <p className='CardDetail__limited-body'>
                        <FormattedMessage
                            id='CardDetail.limited-body'
                            defaultMessage='Upgrade to our Professional or Enterprise plan to view archived cards, have unlimited views per boards, unlimited cards and more.'
                        />
                        <br/>
                        <a
                            className='CardDetail__limited-link'
                            role='button'
                            onClick={() => {
                                props.onClose();
                                (window as any).openPricingModal()({trackingLocation: 'boards > learn_more_about_our_plans_click'})
                            }}
                        >
                            <FormattedMessage
                                id='CardDetial.limited-link'
                                defaultMessage='Learn more about our plans.'
                            />
                        </a>
                    </p>
                    <Button
                        className='CardDetail__limited-button'
                        onClick={() => {
                            props.onClose();
                            (window as any).openPricingModal()({trackingLocation: 'boards > upgrade_click'})
                        }}
                        emphasis='primary'
                        size='large'
                    >
                        {intl.formatMessage({id: 'CardDetail.limited-button', defaultMessage: 'Upgrade'})}
                    </Button>
                </div>}

                {/* Property list */}

                {!limited &&
                <CardDetailProperties
                    board={props.board}
                    card={props.card}
                    cards={props.cards}
                    activeView={props.activeView}
                    views={props.views}
                    readonly={props.readonly}
                />}

                {!limited && props.onCardClick && (card.fields.depth === undefined || card.fields.depth < Constants.maxCardDepth) && (
                    <SubCards
                        board={props.board}
                        card={card}
                        readonly={props.readonly}
                        onCardClick={props.onCardClick}
                    />
                )}

                {attachments.length !== 0 && <Fragment>
                    <hr/>
                    <AttachmentList
                        attachments={attachments}
                        onDelete={onDelete}
                        addAttachment={addAttachment}
                    />
                </Fragment>}

                {/* Comments */}

                {!limited && <Fragment>
                    <hr/>
                    <CommentsList
                        comments={comments}
                        boardId={card.boardId}
                        cardId={card.id}
                        readonly={props.readonly || !canCommentBoardCards}
                    />
                </Fragment>}
            </div>

            {/* Content blocks */}

            {!limited && <div className='CardDetail CardDetail--fullwidth content-blocks'>
                <BlockSuiteEditor
                    card={card}
                    contents={props.contents.flatMap((b) => b)}
                    readonly={props.readonly || !canEditBoardCards}
                    teamId={props.board.teamId}
                    viewId={props.activeView.id}
                />
            </div>}
        </>
    )
}

export default CardDetail
