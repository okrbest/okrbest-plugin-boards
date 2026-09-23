// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {Board} from '../../blocks/board'
import {CategoryBoards} from '../../store/sidebar'
import mutator from '../../mutator'
import Button from '../../widgets/buttons/button'
import IconButton from '../../widgets/buttons/iconButton'
import ChevronDown from '../../widgets/icons/chevronDown'
import ChevronRight from '../../widgets/icons/chevronRight'
import CompassIcon from '../../widgets/icons/compassIcon'
import HideIcon from '../../widgets/icons/hide'
import ShowIcon from '../../widgets/icons/show'
import EmojiIcon from '../emojiIcon'
import {sendFlashMessage} from '../flashMessages'

import {getHiddenCategoryBoards} from './categoryBoards'

type Props = {
    categoryBoards: CategoryBoards
    boards: Board[]
}

// 카테고리 보드 목록 아래의 "숨긴 보드 N개" 접힘 행. 끌어 옮기는 대상이 아니므로 Droppable 바깥에 둔다.
const HiddenBoardsRow = (props: Props): React.JSX.Element | null => {
    const intl = useIntl()
    const [expanded, setExpanded] = useState(false)

    const hiddenBoards = getHiddenCategoryBoards(props.categoryBoards, props.boards)
    if (hiddenBoards.length === 0) {
        return null
    }

    const toggle = () => setExpanded((value) => !value)

    const notifyShowFailed = (): void => {
        sendFlashMessage({
            content: intl.formatMessage({id: 'HiddenBoards.showFailed', defaultMessage: 'Couldn\'t show the board'}),
            severity: 'high',
        })
    }

    const showBoard = async (boardID: string): Promise<void> => {
        const ok = await mutator.unhideBoard(props.categoryBoards.id, boardID)
        if (!ok) {
            notifyShowFailed()
        }
    }

    // 차례로 되찾는다. 실패한 보드는 행에 남고, 알림은 끝에 한 번만 띄운다 (F-03).
    const showAll = async (): Promise<void> => {
        let failed = 0
        for (const board of hiddenBoards) {
            // eslint-disable-next-line no-await-in-loop
            const ok = await mutator.unhideBoard(props.categoryBoards.id, board.id)
            if (!ok) {
                failed++
            }
        }
        if (failed > 0) {
            notifyShowFailed()
        }
    }

    return (
        <div className='HiddenBoardsRow'>
            <div className='octo-sidebar-item subitem HiddenBoardsRow__header'>
                <div
                    className='HiddenBoardsRow__toggle'
                    role='button'
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={toggle}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggle()
                        }
                    }}
                >
                    {expanded ? <ChevronDown/> : <ChevronRight/>}
                    <span className='octo-sidebar-title'>
                        <FormattedMessage
                            id='HiddenBoards.count'
                            defaultMessage='{count, plural, one {# hidden board} other {# hidden boards}}'
                            values={{count: hiddenBoards.length}}
                        />
                    </span>
                </div>
                {expanded && hiddenBoards.length > 1 && (
                    <Button
                        className='HiddenBoardsRow__showAll'
                        emphasis='link'
                        size='xsmall'
                        onClick={showAll}
                    >
                        {intl.formatMessage({id: 'HiddenBoards.showAll', defaultMessage: 'Show all'})}
                    </Button>
                )}
            </div>
            {expanded && hiddenBoards.map((board) => {
                const title = board.title || intl.formatMessage({id: 'Sidebar.untitled-board', defaultMessage: '(Untitled Board)'})
                return (
                    <div
                        key={board.id}
                        className='octo-sidebar-item subitem HiddenBoardsRow__item'
                    >
                        <div className='octo-sidebar-icon'>
                            {board.icon ? <EmojiIcon icon={board.icon} size='small'/> : <CompassIcon icon='product-boards'/>}
                        </div>
                        <div
                            className='octo-sidebar-title'
                            title={title}
                        >
                            {title}
                        </div>
                        <HideIcon/>
                        <IconButton
                            className='HiddenBoardsRow__show'
                            icon={<ShowIcon/>}
                            title={intl.formatMessage({id: 'HiddenBoards.show', defaultMessage: 'Show'})}
                            onClick={() => showBoard(board.id)}
                        />
                    </div>
                )
            })}
        </div>
    )
}

export default React.memo(HiddenBoardsRow)
