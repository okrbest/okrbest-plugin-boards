// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React, {useState, useEffect} from 'react'
import {useIntl} from 'react-intl'

import MenuWrapper from '../../widgets/menuWrapper'
import Menu from '../../widgets/menu'

import {Board, createBoard, MemberRole} from '../../blocks/board'
import {useAppSelector} from '../../store/hooks'
import {getCurrentBoard} from '../../store/boards'
import {getBoardUsers} from '../../store/users'
import {Channel} from '../../store/channels'
import {Utils} from '../../utils'
import mutator from '../../mutator'
import octoClient from '../../octoClient'
import {Permission} from '../../constants'

import PrivateIcon from '../../widgets/icons/lockOutline'
import PublicIcon from '../../widgets/icons/globe'
import DeleteIcon from '../../widgets/icons/delete'
import CheckIcon from '../../widgets/icons/check'
import CompassIcon from '../../widgets/icons/compassIcon'
import ConfirmationDialogBox from '../confirmationDialogBox'

import BoardPermissionGate from '../permissions/boardPermissionGate'

type Props = {
    teammateNameDisplay?: string
}

async function updateChannelMinimumRole(board: Board, newMinimumRole: MemberRole) {
    if (board.minimumRole === newMinimumRole) {
        return
    }

    const newBoard = createBoard(board)
    newBoard.minimumRole = newMinimumRole

    await mutator.updateBoard(newBoard, board, 'update channel minimum role')
}

const ChannelPermissionsRow = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const board = useAppSelector(getCurrentBoard)
    const users = useAppSelector(getBoardUsers)
    const [linkedChannel, setLinkedChannel] = useState<Channel|null>(null)
    const [showUnlinkChannelConfirmation, setShowUnlinkChannelConfirmation] = useState<boolean>(false)

    const onUnlinkBoard = async () => {
        const newBoard = createBoard(board)
        newBoard.channelId = ''
        mutator.updateBoard(newBoard, board, 'unlinked channel')
        setShowUnlinkChannelConfirmation(false)
    }

    let currentRoleName = intl.formatMessage({id: 'BoardMember.schemeEditor', defaultMessage: 'Editor'})
    if (board.minimumRole === MemberRole.Commenter) {
        currentRoleName = intl.formatMessage({id: 'BoardMember.schemeCommenter', defaultMessage: 'Commenter'})
    } else if (board.minimumRole === MemberRole.Viewer) {
        currentRoleName = intl.formatMessage({id: 'BoardMember.schemeViewer', defaultMessage: 'Viewer'})
    }

    useEffect(() => {
        if (!Utils.isFocalboardPlugin() || !board.channelId) {
            setLinkedChannel(null)
            return
        }
        const unknownChannel = {
            id: board.channelId,
            type: 'P',
            name: 'unknown',
            display_name: intl.formatMessage({
                id: 'shareBoard.unknown-channel-display-name',
                defaultMessage: 'Unknown channel',
            }),
        } as Channel
        octoClient.getChannel(board.teamId, board.channelId).then((c) => setLinkedChannel(c || unknownChannel))
    }, [board.channelId])

    if (!linkedChannel) {
        return <></>
    }

    const confirmationDialog = (
        <ConfirmationDialogBox
            dialogBox={{
                heading: intl.formatMessage({
                    id: 'shareBoard.confirm-unlink.title',
                    defaultMessage: 'Unlink channel from board',
                }),
                subText: intl.formatMessage({
                    id: 'shareBoard.confirm-unlink.body',
                    defaultMessage: 'When you unlink a channel from a board, all members of the channel (existing and new) will lose access to it unless they\'re given permission separately.',
                }),
                confirmButtonText: intl.formatMessage({
                    id: 'shareBoard.confirm-unlink.confirmBtnText',
                    defaultMessage: 'Unlink channel',
                }),
                onConfirm: onUnlinkBoard,
                onClose: () => setShowUnlinkChannelConfirmation(false),
            }}
        />
    )

    const getDMName = () => {
        const userIds = linkedChannel.name.split('__')
        if (userIds.length !== 2) {
            Utils.logError('Invalid DM channel name, unable to get user ids')
        }
        let result = Utils.getUserDisplayName(users[userIds[0]], props.teammateNameDisplay || '')
        result += ', '
        result += Utils.getUserDisplayName(users[userIds[1]], props.teammateNameDisplay || '')
        return result
    }

    return (
        <div className='user-item channel-item'>
            {showUnlinkChannelConfirmation && confirmationDialog}
            <div className='user-item__content'>
                <span className='user-item__img'>
                    {linkedChannel.type === 'P' && <PrivateIcon/>}
                    {linkedChannel.type === 'O' && <PublicIcon/>}
                    {linkedChannel.type === 'D' && <PrivateIcon/>}
                    {linkedChannel.type === 'G' && <PrivateIcon/>}
                </span>
                {linkedChannel.type === 'D' && (
                    <div className='ml-3'>
                        <strong>
                            {getDMName()}
                        </strong>
                    </div>
                )}
                {linkedChannel.type !== 'D' && <div className='ml-3'><strong>{linkedChannel.display_name}</strong></div>}
            </div>
            <div>
                <BoardPermissionGate permissions={[Permission.ManageBoardType]}>
                    <MenuWrapper>
                        <button className='user-item__button'>
                            {currentRoleName}
                            <CompassIcon
                                icon='chevron-down'
                                className='CompassIcon'
                            />
                        </button>
                        <Menu position='left'>
                            <Menu.Text
                                id={MemberRole.Editor}
                                check={true}
                                icon={board.minimumRole === undefined || board.minimumRole === MemberRole.None || board.minimumRole === MemberRole.Editor ? <CheckIcon/> : <div className='empty-icon'/>}
                                name={intl.formatMessage({id: 'BoardMember.schemeEditor', defaultMessage: 'Editor'})}
                                onClick={() => updateChannelMinimumRole(board, MemberRole.Editor)}
                            />
                            <Menu.Text
                                id={MemberRole.Commenter}
                                check={true}
                                icon={board.minimumRole === MemberRole.Commenter ? <CheckIcon/> : <div className='empty-icon'/>}
                                name={intl.formatMessage({id: 'BoardMember.schemeCommenter', defaultMessage: 'Commenter'})}
                                onClick={() => updateChannelMinimumRole(board, MemberRole.Commenter)}
                            />
                            <Menu.Text
                                id={MemberRole.Viewer}
                                check={true}
                                icon={board.minimumRole === MemberRole.Viewer ? <CheckIcon/> : <div className='empty-icon'/>}
                                name={intl.formatMessage({id: 'BoardMember.schemeViewer', defaultMessage: 'Viewer'})}
                                onClick={() => updateChannelMinimumRole(board, MemberRole.Viewer)}
                            />
                            <Menu.Separator/>
                            <Menu.Text
                                id='Unlink'
                                icon={<DeleteIcon/>}
                                name={intl.formatMessage({id: 'BoardMember.unlinkChannel', defaultMessage: 'Unlink'})}
                                onClick={() => setShowUnlinkChannelConfirmation(true)}
                            />
                        </Menu>
                    </MenuWrapper>
                </BoardPermissionGate>
                <BoardPermissionGate
                    permissions={[Permission.ManageBoardType]}
                    invert={true}
                >
                    {currentRoleName}
                </BoardPermissionGate>
            </div>
        </div>
    )
}

export default ChannelPermissionsRow
