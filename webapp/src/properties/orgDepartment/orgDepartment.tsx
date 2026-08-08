// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {useAppSelector} from '../../store/hooks'
import {getDepartments, getOrgUnits} from '../../store/orgMaster'
import OrgUnitEditor from '../orgUnitEditor'
import {PropertyProps} from '../types'

// 부서. Offers every active department for now; US2 narrows the list to the
// divisions the card already names.
const OrgDepartmentProperty = (props: PropertyProps): React.JSX.Element => {
    const departments = useAppSelector(getDepartments(props.board.teamId, ''))
    const allUnits = useAppSelector(getOrgUnits(props.board.teamId))

    return (
        <OrgUnitEditor
            {...props}
            options={departments}
            allUnits={allUnits}
        />
    )
}

export default OrgDepartmentProperty
