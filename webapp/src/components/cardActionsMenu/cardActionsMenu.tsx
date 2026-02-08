// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React, {ReactNode} from 'react'
import {useIntl} from 'react-intl'

import DeleteIcon from '../../widgets/icons/delete'
import Menu from '../../widgets/menu'
import BoardPermissionGate from '../permissions/boardPermissionGate'
import DuplicateIcon from '../../widgets/icons/duplicate'
import LinkIcon from '../../widgets/icons/Link'
import MessageIcon from '../../widgets/icons/message'
import {Utils} from '../../utils'
import {Permission} from '../../constants'
import {sendFlashMessage} from '../flashMessages'
import {IUser} from '../../user'
import {getMe} from '../../store/users'
import {useAppSelector} from '../../store/hooks'
import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'
import octoClient from '../../octoClient'

type Props = {
    cardId: string
    boardId: string
    onClickDelete: () => void
    onClickDuplicate?: () => void
    children?: ReactNode
}

export const CardActionsMenu = (props: Props): React.JSX.Element => {
    const {cardId} = props

    const me = useAppSelector<IUser|null>(getMe)
    const intl = useIntl()

    const handleDeleteCard = () => {
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DeleteCard, {board: props.boardId, card: props.cardId})
        props.onClickDelete()
    }

    const handleDuplicateCard = () => {
        if (props.onClickDuplicate) {
            TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DuplicateCard, {board: props.boardId, card: props.cardId})
            props.onClickDuplicate()
        }
    }

    const handleSendNotification = async () => {
        try {
            const response = await octoClient.sendBoardNotification(props.boardId, props.cardId)
            if (response.ok) {
                sendFlashMessage({content: intl.formatMessage({id: 'CardActionsMenu.notification-sent', defaultMessage: 'Notification sent!'}), severity: 'high'})
            } else {
                sendFlashMessage({content: intl.formatMessage({id: 'CardActionsMenu.notification-failed', defaultMessage: 'Failed to send notification'}), severity: 'high'})
            }
        } catch (error) {
            sendFlashMessage({content: intl.formatMessage({id: 'CardActionsMenu.notification-failed', defaultMessage: 'Failed to send notification'}), severity: 'high'})
        }
    }

    return (
        <Menu position='left'>
            <BoardPermissionGate permissions={[Permission.ManageBoardCards]}>
                <Menu.Text
                    icon={<DeleteIcon/>}
                    id='delete'
                    name={intl.formatMessage({id: 'CardActionsMenu.delete', defaultMessage: 'Delete'})}
                    onClick={handleDeleteCard}
                />
                {props.onClickDuplicate &&
                <Menu.Text
                    icon={<DuplicateIcon/>}
                    id='duplicate'
                    name={intl.formatMessage({id: 'CardActionsMenu.duplicate', defaultMessage: 'Duplicate'})}
                    onClick={handleDuplicateCard}
                />}
            </BoardPermissionGate>
            {me?.id !== 'single-user' &&
                <Menu.Text
                    icon={<LinkIcon/>}
                    id='copy'
                    name={intl.formatMessage({id: 'CardActionsMenu.copyLink', defaultMessage: 'Copy link'})}
                    onClick={() => {
                        let cardLink = window.location.href

                        if (!cardLink.includes(cardId)) {
                            cardLink += `/${cardId}`
                        }

                        Utils.copyTextToClipboard(cardLink)
                        sendFlashMessage({content: intl.formatMessage({id: 'CardActionsMenu.copiedLink', defaultMessage: 'Copied!'}), severity: 'high'})
                    }}
                />
            }
            <BoardPermissionGate permissions={[Permission.ManageBoardCards]}>
                <Menu.Text
                    icon={<MessageIcon/>}
                    id='sendNotification'
                    name={intl.formatMessage({id: 'CardActionsMenu.sendNotification', defaultMessage: 'Send notification to channel'})}
                    onClick={handleSendNotification}
                />
            </BoardPermissionGate>
            {props.children}
        </Menu>
    )
}

export default CardActionsMenu
