// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, useState, useMemo, useCallback} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {Card} from '../../blocks/card'
import {Board, IPropertyTemplate} from '../../blocks/board'
import {Constants} from '../../constants'
import mutator from '../../mutator'
import Button from '../../widgets/buttons/button'
import Editable from '../../widgets/editable'
import {useSortable} from '../../hooks/sortable'

import {Utils} from '../../utils'
import {getGroupOptionIDForCard} from '../../boardUtils'

import PropertyValueElement from '../propertyValueElement'
import MenuWrapper from '../../widgets/menuWrapper'
import IconButton from '../../widgets/buttons/iconButton'
import CompassIcon from '../../widgets/icons/compassIcon'
import OptionsIcon from '../../widgets/icons/options'
import Tooltip from '../../widgets/tooltip'
import ConfirmationDialogBox, {ConfirmationDialogBoxProps} from '../confirmationDialogBox'
import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'
import CardActionsMenu from '../cardActionsMenu/cardActionsMenu'
import EmojiIcon from '../emojiIcon'
import {useHasCapabilities} from '../../hooks/permissions'

import {useColumnResize} from './tableColumnResizeContext'

import './tableRow.scss'

type Props = {
    board: Board
    columnWidths: Record<string, number>
    isManualSort: boolean
    groupById?: string
    visiblePropertyIds: string[]
    collapsedOptionIds: string[]
    card: Card
    isSelected: boolean
    focusOnMount: boolean
    isLastCard: boolean
    showCard: (cardId?: string) => void
    readonly: boolean
    addCard: (groupByOptionId?: string) => Promise<void>
    onClick?: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
    onDrop: (srcCard: Card, dstCard: Card) => void
    hasSubCards?: boolean
    isExpanded?: boolean
    onToggleExpand?: (e: React.MouseEvent) => void
    isSubCard?: boolean
}

