// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react'

import {useAppSelector} from '../../store/hooks'
import {getOrgUnits} from '../../store/orgMaster'
import {selectedUnitIds, allowedDepartments} from '../../store/orgScope'
import OrgUnitEditor from '../orgUnitEditor'
import {PropertyProps} from '../types'

// 부서. The list is narrowed by whatever 본부 the card already names, unioned
// across every value and every 본부 property on the board (FR-007, FR-009,
// FR-010). A card that names no 본부 sees every active 부서 (FR-008).
//
// Values already on the card survive the narrowing — OrgUnitEditor adds them
// back (FR-015).
const OrgDepartmentProperty = (props: PropertyProps): React.JSX.Element => {
    const {board, card} = props
    const allUnits = useAppSelector(getOrgUnits(board.teamId))

    const departments = useMemo(
        () => allowedDepartments(selectedUnitIds(card, board, 'orgDivision'), allUnits),
        [card, board, allUnits],
    )

    return (
        <OrgUnitEditor
            {...props}
            options={departments}
            allUnits={allUnits}
        />
    )
}

export default OrgDepartmentProperty
