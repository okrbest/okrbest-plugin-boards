// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'
import {useIntl} from 'react-intl'

import {useDrop} from 'react-dnd'

import {Board, IPropertyOption, IPropertyTemplate, BoardGroup} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'

import TableAddRow from './tableAddRow'
import TableGroupHeaderRow from './tableGroupHeaderRow'
import TableRows from './tableRows'

type Props = {
    board: Board
    activeView: BoardView
    groupByProperty?: IPropertyTemplate
    group: BoardGroup
    readonly: boolean
    selectedCardIds: string[]
    cardIdToFocusOnRender: string
    hideGroup: (groupByOptionId: string) => void
    addCard: (groupByOptionId?: string) => Promise<void>
    addSubCard: (parentCard: Card) => Promise<void>
    showCard: (cardId?: string) => void
    propertyNameChanged: (option: IPropertyOption, text: string) => Promise<void>
    onCardClicked: (e: React.MouseEvent, card: Card) => void
    onDropToGroupHeader: (srcOption: IPropertyOption, dstOption?: IPropertyOption) => void
    onDropToCard: (srcCard: Card, dstCard: Card) => void
    onDropToGroup: (srcCard: Card, groupID: string, dstCardID: string) => void
}

const TableGroup = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const {board, activeView, group, onDropToGroup, groupByProperty} = props
    const groupId = group.option.id
    const isCollapsed = activeView.fields.collapsedOptionIds.includes(group.option.id || 'undefined')

    const [{isOver}, drop] = useDrop(() => ({
        accept: 'card',
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
        drop: (item: Card, monitor) => {
            if (monitor.isOver({shallow: true})) {
                onDropToGroup(item, groupId, '')
            }
        },
    }), [onDropToGroup, groupId])

    // The group's own option ID, so the new card lands in this group with its
    // property already set. addCard does the filling.
    const onAddCard = useCallback(() => {
        props.addCard(groupId)
    }, [props.addCard, groupId])

    let className = 'octo-table-group'
    if (isOver) {
        className += ' dragover'
    }

    return (
        <div
            ref={(node) => { drop(node) }}
            className={className}
            key={group.option.id}
        >
            <TableGroupHeaderRow
                group={group}
                board={board}
                activeView={activeView}
                groupByProperty={groupByProperty}
                hideGroup={props.hideGroup}
                addCard={props.addCard}
                readonly={props.readonly}
                propertyNameChanged={props.propertyNameChanged}
                onDrop={props.onDropToGroupHeader}
            />

            {!isCollapsed && (group.cards.length > 0) &&
            <TableRows
                board={board}
                activeView={activeView}
                cards={group.cards}
                selectedCardIds={props.selectedCardIds}
                readonly={props.readonly}
                cardIdToFocusOnRender={props.cardIdToFocusOnRender}
                showCard={props.showCard}
                addCard={props.addCard}
                addSubCard={props.addSubCard}
                onCardClicked={props.onCardClicked}
                onDrop={props.onDropToCard}
            />}

            {/*
              * Outside the cards.length check on purpose: an empty group needs
              * the add row too, and it is the only way to put the first card
              * in one. Collapsed groups show neither rows nor this.
              */}
            {!isCollapsed && !props.readonly &&
            <TableAddRow
                label={intl.formatMessage({id: 'TableComponent.plus-new-card', defaultMessage: '+ New card'})}
                onClick={onAddCard}
            />}
        </div>
    )
}

export default React.memo(TableGroup)
