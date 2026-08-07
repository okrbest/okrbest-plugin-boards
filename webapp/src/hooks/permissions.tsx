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
    // Property edits are edit-level, not manage-level.
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

// useHasCardCapabilities is useHasPermissions narrowed to one card.
//
// Card access rules can grant less than the board role does — a member who is a
// board editor may only be allowed to comment on a given card — and the screen
// used to know nothing about it, so it offered edits the server then refused.
//
// A board with no active rules sends no card entries, and a card that carries no
// entry falls back to the board wide answer. That fallback is what keeps every
// board without rules behaving exactly as before.
export const useHasCardPermissions = (teamId: string, boardId: string, cardId: string, permissions: Permission[]): boolean => {
    const boardPermissionsSelector = useMemo(() => getBoardPermissions(boardId), [boardId])
    const cardCapabilities = useAppSelector(boardPermissionsSelector)?.cardPermissions?.[cardId]
    const boardAnswer = useHasPermissions(teamId, boardId, permissions)

    if (!cardId || !cardCapabilities) {
        return boardAnswer
    }

    // The rules never grant more than the board role allows, so both have to
    // agree: the card entry narrows, it does not promote.
    return boardAnswer && permissions.some((permission) => {
        const capability = permissionToCapability[permission]
        return Boolean(capability) && Boolean(cardCapabilities[capability])
    })
}

export const useHasCurrentTeamCardPermissions = (boardId: string, cardId: string, permissions: Permission[]): boolean => {
    const currentTeam = useAppSelector(getCurrentTeam)
    return useHasCardPermissions(currentTeam?.id || '', boardId, cardId, permissions)
}

export const useHasCurrentBoardCardPermissions = (cardId: string, permissions: Permission[]): boolean => {
    const currentBoardId = useAppSelector(getCurrentBoardId)

    return useHasCurrentTeamCardPermissions(currentBoardId || '', cardId, permissions)
}

export const useHasCapabilities = (boardId: string, capabilities: BoardCapability[]): boolean => {
    const boardPermissionsSelector = useMemo(() => getBoardPermissions(boardId), [boardId])
    const boardCapabilities = useAppSelector(boardPermissionsSelector)?.capabilities
    if (!boardId || capabilities.length === 0 || !boardCapabilities) {
        return false
    }

    return capabilities.some((capability) => Boolean(boardCapabilities[capability]))
}

// useHasCardCapabilities is useHasCapabilities narrowed to one card.
//
// Every screen that offers an edit has to ask this rather than the board wide
// version. A board editor may hold only commenting on a given card, and asking
// the board gets the answer "yes" for a field the server will refuse to save.
//
// A card with no entry — no rules on the board, or a card the map does not
// mention — falls back to the board wide answer, which is what keeps boards
// without rules behaving exactly as before.
export const useHasCardCapabilities = (boardId: string, cardId: string, capabilities: BoardCapability[]): boolean => {
    const boardPermissionsSelector = useMemo(() => getBoardPermissions(boardId), [boardId])
    const permissions = useAppSelector(boardPermissionsSelector)
    const cardCapabilities = cardId ? permissions?.cardPermissions?.[cardId] : undefined
    const source = cardCapabilities || permissions?.capabilities

    if (!boardId || capabilities.length === 0 || !source) {
        return false
    }

    return capabilities.some((capability) => Boolean(source[capability]))
}

export const useHasCurrentTeamPermissions = (boardId: string, permissions: Permission[]): boolean => {
    const currentTeam = useAppSelector(getCurrentTeam)
    return useHasPermissions(currentTeam?.id || '', boardId, permissions)
}

export const useHasCurrentBoardPermissions = (permissions: Permission[]): boolean => {
    const currentBoardId = useAppSelector(getCurrentBoardId)

    return useHasCurrentTeamPermissions(currentBoardId || '', permissions)
}
