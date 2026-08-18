// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState, useCallback} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'
import {DragDropContext, Droppable, Draggable, DropResult} from '@hello-pangea/dnd'

import {Board, IPropertyTemplate} from '../../blocks/board'
import {Card} from '../../blocks/card'
import {BoardView} from '../../blocks/boardView'

import mutator from '../../mutator'
import Button from '../../widgets/buttons/button'
import MenuWrapper from '../../widgets/menuWrapper'
import PropertyMenu, {PropertyTypes} from '../../widgets/propertyMenu'

import Calculations from '../calculations/calculations'
import PropertyValueElement from '../propertyValueElement'
import ConfirmationDialogBox, {ConfirmationDialogBoxProps} from '../confirmationDialogBox'
import {sendFlashMessage} from '../flashMessages'
import Menu from '../../widgets/menu'
import {IDType, Utils} from '../../utils'
import AddPropertiesTourStep from '../onboardingTour/addProperties/add_properties'
import {Permission} from '../../constants'
import {useCanEditCardProperties, useHasCurrentBoardCardPermissions} from '../../hooks/permissions'
import propRegistry from '../../properties'
import {PropertyType} from '../../properties/types'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {updateBoards} from '../../store/boards'
import {updateViews} from '../../store/views'
import {getCurrentBoardCards} from '../../store/cards'
import GripIcon from '../../widgets/icons/grip'
import './cardDetailProperties.scss'

// 속성 값이 비어있는지 확인하는 헬퍼 함수
export function isPropertyValueEmpty(value: string | string[] | undefined, propertyType?: string): boolean {
    if (value === undefined || value === null) {
        return true
    }
    if (Array.isArray(value)) {
        return value.length === 0
    }

    // 문자열인 경우
    if (typeof value === 'string') {
        // 빈 문자열 체크
        if (value.trim() === '') {
            return true
        }

        // 카드 타입: JSON 형식으로 저장되며, cards 배열이 비어있으면 "비어있음"
        if (propertyType === 'card') {
            try {
                const parsed = JSON.parse(value)
                return !parsed.cards || parsed.cards.length === 0
            } catch {
                return true
            }
        }
    }

    return false
}

// 필수 속성 중 비어있는 속성 목록 반환
export function getMissingRequiredProperties(board: Board, card: Card): IPropertyTemplate[] {
    return board.cardProperties.filter((prop) => {
        if (!prop.required) {
            return false
        }
        const value = card.fields.properties[prop.id]
        return isPropertyValueEmpty(value, prop.type)
    })
}

type Props = {
    board: Board
    card: Card
    cards: Card[]
    activeView: BoardView
    views: BoardView[]
    readonly: boolean
}