const TableRow = (props: Props) => {
    const intl = useIntl()
    const {board, card, isManualSort, groupById, visiblePropertyIds, collapsedOptionIds} = props

    const titleRef = useRef<{ focus(selectAll?: boolean): void }>(null)
    const [title, setTitle] = useState(props.card.title || '')
    const isGrouped = Boolean(groupById)
    const canEditCard = useHasCapabilities(card.boardId, ['canEditCard'])
    const isReadOnly = props.readonly || !canEditCard
    const [isDragging, isOver, cardRef] = useSortable('card', card, !isReadOnly && (isManualSort || isGrouped), props.onDrop)
    const [showConfirmationDialogBox, setShowConfirmationDialogBox] = useState<boolean>(false)
    const columnResize = useColumnResize()

    useEffect(() => {
        if (props.focusOnMount) {
            setTimeout(() => titleRef.current?.focus(), 10)
        }
    }, [])

    const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        props.onClick && props.onClick(e, card)
    }, [card, props.onClick])

    const onSaveWithEnter = useCallback(() => {
        if (props.isLastCard) {
            props.addCard(groupById ? card.fields.properties[groupById!] as string : '')
        }
    }, [groupById && card.fields.properties[groupById!], props.isLastCard, props.addCard])

    const onSave = useCallback((saveType: string) => {
        if (card.title !== title) {
            mutator.changeBlockTitle(props.board.id, card.id, card.title, title)
            if (saveType === 'onEnter') {
                onSaveWithEnter()
            }
        }
    }, [card.title, title, onSaveWithEnter, board.id, card.id])

    const onTitleChange = useCallback((newTitle: string) => {
        setTitle(newTitle)
    }, [title, setTitle])

    const visiblePropertyTemplates = useMemo(() => (
        visiblePropertyIds.map((id) => board.cardProperties.find((t) => t.id === id)).filter((i) => i) as IPropertyTemplate[]
    ), [board.cardProperties, visiblePropertyIds])

    let className = props.isSelected ? 'TableRow octo-table-row selected' : 'TableRow octo-table-row'
    if (isOver) {
        className += ' dragover'
    }
    if (isGrouped) {
        const groupTemplate = board.cardProperties.find((p) => p.id === groupById)
        const groupOptionID = getGroupOptionIDForCard(card, groupTemplate)
        const collapsedGroupKey = groupOptionID || 'undefined'
        if (collapsedOptionIds.indexOf(collapsedGroupKey) > -1) {
            className += ' hidden'
        }
    }
    if (isReadOnly) {
        className += ' readonly'
    }

    const handleDeleteCard = useCallback(async () => {
        if (!card) {
            Utils.assertFailure()
            return
        }
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DeleteCard, {board: board.id, card: card.id})
        await mutator.deleteBlock(card, 'delete card')
    }, [card, board.id])

    const confirmDialogProps: ConfirmationDialogBoxProps = useMemo(() => {
        return {
            heading: intl.formatMessage({id: 'CardDialog.delete-confirmation-dialog-heading', defaultMessage: 'Confirm card delete!'}),
            confirmButtonText: intl.formatMessage({id: 'CardDialog.delete-confirmation-dialog-button-text', defaultMessage: 'Delete'}),
            onConfirm: handleDeleteCard,
            onClose: () => {
                setShowConfirmationDialogBox(false)
            },
        }
    }, [handleDeleteCard])

    const handleDeleteButtonOnClick = useCallback(() => {
        // user trying to delete a card with blank name
        // but content present cannot be deleted without
        // confirmation dialog
        if (card?.title === '' && (card?.fields.contentOrder?.length ?? 0) === 0) {
            handleDeleteCard()
            return
        }
        setShowConfirmationDialogBox(true)
    }, [card?.title, card?.fields.contentOrder, handleDeleteCard])

    return (
        <div
            className={className}
            onClick={onClick}
            ref={cardRef}
            style={{opacity: isDragging ? 0.5 : 1}}
        >

            <div className='action-cell octo-table-cell-btn'>
                {!isReadOnly && (
                    <IconButton icon={<CompassIcon icon='drag-vertical'/>}/>
                )}
            </div>

            {/* Name / title */}
            <div
                className='octo-table-cell title-cell'
                id='mainBoardHeader'
                style={{width: columnResize.width(Constants.titleColumnId)}}
                ref={(ref) => columnResize.updateRef(card.id, Constants.titleColumnId, ref)}
            >
                {/* 깊이에 따라 들여쓰기 추가 (card.fields.depth 사용) */}
                {(card.fields.depth || 0) > 0 && (
                    <span
                        className='sub-card-indent'
                        style={{width: (card.fields.depth || 0) * 22}}
                    />
                )}
                {/* 하위 카드가 있으면 확장 버튼 추가, 없으면 같은 크기의 placeholder */}
                {props.hasSubCards ? (
                    <button
                        className={`expand-toggle ${props.isExpanded ? 'expand-toggle--expanded' : ''}`}
                        onClick={props.onToggleExpand}
                    >
                        <i className='CompassIcon icon-chevron-right'/>
                    </button>
                ) : props.isSubCard && (
                    <span className='expand-toggle-placeholder'/>
                )}
                <div className='octo-icontitle'>
                    <div className='octo-icon'><EmojiIcon icon={card.fields.icon || ''} size='medium'/></div>
                    <Editable
                        ref={titleRef}
                        value={title}
                        placeholderText='Untitled'
                        onChange={onTitleChange}
                        onSave={onSave}
                        onCancel={() => setTitle(card.title || '')}
                        readonly={isReadOnly}
                        spellCheck={true}
                    />
                </div>

                {!isReadOnly && (
                    <MenuWrapper
                        className='optionsMenu'
                        stopPropagationOnToggle={true}
                        usePortal={true}
                        menuPosition='left'
                    >
                        <Tooltip
                            title={intl.formatMessage({id: 'TableRow.MoreOption', defaultMessage: 'More actions'})}
                        >
                            <IconButton
                                title='MenuBtn'
                                icon={<OptionsIcon/>}
                            />
                        </Tooltip>
                        <CardActionsMenu
                            cardId={card.id}
                            boardId={card.boardId}
                            onClickDelete={handleDeleteButtonOnClick}
                            onClickDuplicate={() => {
                                mutator.duplicateCard(
                                    card.id,
                                    board.id,
                                    false,
                                    intl.formatMessage({id: 'TableRow.DuplicateCard', defaultMessage: 'duplicate card'}),
                                    false,
                                    {},
                                    async (newCardId) => {
                                        props.showCard(newCardId)
                                    },
                                    async () => {
                                        props.showCard(undefined)
                                    },
                                )
                            }}
                        />
                    </MenuWrapper>
                )}

                <div className='open-button'>
                    <Button onClick={() => props.showCard(props.card.id || '')}>
                        <FormattedMessage
                            id='TableRow.open'
                            defaultMessage='Open'
                        />
                    </Button>
                </div>
            </div>

            {/* Columns, one per property */}
            {visiblePropertyTemplates.map((template) => {
                return (
                    <div
                        className='octo-table-cell'
                        key={template.id}
                        style={{width: columnResize.width(template.id)}}
                        ref={(ref) => columnResize.updateRef(card.id, template.id, ref)}
                    >
                        <PropertyValueElement
                            readOnly={isReadOnly}
                            card={card}
                            board={board}
                            propertyTemplate={template}
                            showEmptyPlaceholder={false}
                        />
                    </div>
                )
            })}

            {showConfirmationDialogBox && <ConfirmationDialogBox dialogBox={confirmDialogProps}/>}
        </div>
    )
}

export default React.memo(TableRow)
