// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'
import {useIntl} from 'react-intl'

import {CommentBlock, getScheduledAt} from '../../blocks/commentBlock'
import {Utils} from '../../utils'
import {useAppSelector} from '../../store/hooks'
import {getUser} from '../../store/users'
import {getClientConfig} from '../../store/clientConfig'
import {ClientConfig} from '../../config/clientConfig'
import Button from '../../widgets/buttons/button'
import IconButton from '../../widgets/buttons/iconButton'
import CloseIcon from '../../widgets/icons/close'
import Tooltip from '../../widgets/tooltip'
import mutator from '../../mutator'

import './scheduledComment.scss'

type Props = {
    comment: CommentBlock
    boardId: string
    readonly: boolean
}

const ScheduledComment: React.FC<React.PropsWithChildren<Props>> = ({comment, boardId, readonly}) => {
    const intl = useIntl()
    const user = useAppSelector(getUser(comment.createdBy))
    const clientConfig = useAppSelector<ClientConfig>(getClientConfig)

    const scheduledAt = getScheduledAt(comment)
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null

    const handleCancel = useCallback(async () => {
        await mutator.cancelScheduledComment(boardId, comment.id)
    }, [boardId, comment.id])

    const handleSendNow = useCallback(async () => {
        await mutator.sendScheduledCommentNow(boardId, comment.id)
    }, [boardId, comment.id])

    const formatScheduledTime = () => {
        if (!scheduledDate) {
            return ''
        }

        const now = new Date()
        const isToday = scheduledDate.toDateString() === now.toDateString()

        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const isTomorrow = scheduledDate.toDateString() === tomorrow.toDateString()

        const timeStr = scheduledDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})

        if (isToday) {
            return intl.formatMessage(
                {id: 'ScheduledComment.todayAt', defaultMessage: 'Today at {time}'},
                {time: timeStr},
            )
        }

        if (isTomorrow) {
            return intl.formatMessage(
                {id: 'ScheduledComment.tomorrowAt', defaultMessage: 'Tomorrow at {time}'},
                {time: timeStr},
            )
        }

        const dateStr = scheduledDate.toLocaleDateString([], {month: 'short', day: 'numeric'})
        return intl.formatMessage(
            {id: 'ScheduledComment.scheduledFor', defaultMessage: '{date} at {time}'},
            {date: dateStr, time: timeStr},
        )
    }

    return (
        <div className='ScheduledComment'>
            <div className='ScheduledComment__header'>
                <img
                    className='ScheduledComment__avatar'
                    src={Utils.getProfilePicture(comment.createdBy)}
                    alt=''
                />
                <div className='ScheduledComment__info'>
                    <span className='ScheduledComment__username'>
                        {user ? Utils.getUserDisplayName(user, clientConfig.teammateNameDisplay) : ''}
                    </span>
                    <Tooltip title={scheduledDate ? Utils.displayDateTime(scheduledDate, intl) : ''}>
                        <span className='ScheduledComment__scheduled'>
                            <span className='ScheduledComment__clock-icon'>🕐</span>
                            {formatScheduledTime()}
                        </span>
                    </Tooltip>
                </div>
                {!readonly && (
                    <IconButton
                        className='ScheduledComment__close'
                        icon={<CloseIcon/>}
                        onClick={handleCancel}
                        title={intl.formatMessage({
                            id: 'ScheduledComment.cancel',
                            defaultMessage: 'Cancel scheduled comment',
                        })}
                    />
                )}
            </div>

            <div className='ScheduledComment__content'>
                {comment.title}
            </div>

            {!readonly && (
                <div className='ScheduledComment__actions'>
                    <Button
                        size='small'
                        onClick={handleCancel}
                    >
                        {intl.formatMessage({
                            id: 'ScheduledComment.cancelButton',
                            defaultMessage: 'Cancel',
                        })}
                    </Button>
                    <Button
                        size='small'
                        filled={true}
                        onClick={handleSendNow}
                    >
                        {intl.formatMessage({
                            id: 'ScheduledComment.sendNow',
                            defaultMessage: 'Send now',
                        })}
                    </Button>
                </div>
            )}
        </div>
    )
}

export default React.memo(ScheduledComment)
