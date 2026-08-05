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
import {useTableRowDrag} from '../../hooks/useTableRowDrag'
import {useAppSelector} from '../../store/hooks'
import {getCurrentBoardSubCardsByParent} from '../../store/cards'

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
import Menu from '../../widgets/menu'
import AddIcon from '../../widgets/icons/add'
import EmojiIcon from '../emojiIcon'
import {useHasCapabilities} from '../../hooks/permissions'

import {useColumnResize} from './tableColumnResizeContext'
import {useTableDrag} from './tableDragContext'
import {collectSubtree} from './subtree'

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

    // 함께 선택된 카드들. 순서 이동일 때 같이 옮긴다 (FR-031).
    selectedCardIds?: string[]
    focusOnMount: boolean
    isLastCard: boolean
    showCard: (cardId?: string) => void
    readonly: boolean
    addCard: (groupByOptionId?: string) => Promise<void>
    onClick?: (e: React.MouseEvent<HTMLDivElement>, card: Card) => void
    onDrop: (srcCard: Card, dstCard: Card) => void
    hasSubCards?: boolean
    addSubCard?: (parentCard: Card) => Promise<void>
    isExpanded?: boolean
    onToggleExpand?: (e: React.MouseEvent) => void
    isSubCard?: boolean
}

const TableRow = (props: Props) => {
    const intl = useIntl()
    const {board, card, groupById, visiblePropertyIds, collapsedOptionIds} = props

    const titleRef = useRef<{ focus(selectAll?: boolean): void }>(null)
    const [title, setTitle] = useState(props.card.title || '')
    const isGrouped = Boolean(groupById)
    const canEditCard = useHasCapabilities(card.boardId, ['canEditCard'])
    const isReadOnly = props.readonly || !canEditCard
    // 정렬이 걸려 있어도 드래그를 막지 않는다. 놓는 순간 수동 정렬로 전환할지
    // 묻고, 거부하면 아무 일도 일어나지 않는다 (FR-025). 예전에는 여기서
    // 막아 사용자가 이유를 모른 채 포기했다.
    const canDrag = !isReadOnly
    const subCardsByParent = useAppSelector(getCurrentBoardSubCardsByParent)
    const {registerRow, unregisterRow, draggingSubtree} = useTableDrag()

    // 드래그 단위는 카드가 아니라 서브트리다. 시작 시 한 번 굳혀 두고, 적용
    // 단계가 이 값을 그대로 쓴다 (FR-017).
    const dragItem = useMemo(() => {
        const {subtreeIds, subtreeHeight} = collectSubtree(card.id, subCardsByParent)
        return {
            cardId: card.id,
            subtreeIds,
            subtreeHeight,
            sourceParentId: card.fields.parentCardId || '',
            sourceDepth: card.fields.depth || 0,
            selectedCardIds: props.selectedCardIds ?? [],
        }
    }, [card.id, card.fields.parentCardId, card.fields.depth, subCardsByParent, props.selectedCardIds])

    const {handleRef, rowRef, isDragging} = useTableRowDrag(dragItem, canDrag)
    const [showConfirmationDialogBox, setShowConfirmationDialogBox] = useState<boolean>(false)
    const columnResize = useColumnResize()

    // A card at the depth limit cannot hold another level, and a card that
    // already has sub-cards is served by the add row under them.
    const canAddFirstSubCard = Boolean(props.addSubCard) &&
        !props.hasSubCards &&
        (card.fields.depth || 0) < Constants.maxCardDepth

    useEffect(() => {
        if (props.focusOnMount) {
            setTimeout(() => titleRef.current?.focus(), 10)
        }
    }, [])

    // 판정 모듈이 쓸 행 위치를 컨텍스트에 등록한다. 좌표는 .Table의 콘텐츠
    // 좌표계로 옮긴다 — 인디케이터가 같은 좌표계를 쓰므로 스크롤 보정이
    // 필요 없다.
    //
    // 접힌 그룹의 행은 언마운트되지 않고 display:none으로 남아 높이가 0이다.
    // 컨텍스트가 그런 행을 걸러내므로 접힌 그룹에는 경계가 생기지 않는다.
    useEffect(() => {
        const row = rowRef.current
        const container = row?.closest('.Table')
        if (!row || !container) {
            return undefined
        }

        const rowRect = row.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()

        registerRow({
            cardId: card.id,
            depth: card.fields.depth || 0,
            parentCardId: card.fields.parentCardId || '',
            top: (rowRect.top - containerRect.top) + container.scrollTop,
            height: rowRect.height,
            groupValue: groupById ? card.fields.properties[groupById] : undefined,
        })

        return undefined

        // 의존성 배열을 두지 않는다. 행 위치는 앞 행이 늘거나 줄면 바뀌는데
        // 그건 이 컴포넌트의 props로 드러나지 않는다. 대신 컨텍스트가 값이
        // 그대로면 상태를 갱신하지 않아 렌더 루프가 생기지 않는다.
    })

    // 등록 해제는 언마운트 때 한 번만 한다.
    useEffect(() => () => unregisterRow(card.id), [card.id, unregisterRow])

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

    // 함께 움직일 서브트리 전체를 흐리게 한다. 드래그한 행 하나만 흐려지면
    // 하위 카드가 따라온다는 사실이 화면에 드러나지 않는다 (FR-019).
    const isMoving = isDragging || draggingSubtree.has(card.id)

    return (
        <div
            className={className}
            onClick={onClick}
            ref={rowRef}
            style={{opacity: isMoving ? 0.5 : 1}}
        >

            <div className='action-cell octo-table-cell-btn'>
                {!isReadOnly && (
                    <div
                        ref={handleRef}
                        className='drag-handle'
                    >
                        <IconButton icon={<CompassIcon icon='drag-vertical'/>}/>
                    </div>
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
                        style={{width: (card.fields.depth || 0) * Constants.tableSubCardIndentPx}}
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
                        >
                            {/*
                              * Only for a card that has no sub-card list yet.
                              * Once it has one, the add row at the end of that
                              * list is the entry point and this would be a
                              * second way to do the same thing (spec FR-009).
                              */}
                            {canAddFirstSubCard &&
                            <Menu.Text
                                id='addSubCard'
                                icon={<AddIcon/>}
                                name={intl.formatMessage({id: 'CardActionsMenu.addSubCard', defaultMessage: 'Add sub-card'})}
                                onClick={() => props.addSubCard?.(card)}
                            />}
                        </CardActionsMenu>
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
