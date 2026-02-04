// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {FC} from 'react'
import {useIntl} from 'react-intl'

import {getChannelsNameMapInTeam} from 'mattermost-redux/selectors/entities/channels'

import {Provider} from 'react-redux'

import {Block} from '../../blocks/block'
import mutator from '../../mutator'
import {Utils} from '../../utils'
import IconButton from '../../widgets/buttons/iconButton'
import DeleteIcon from '../../widgets/icons/delete'
import OptionsIcon from '../../widgets/icons/options'
import Menu from '../../widgets/menu'
import MenuWrapper from '../../widgets/menuWrapper'
import {getUser} from '../../store/users'
import {useAppSelector} from '../../store/hooks'
import Tooltip from '../../widgets/tooltip'
import GuestBadge from '../../widgets/guestBadge'
import {getClientConfig} from '../../store/clientConfig'
import {ClientConfig} from '../../config/clientConfig'

import './comment.scss'
import {formatText, messageHtmlToComponent} from '../../webapp_globals'
import {getCurrentTeam} from '../../store/teams'


type Props = {
    comment: Block
    userId: string
    userImageUrl: string
    readonly: boolean
    scheduledAt?: number
}

const Comment: FC<React.PropsWithChildren<Props>> = (props: Props) => {
    const {comment, userId, userImageUrl, scheduledAt} = props
    const intl = useIntl()
    const user = useAppSelector(getUser(userId))
    const clientConfig = useAppSelector<ClientConfig>(getClientConfig)
    const date = new Date(comment.createAt)
    const isScheduled = Boolean(scheduledAt)

    const selectedTeam = useAppSelector(getCurrentTeam)
    const channelNamesMap =  getChannelsNameMapInTeam((window as any).store.getState(), selectedTeam!.id)

    const formattedText = 
    <Provider store={(window as any).store}>
        {messageHtmlToComponent(formatText(comment.title, {
            atMentions: true,
            team: selectedTeam,
            channelNamesMap,
        }), {
            fetchMissingUsers: true, 
        })}
    </Provider>

    const formatScheduledTime = (timestamp: number): string => {
        const scheduledDate = new Date(timestamp)
        const now = new Date()
        const isToday = scheduledDate.toDateString() === now.toDateString()
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const isTomorrow = scheduledDate.toDateString() === tomorrow.toDateString()
        const timeStr = scheduledDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})

        if (isToday) {
            return intl.formatMessage({id: 'Comment.scheduledToday', defaultMessage: 'Scheduled for today at {time}'}, {time: timeStr})
        }
        if (isTomorrow) {
            return intl.formatMessage({id: 'Comment.scheduledTomorrow', defaultMessage: 'Scheduled for tomorrow at {time}'}, {time: timeStr})
        }
        const dateStr = scheduledDate.toLocaleDateString([], {month: 'short', day: 'numeric'})
        return intl.formatMessage({id: 'Comment.scheduledFor', defaultMessage: 'Scheduled for {date} at {time}'}, {date: dateStr, time: timeStr})
    }

    return (
        <div
            key={comment.id}
            className={`Comment comment${isScheduled ? ' Comment--scheduled' : ''}`}
        >
            <div className='comment-header'>
                <img
                    className='comment-avatar'
                    src={userImageUrl}
                />
                <div className='comment-username'>{user ? Utils.getUserDisplayName(user, clientConfig.teammateNameDisplay) : ''}</div>
                <GuestBadge show={user?.is_guest}/>

                {isScheduled ? (
                    <Tooltip title={scheduledAt ? Utils.displayDateTime(new Date(scheduledAt), intl) : ''}>
                        <div className='comment-date comment-scheduled-badge'>
                            <span className='comment-scheduled-icon'>🕐</span>
                            {scheduledAt && formatScheduledTime(scheduledAt)}
                        </div>
                    </Tooltip>
                ) : (
                    <Tooltip title={Utils.displayDateTime(date, intl)}>
                        <div className='comment-date'>
                            {Utils.relativeDisplayDateTime(date, intl)}
                        </div>
                    </Tooltip>
                )}

                {!props.readonly && (
                    <MenuWrapper>
                        <IconButton icon={<OptionsIcon/>}/>
                        <Menu position='left'>
                            <Menu.Text
                                icon={<DeleteIcon/>}
                                id='delete'
                                name={intl.formatMessage({id: 'Comment.delete', defaultMessage: 'Delete'})}
                                onClick={() => mutator.deleteBlock(comment)}
                            />
                        </Menu>
                    </MenuWrapper>
                )}
            </div>
            <div className='comment-markdown'>
                {formattedText}
            </div>
        </div>
    )
}

export default Comment
