// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {useAppSelector} from '../../store/hooks'
import {getDivisions, getOrgUnits} from '../../store/orgMaster'
import OrgUnitEditor from '../orgUnitEditor'
import {PropertyProps} from '../types'

// 본부. Every active division of the team is offered — nothing narrows a
// division, it is the top of the two level chart.
const OrgDivisionProperty = (props: PropertyProps): React.JSX.Element => {
    const divisions = useAppSelector(getDivisions(props.board.teamId))
    const allUnits = useAppSelector(getOrgUnits(props.board.teamId))

    return (
        <OrgUnitEditor
            {...props}
            options={divisions}
            allUnits={allUnits}
        />
    )
}

export default OrgDivisionProperty
