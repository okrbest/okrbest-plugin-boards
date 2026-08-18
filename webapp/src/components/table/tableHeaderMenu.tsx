// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {FC} from 'react'
import {useIntl} from 'react-intl'

import {Constants} from '../../constants'
import {Board, IPropertyTemplate} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import mutator from '../../mutator'
import Menu from '../../widgets/menu'
import {useCanEditCardProperties} from '../../hooks/permissions'

type Props = {
    templateId: string
    board: Board
    activeView: BoardView
    views: BoardView[]
    cards: Card[]
}

const TableHeaderMenu: FC<React.PropsWithChildren<Props>> = (props: Props): React.JSX.Element => {
    const {board, activeView, templateId, views, cards} = props
    const intl = useIntl()

    // 정렬과 숨기기는 뷰를 바꾸는 일이라 여기 걸리지 않는다. 걸리는 것은 보드가
    // 무엇을 기록하는지 바꾸는 항목 — 넣기, 복제, 지우기다 (spec U-01).
    const canEditProperties = useCanEditCardProperties(board)

    return (
        <Menu>
            <Menu.Text
                id='sortAscending'
                name={intl.formatMessage({id: 'TableHeaderMenu.sort-ascending', defaultMessage: 'Sort ascending'})}
                onClick={() => mutator.changeViewSortOptions(board.id, activeView.id, activeView.fields.sortOptions, [{propertyId: templateId, reversed: false}])}
            />
            <Menu.Text
                id='sortDescending'
                name={intl.formatMessage({id: 'TableHeaderMenu.sort-descending', defaultMessage: 'Sort descending'})}
                onClick={() => mutator.changeViewSortOptions(board.id, activeView.id, activeView.fields.sortOptions, [{propertyId: templateId, reversed: true}])}
            />
            {canEditProperties && <Menu.Text
                id='insertLeft'
                name={intl.formatMessage({id: 'TableHeaderMenu.insert-left', defaultMessage: 'Insert left'})}
                onClick={() => {
                    if (props.templateId === Constants.titleColumnId) {
                        // Note: Name column (title) cannot be inserted - it's always the first column
                        // This is a design constraint, not a bug
                    } else {
                        const index = board.cardProperties.findIndex((o: IPropertyTemplate) => o.id === templateId)
                        mutator.insertPropertyTemplate(board, activeView, index)
                    }
                }}
            />}
            {canEditProperties && <Menu.Text
                id='insertRight'
                name={intl.formatMessage({id: 'TableHeaderMenu.insert-right', defaultMessage: 'Insert right'})}
                onClick={() => {
                    if (templateId === Constants.titleColumnId) {
                        // eslint-disable-next-line no-warning-comments
                        // TODO: Handle title column
                    } else {
                        const index = board.cardProperties.findIndex((o: IPropertyTemplate) => o.id === templateId) + 1
                        mutator.insertPropertyTemplate(board, activeView, index)
                    }
                }}
            />}
            {props.templateId !== Constants.titleColumnId &&
                <>
                    <Menu.Text
                        id='hide'
                        name={intl.formatMessage({id: 'TableHeaderMenu.hide', defaultMessage: 'Hide'})}
                        onClick={() => mutator.changeViewVisibleProperties(board.id, activeView.id, activeView.fields.visiblePropertyIds, activeView.fields.visiblePropertyIds.filter((o: string) => o !== templateId))}
                    />
                    {canEditProperties && <Menu.Text
                        id='duplicate'
                        name={intl.formatMessage({id: 'TableHeaderMenu.duplicate', defaultMessage: 'Duplicate'})}
                        onClick={() => mutator.duplicatePropertyTemplate(board, activeView, templateId)}
                    />}
                    {canEditProperties && <Menu.Text
                        id='delete'
                        name={intl.formatMessage({id: 'TableHeaderMenu.delete', defaultMessage: 'Delete'})}
                        onClick={() => mutator.deleteProperty(board, views, cards, templateId)}
                    />}
                </>}
        </Menu>
    )
}

export default TableHeaderMenu
