// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {useAppSelector} from '../../store/hooks'
import {getDuties} from '../../store/orgMaster'
import OrgUnitEditor from '../orgUnitEditor'
import {PropertyProps} from '../types'

// 직책. Every active duty of the team is offered.
//
// Unlike 부서, nothing narrows this list: a duty hangs off no organisation unit,
// so the 본부 and 부서 a card names have no bearing on which duties fit (FR-003).
// The absence of narrowing here is the decision, not an omission (research R5).
//
// The order is the server's — by rank, then name. Sorting again here would put a
// second definition of "which duty comes first" in the code (research R4).
const OrgDutyProperty = (props: PropertyProps): React.JSX.Element => {
    const duties = useAppSelector(getDuties(props.board.teamId))

    return (
        <OrgUnitEditor
            {...props}
            options={duties}
            allUnits={duties}
        />
    )
}

export default OrgDutyProperty
