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
// import octoClient from '../../octoClient' // 미사용
import Button from '../../widgets/buttons/button'
import {Focusable} from '../../widgets/editable'
import EditableArea from '../../widgets/editableArea'
import CompassIcon from '../../widgets/icons/compassIcon'
import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'

import BlockIconSelector from '../blockIconSelector'

import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {setCurrent as setCurrentCard} from '../../store/cards'
import {Permission} from '../../constants'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'
import {BlockSuiteEditor} from '../blockSuite/BlockSuiteEditor'
// import {BlockData} from '../blocksEditor/blocks/types' // 미사용 (blocks 변수 제거됨)
import {ClientConfig} from '../../config/clientConfig'
import {getClientConfig} from '../../store/clientConfig'

import CardSkeleton from '../../svg/card-skeleton'

import CommentsList from './commentsList'
import {CardDetailProvider} from './cardDetailContext'
import CardDetailContents from './cardDetailContents'
import CardDetailContentsMenu from './cardDetailContentsMenu'
import CardDetailProperties from './cardDetailProperties'
import useImagePaste from './imagePaste'
import AttachmentList from './attachment'

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
}

// addBlockNewEditor 함수는 현재 사용되지 않음 (BlockSuite 에디터로 대체됨)
// async function addBlockNewEditor(card: Card, intl: IntlShape, title: string, fields: any, contentType: ContentBlockTypes, afterBlockId: string, dispatch: any): Promise<Block> {
//     ...
// }

const CardDetail = (props: Props): JSX.Element|null => {
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
    const canEditBoardCards = useHasCurrentBoardPermissions([Permission.ManageBoardCards])
    const canCommentBoardCards = useHasCurrentBoardPermissions([Permission.CommentBoardCards])

    const saveTitleRef = useRef<() => void>(saveTitle)
    saveTitleRef.current = saveTitle
    const intl = useIntl()

    const clientConfig = useAppSelector<ClientConfig>(getClientConfig)
    const newBoardsEditor = clientConfig?.featureFlags?.newBoardsEditor || false

    useImagePaste(props.board.id, card.id, card.fields.contentOrder)

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

    // blocks 변수는 현재 사용되지 않음 (BlockSuite 에디터로 대체됨)
    // const blocks = useMemo(() => props.contents.flatMap((value: Block | Block[]): BlockData<any> => {
    //     ...
    // }), [props.contents])

    return (
        <>
            <div className={`CardDetail ${limited ? ' CardDetail--is-limited' : ''}`}>
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
                {newBoardsEditor && (
                    <BlockSuiteEditor
                        card={card}
                        boardId={card.boardId}
                        readOnly={props.readonly || !canEditBoardCards}
                    />
                )}
                {!newBoardsEditor && (
                    <CardDetailProvider card={card}>
                        <CardDetailContents
                            card={props.card}
                            contents={props.contents}
                            readonly={props.readonly || !canEditBoardCards}
                        />
                        {!props.readonly && canEditBoardCards && <CardDetailContentsMenu/>}
                    </CardDetailProvider>)}
            </div>}
        </>
    )
}

export default CardDetail
