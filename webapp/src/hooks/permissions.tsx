// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useMemo} from 'react'

import {useAppSelector} from '../store/hooks'
import {getMyBoardMembership, getCurrentBoardId, getBoard} from '../store/boards'
import {getCurrentTeam} from '../store/teams'
import {Permission} from '../constants'
import {MemberRole} from '../blocks/board'
import {getBoardPermissions} from '../store/boardPermissions'

export type BoardCapability = 'canView' | 'canCommentCard' | 'canCreateCard' | 'canEditCard' | 'canDeleteCard' | 'canManageBoard' | 'canDeleteBoard'

const permissionToCapability: Record<Permission, BoardCapability> = {
    [Permission.ViewBoard]: 'canView',
    [Permission.CommentBoardCards]: 'canCommentCard',
    [Permission.ManageBoardCards]: 'canEditCard',
    // Property edits are edit-level (not manage-level) in ACL model.
    [Permission.ManageBoardProperties]: 'canEditCard',
    [Permission.ManageBoardRoles]: 'canManageBoard',
    [Permission.ManageBoardType]: 'canManageBoard',
    [Permission.ShareBoard]: 'canManageBoard',
    [Permission.DeleteBoard]: 'canDeleteBoard',
    [Permission.DeleteOthersComments]: 'canManageBoard',
    [Permission.ChannelCreatePost]: 'canManageBoard',
}

export const useHasPermissions = (teamId: string, boardId: string, permissions: Permission[]): boolean => {
    const boardPermissionsSelector = useMemo(() => getBoardPermissions(boardId), [boardId])
    const myBoardMembershipSelector = useMemo(() => getMyBoardMembership(boardId), [boardId])
    const boardSelector = useMemo(() => getBoard(boardId), [boardId])

    const capabilities = useAppSelector(boardPermissionsSelector)?.capabilities
    const member = useAppSelector(myBoardMembershipSelector)
    const board = useAppSelector(boardSelector)

    if (!boardId || !teamId || permissions.length === 0) {
        return false
    }

    if (capabilities) {
        return permissions.some((permission) => {
            const capability = permissionToCapability[permission]
            if (!capability) {
                return false
            }
            return Boolean(capabilities[capability])
        })
    }

    if (!board) {
        return false
    }

    if (!member) {
        return false
    }

    const adminPermissions = [Permission.ManageBoardType, Permission.ShareBoard, Permission.ManageBoardRoles, Permission.DeleteOthersComments]
    const editorPermissions = [Permission.ManageBoardCards, Permission.ManageBoardProperties]
    const commenterPermissions = [Permission.CommentBoardCards]
    const viewerPermissions = [Permission.ViewBoard]

    for (const permission of permissions) {
        if (permission === Permission.DeleteBoard) {
            const ownerUserId = typeof board.properties?.board_owner_user_id === 'string' && board.properties.board_owner_user_id ?
                board.properties.board_owner_user_id :
                board.createdBy
            if (member.userId === ownerUserId) {
                return true
            }
            continue
        }
        if (adminPermissions.includes(permission) && member.schemeAdmin) {
            return true
        }
        if (editorPermissions.includes(permission) && (member.schemeAdmin || member.schemeEditor || board.minimumRole === MemberRole.Editor)) {
            return true
        }
        if (commenterPermissions.includes(permission) && (member.schemeAdmin || member.schemeEditor || member.schemeCommenter || board.minimumRole === MemberRole.Commenter || board.minimumRole === MemberRole.Editor)) {
            return true
        }
        if (viewerPermissions.includes(permission) && (member.schemeAdmin || member.schemeEditor || member.schemeCommenter || member.schemeViewer || board.minimumRole === MemberRole.Viewer || board.minimumRole === MemberRole.Commenter || board.minimumRole === MemberRole.Editor)) {
            return true
        }
    }
    return false
}

export const useHasCapabilities = (boardId: string, capabilities: BoardCapability[]): boolean => {
    const boardPermissionsSelector = useMemo(() => getBoardPermissions(boardId), [boardId])
    const boardCapabilities = useAppSelector(boardPermissionsSelector)?.capabilities
    if (!boardId || capabilities.length === 0 || !boardCapabilities) {
        return false
    }

    return capabilities.some((capability) => Boolean(boardCapabilities[capability]))
}

export const useHasCurrentTeamPermissions = (boardId: string, permissions: Permission[]): boolean => {
    const currentTeam = useAppSelector(getCurrentTeam)
    return useHasPermissions(currentTeam?.id || '', boardId, permissions)
}

export const useHasCurrentBoardPermissions = (permissions: Permission[]): boolean => {
    const currentBoardId = useAppSelector(getCurrentBoardId)

    return useHasCurrentTeamPermissions(currentBoardId || '', permissions)
}