const CardDetailProperties = (props: Props) => {
    const {board, card, cards, views, activeView} = props
    const dispatch = useAppDispatch()
    const [newTemplateId, setNewTemplateId] = useState('')
    // 보드가 잠그면 속성을 더하고 이름·유형을 바꾸고 지우는 일이 보드 관리자 몫이
    // 된다. 잠그지 않은 보드에서는 지금까지의 답 그대로다 (spec U-02·U-03).
    const canEditBoardProperties = useCanEditCardProperties(board)
    // Card aware, but still routed through the permission hook so a board
    // whose capabilities have not arrived yet falls back to the membership
    // answer instead of rendering everything read only.
    const canEditBoardCards = useHasCurrentBoardCardPermissions(card.id, [Permission.ManageBoardCards])
    const intl = useIntl()
    
    // 현재 보드의 모든 카드 (필터링되지 않은)
    const allBoardCards = useAppSelector(getCurrentBoardCards)

    useEffect(() => {
        const newProperty = board.cardProperties.find((property) => property.id === newTemplateId)
        if (newProperty) {
            setNewTemplateId('')
        }
    }, [newTemplateId, board.cardProperties])

    const [confirmationDialogBox, setConfirmationDialogBox] = useState<ConfirmationDialogBoxProps>({heading: '', onConfirm: () => {}, onClose: () => {}})
    const [showConfirmationDialog, setShowConfirmationDialog] = useState<boolean>(false)

    function onPropertyChangeSetAndOpenConfirmationDialog(newType: PropertyType, newName: string, propertyTemplate: IPropertyTemplate) {
        const oldType = propRegistry.get(propertyTemplate.type)

        // do nothing if no change
        if (oldType === newType && propertyTemplate.name === newName) {
            return
        }

        const affectsNumOfCards: string = Calculations.countNotEmpty(cards, propertyTemplate, intl)

        // if only the name has changed, set the property without warning
        if (affectsNumOfCards === '0' || oldType === newType) {
            mutator.changePropertyTypeAndName(board, cards, propertyTemplate, newType.type, newName)
            return
        }

        const subTextString = intl.formatMessage({
            id: 'CardDetailProperty.property-name-change-subtext',
            defaultMessage: 'type from "{oldPropType}" to "{newPropType}"',
        }, {oldPropType: oldType.displayName(intl), newPropType: newType.displayName(intl)})

        setConfirmationDialogBox({
            heading: intl.formatMessage({id: 'CardDetailProperty.confirm-property-type-change', defaultMessage: 'Confirm property type change'}),
            subText: intl.formatMessage({
                id: 'CardDetailProperty.confirm-property-name-change-subtext',
                defaultMessage: 'Are you sure you want to change property "{propertyName}" {customText}? This will affect value(s) across {numOfCards} card(s) in this board, and can result in data loss.',
            },
            {
                propertyName: propertyTemplate.name,
                customText: subTextString,
                numOfCards: affectsNumOfCards,
            }),

            confirmButtonText: intl.formatMessage({id: 'CardDetailProperty.property-change-action-button', defaultMessage: 'Change property'}),
            onConfirm: async () => {
                setShowConfirmationDialog(false)
                try {
                    await mutator.changePropertyTypeAndName(board, cards, propertyTemplate, newType.type, newName)
                } catch (err: any) {
                    Utils.logError(`Error Changing Property And Name:${propertyTemplate.name}: ${err?.toString()}`)
                }
                sendFlashMessage({content: intl.formatMessage({id: 'CardDetailProperty.property-changed', defaultMessage: 'Changed property successfully!'}), severity: 'high'})
            },
            onClose: () => setShowConfirmationDialog(false),
        })

        // open confirmation dialog for property type change
        setShowConfirmationDialog(true)
    }

    function onPropertyDeleteSetAndOpenConfirmationDialog(propertyTemplate: IPropertyTemplate) {
        // set ConfirmationDialogBox Props
        setConfirmationDialogBox({
            heading: intl.formatMessage({id: 'CardDetailProperty.confirm-delete-heading', defaultMessage: 'Confirm delete property'}),
            subText: intl.formatMessage({
                id: 'CardDetailProperty.confirm-delete-subtext',
                defaultMessage: 'Are you sure you want to delete the property "{propertyName}"? Deleting it will delete the property from all cards in this board.',
            },
            {propertyName: propertyTemplate.name}),
            confirmButtonText: intl.formatMessage({id: 'CardDetailProperty.delete-action-button', defaultMessage: 'Delete'}),
            onConfirm: async () => {
                const deletingPropName = propertyTemplate.name
                setShowConfirmationDialog(false)
                try {
                    await mutator.deleteProperty(board, views, cards, propertyTemplate.id)
                    sendFlashMessage({content: intl.formatMessage({id: 'CardDetailProperty.property-deleted', defaultMessage: 'Deleted {propertyName} successfully!'}, {propertyName: deletingPropName}), severity: 'high'})
                } catch (err: any) {
                    Utils.logError(`Error Deleting Property!: Could Not delete Property -" + ${deletingPropName} ${err?.toString()}`)
                }
            },

            onClose: () => setShowConfirmationDialog(false),
        })

        // open confirmation dialog property delete
        setShowConfirmationDialog(true)
    }

    function onBoardChangeSetAndOpenConfirmationDialog(selectedBoard: Board, propertyTemplate: IPropertyTemplate) {
        console.log('onBoardChangeSetAndOpenConfirmationDialog called:', selectedBoard.title, propertyTemplate.name)
        console.log('allBoardCards:', allBoardCards.length)
        
        // 카드 속성에 실제로 선택된 카드가 있는 카드 수 계산
        // JSON 형식: {"boardId":"...","cards":[...]} 또는 이전 형식 호환
        const cardsWithSelectedCards = allBoardCards.filter((c) => {
            const value = c.fields.properties[propertyTemplate.id]
            console.log('Card value:', c.title, value)
            if (!value || typeof value !== 'string') {
                return false
            }
            // JSON 형식 (새 형식)
            if (value.startsWith('{')) {
                try {
                    const parsed = JSON.parse(value)
                    return parsed.cards && parsed.cards.length > 0
                } catch {
                    return false
                }
            }
            // 이전 형식 호환: "boardId|cardId:title"
            if (value.includes('|')) {
                const [, cardsStr] = value.split('|')
                return cardsStr && cardsStr.length > 0
            }
            // 이전 형식 호환: "boardId:cardId:cardTitle"
            const parts = value.split(':')
            return parts.length >= 3
        })
        const affectsNumOfCards = cardsWithSelectedCards.length
        console.log('affectsNumOfCards:', affectsNumOfCards)

        // 영향 받는 카드가 없으면 바로 변경
        if (affectsNumOfCards === 0) {
            console.log('No affected cards, performing change directly')
            performBoardChange(selectedBoard, propertyTemplate)
            return
        }
        
        console.log('Showing confirmation dialog')

        // 확인 다이얼로그 표시
        setConfirmationDialogBox({
            heading: intl.formatMessage({id: 'CardDetailProperty.confirm-board-change-heading', defaultMessage: 'Confirm linked board change'}),
            subText: intl.formatMessage({
                id: 'CardDetailProperty.confirm-board-change-subtext',
                defaultMessage: 'Are you sure you want to change the linked board for property "{propertyName}"? This will clear card selections across {numOfCards} card(s) in this board.',
            },
            {
                propertyName: propertyTemplate.name,
                numOfCards: String(affectsNumOfCards),
            }),
            confirmButtonText: intl.formatMessage({id: 'CardDetailProperty.board-change-action-button', defaultMessage: 'Change board'}),
            onConfirm: async () => {
                setShowConfirmationDialog(false)
                await performBoardChange(selectedBoard, propertyTemplate)
                sendFlashMessage({content: intl.formatMessage({id: 'CardDetailProperty.board-changed', defaultMessage: 'Changed linked board successfully!'}), severity: 'high'})
            },
            onClose: () => setShowConfirmationDialog(false),
        })

        setShowConfirmationDialog(true)
    }

    async function performBoardChange(selectedBoard: Board, propertyTemplate: IPropertyTemplate) {
        console.log('performBoardChange called:', selectedBoard.title)
        try {
            // 속성 템플릿에 기본 보드 ID 저장 (mutator.updateBoard 내부에서 이미 dispatch됨)
            console.log('Calling updatePropertyTemplateDefaultBoardId...')
            const updatedBoard = await mutator.updatePropertyTemplateDefaultBoardId(board, propertyTemplate.id, selectedBoard.id)
            console.log('updatedBoard:', updatedBoard?.id, updatedBoard?.cardProperties?.find((p) => p.id === propertyTemplate.id)?.options)
            
            // 보드가 변경되면 모든 카드의 해당 속성 값 초기화 (필터링되지 않은 모든 카드 대상)
            console.log('Clearing card properties for', allBoardCards.length, 'cards...')
            for (let i = 0; i < allBoardCards.length; i++) {
                const c = allBoardCards[i]
                console.log(`Clearing card ${i + 1}/${allBoardCards.length}:`, c.title)
                try {
                    await mutator.changePropertyValue(board.id, c, propertyTemplate.id, '', 'clear card property')
                    console.log(`Card ${i + 1} cleared successfully`)
                } catch (cardErr) {
                    console.error(`Error clearing card ${i + 1}:`, cardErr)
                }
            }
            console.log('All cards cleared')
            
            // 속성 이름을 선택한 보드 이름으로 변경
            // 중요: updatedBoard에서 업데이트된 propertyTemplate을 사용해야 함!
            // 그래야 changePropertyTypeAndName이 options를 복사할 때 새 보드 ID가 유지됨
            const updatedPropertyTemplate = updatedBoard.cardProperties.find((p) => p.id === propertyTemplate.id)
            if (!updatedPropertyTemplate) {
                console.error('Could not find updated property template')
                return
            }
            console.log('Changing property name to:', selectedBoard.title)
            console.log('updatedPropertyTemplate.options:', updatedPropertyTemplate.options)
            const cardPropertyType = propRegistry.get(updatedPropertyTemplate.type)
            await mutator.changePropertyTypeAndName(updatedBoard, allBoardCards, updatedPropertyTemplate, cardPropertyType.type, selectedBoard.title)
            console.log('performBoardChange completed successfully')
        } catch (err: any) {
            console.error('Error in performBoardChange:', err)
            Utils.logError(`Error changing linked board: ${err?.toString()}`)
        }
    }

    const onDragEnd = useCallback((result: DropResult) => {
        const {source, destination} = result
        
        if (!destination || source.index === destination.index) {
            return
        }
        
        const propertyTemplate = board.cardProperties[source.index]
        if (!propertyTemplate) {
            return
        }
        
        const reorderedTemplates = board.cardProperties.slice()
        Utils.arrayMove(reorderedTemplates, source.index, destination.index)
        const reorderedIds = reorderedTemplates.map((template) => template.id)
        
        const updatedBoard = {
            ...board,
            cardProperties: reorderedTemplates,
        }
        dispatch(updateBoards([updatedBoard]))
        
        void mutator.changePropertyTemplateOrder(board, propertyTemplate, destination.index)
        
        const updatedViews: BoardView[] = []
        views.forEach((view) => {
            const oldVisiblePropertyIds = view.fields.visiblePropertyIds
            if (!oldVisiblePropertyIds.includes(propertyTemplate.id)) {
                return
            }
            
            const newVisiblePropertyIds = reorderedIds.filter((id) => oldVisiblePropertyIds.includes(id))
            if (!Utils.arraysEqual(oldVisiblePropertyIds, newVisiblePropertyIds)) {
                const newView = {
                    ...view,
                    fields: {
                        ...view.fields,
                        visiblePropertyIds: newVisiblePropertyIds,
                    },
                }
                updatedViews.push(newView)
                void mutator.changeViewVisibleProperties(board.id, view.id, oldVisiblePropertyIds, newVisiblePropertyIds, 'reorder properties')
            }
        })
        
        if (updatedViews.length) {
            dispatch(updateViews(updatedViews))
        }
    }, [board, views, dispatch])

    const isDragDisabled = props.readonly || !canEditBoardProperties

    return (
        <div className='octo-propertylist CardDetailProperties'>
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId='property-list' type='property'>
                    {(droppableProvided) => (
                        <div
                            ref={droppableProvided.innerRef}
                            {...droppableProvided.droppableProps}
                        >
                            {board.cardProperties.map((propertyTemplate: IPropertyTemplate, index: number) => {
                                const propertyValue = card.fields.properties[propertyTemplate.id]
                                const isRequiredEmpty = propertyTemplate.required && isPropertyValueEmpty(propertyValue, propertyTemplate.type)

                                return (
                                    <Draggable
                                        key={propertyTemplate.id}
                                        draggableId={propertyTemplate.id}
                                        index={index}
                                        isDragDisabled={isDragDisabled}
                                    >
                                        {(draggableProvided, snapshot) => (
                                            <div
                                                ref={draggableProvided.innerRef}
                                                {...draggableProvided.draggableProps}
                                                className={`octo-propertyrow${isRequiredEmpty ? ' octo-propertyrow--required-empty' : ''}${snapshot.isDragging ? ' octo-propertyrow--dragging' : ''}`}
                                            >
                                                {!isDragDisabled && (
                                                    <div
                                                        className='drag-handle'
                                                        {...draggableProvided.dragHandleProps}
                                                    >
                                                        <GripIcon/>
                                                    </div>
                                                )}
                                                {(props.readonly || !canEditBoardProperties) && (
                                                    <div className='octo-propertyname octo-propertyname--readonly'>
                                                        {propertyTemplate.name}
                                                        {propertyTemplate.required && <span className='octo-propertyname--required'>*</span>}
                                                    </div>
                                                )}
                                                {!props.readonly && canEditBoardProperties &&
                                                    <MenuWrapper isOpen={propertyTemplate.id === newTemplateId}>
                                                        <div className='octo-propertyname'>
                                                            <Button>
                                                                {propertyTemplate.name}
                                                                {propertyTemplate.required && <span className='octo-propertyname--required'>*</span>}
                                                            </Button>
                                                        </div>
                                                        <PropertyMenu
                                                            propertyId={propertyTemplate.id}
                                                            propertyName={propertyTemplate.name}
                                                            propertyType={propRegistry.get(propertyTemplate.type)}
                                                            required={propertyTemplate.required}
                                                            onTypeAndNameChanged={(newType: PropertyType, newName: string) => onPropertyChangeSetAndOpenConfirmationDialog(newType, newName, propertyTemplate)}
                                                            onRequiredChanged={(required: boolean) => {
                                                                mutator.changePropertyRequired(board, propertyTemplate, required)
                                                            }}
                                                            onDelete={() => onPropertyDeleteSetAndOpenConfirmationDialog(propertyTemplate)}
                                                            onBoardSelected={(selectedBoard: Board) => {
                                                                console.log('onBoardSelected called:', selectedBoard.title)
                                                                setTimeout(() => {
                                                                    console.log('setTimeout triggered, calling onBoardChangeSetAndOpenConfirmationDialog')
                                                                    onBoardChangeSetAndOpenConfirmationDialog(selectedBoard, propertyTemplate)
                                                                }, 100)
                                                            }}
                                                        />
                                                    </MenuWrapper>
                                                }
                                                <PropertyValueElement
                                                    readOnly={props.readonly || !canEditBoardCards}
                                                    card={card}
                                                    board={board}
                                                    propertyTemplate={propertyTemplate}
                                                    showEmptyPlaceholder={true}
                                                />
                                            </div>
                                        )}
                                    </Draggable>
                                )
                            })}
                            {droppableProvided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            {showConfirmationDialog && (
                <ConfirmationDialogBox
                    dialogBox={confirmationDialogBox}
                />
            )}

            {!props.readonly && canEditBoardProperties &&
                <div className='octo-propertyname add-property'>
                    <MenuWrapper>
                        <Button>
                            <FormattedMessage
                                id='CardDetail.add-property'
                                defaultMessage='+ Add a property'
                            />
                        </Button>
                        <Menu>
                            <PropertyTypes
                                label={intl.formatMessage({id: 'PropertyMenu.selectType', defaultMessage: 'Select property type'})}
                                onTypeSelected={async (type) => {
                                    const template: IPropertyTemplate = {
                                        id: Utils.createGuid(IDType.BlockID),
                                        name: type.displayName(intl),
                                        type: type.type,
                                        options: [],
                                    }
                                    const templateId = await mutator.insertPropertyTemplate(board, activeView, -1, template)
                                    setNewTemplateId(templateId)
                                }}
                            />
                        </Menu>
                    </MenuWrapper>

                    <AddPropertiesTourStep/>
                </div>
            }
        </div>
    )
}

export default React.memo(CardDetailProperties)
