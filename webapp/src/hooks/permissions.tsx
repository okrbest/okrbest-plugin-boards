// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import {useAppSelector} from '../store/hooks'
import {getMyBoardMembership, getCurrentBoardId, getBoard} from '../store/boards'
import {getCurrentTeam} from '../store/teams'
import {Permission} from '../constants'
import {MemberRole} from '../blocks/board'
import {getBoardPermissions} from '../store/boardPermissions'

export type BoardCapability = 'canView' | 'canCreateCard' | 'canEditCard' | 'canDeleteCard' | 'canManageBoard'

const permissionToCapability: Record<Permission, keyof NonNullable<ReturnType<typeof getPermissionsCapabilities>>> = {
    [Permission.ViewBoard]: 'canView',
    [Permission.CommentBoardCards]: 'canEditCard',
    [Permission.ManageBoardCards]: 'canEditCard',
    [Permission.ManageBoardProperties]: 'canManageBoard',
    [Permission.ManageBoardRoles]: 'canManageBoard',
    [Permission.ManageBoardType]: 'canManageBoard',
    [Permission.ShareBoard]: 'canManageBoard',
    [Permission.DeleteBoard]: 'canDeleteCard',
    [Permission.DeleteOthersComments]: 'canManageBoard',
    [Permission.ChannelCreatePost]: 'canManageBoard',
}

export const useHasPermissions = (teamId: string, boardId: string, permissions: Permission[]): boolean => {
    if (!boardId || !teamId) {
        return false
    }

    const capabilities = useAppSelector(getBoardPermissions(boardId))?.capabilities
    if (capabilities) {
        return permissions.some((permission) => {
            const capability = permissionToCapability[permission]
            if (!capability) {
                return false
            }
            return Boolean(capabilities[capability])
        })
    }

    const member = useAppSelector(getMyBoardMembership(boardId))
    const board = useAppSelector(getBoard(boardId))

    if (!board) {
        return false
    }

    if (!member) {
        return false
    }

    const adminPermissions = [Permission.ManageBoardType, Permission.DeleteBoard, Permission.ShareBoard, Permission.ManageBoardRoles, Permission.DeleteOthersComments]
    const editorPermissions = [Permission.ManageBoardCards, Permission.ManageBoardProperties]
    const commenterPermissions = [Permission.CommentBoardCards]
    const viewerPermissions = [Permission.ViewBoard]

    for (const permission of permissions) {
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
    if (!boardId) {
        return false
    }

    const boardCapabilities = useAppSelector(getBoardPermissions(boardId))?.capabilities
    if (!boardCapabilities) {
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
