// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {BoardView} from '../blocks/boardView'
import {Permission} from '../constants'
import {useAppSelector} from '../store/hooks'
import {getMe} from '../store/users'
import {ViewAccessMode, accessModeTargets, viewAccessMode, viewConfigLocked} from '../viewAccess'

import {useHasCurrentBoardPermissions} from './permissions'

export type ViewAccess = {
    mode: ViewAccessMode
    isAdmin: boolean
    isCreator: boolean

    // The view is admin-only and this person is not an admin: configuration
    // menus are disabled and the tab menu loses rename and delete.
    locked: boolean

    // The modes this person may pick, the current one included so the menu can
    // mark it. Empty when they may not touch the view's mode at all.
    targets: ViewAccessMode[]

    // There is something other than the current mode to pick.
    canChange: boolean
}

// useViewAccess binds the pure rules in viewAccess.ts to the current user and
// their board permission. Every surface that reacts to a view's mode — the
// access menu, the header, the tab menu, the default template item, the kanban
// column header — reads this one answer.
//
// "Admin" is the board permission that also guards membership and the property
// editor lock (ManageBoardRoles), asked through the permission hook that falls
// back to the membership row when capabilities have not arrived yet.
export const useViewAccess = (view: BoardView | undefined, sharedViewCount: number): ViewAccess => {
    const me = useAppSelector(getMe)
    const isAdmin = useHasCurrentBoardPermissions([Permission.ManageBoardRoles])

    const mode: ViewAccessMode = view ? viewAccessMode(view) : 'everyone'
    const isCreator = Boolean(view && me && view.createdBy === me.id)
    const locked = viewConfigLocked({mode, isAdmin})
    const targets = view ? accessModeTargets({mode, isAdmin, isCreator, isLastShared: sharedViewCount <= 1}) : []
    const canChange = targets.some((target) => target !== mode)

    return {mode, isAdmin, isCreator, locked, targets, canChange}
}
