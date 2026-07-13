// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import {useAppSelector} from '../../store/hooks'
import {getCurrentBoardId} from '../../store/boards'
import {getCurrentTeam} from '../../store/teams'
import {Permission} from '../../constants'
import {BoardCapability, useHasCapabilities, useHasPermissions} from '../../hooks/permissions'

type Props = {
    boardId?: string
    teamId?: string
    permissions?: Permission[]
    capabilities?: BoardCapability[]
    invert?: boolean
    children: React.ReactNode
}

const BoardPermissionGate = React.memo((props: Props): React.ReactElement|null => {
    const currentTeam = useAppSelector(getCurrentTeam)
    const currentBoardId = useAppSelector(getCurrentBoardId)

    const boardId = props.boardId || currentBoardId || ''
    const teamId = props.teamId || currentTeam?.id || ''
    const requestedCapabilities = props.capabilities || []
    const requestedPermissions = props.permissions || []

    const allowedByCapabilities = useHasCapabilities(boardId, requestedCapabilities)
    const allowedByPermissions = useHasPermissions(teamId, boardId, requestedPermissions)

    let allowed = false
    if (requestedCapabilities.length > 0) {
        allowed = allowedByCapabilities
    } else if (requestedPermissions.length > 0) {
        allowed = allowedByPermissions
    }

    if (props.invert) {
        allowed = !allowed
    }

    if (allowed) {
        return (<>{props.children}</>)
    }
    return null
})

BoardPermissionGate.displayName = 'BoardPermissionGate'

export default BoardPermissionGate
