// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl'

import {PropertyType, PropertyTypeEnum, FilterValueType} from '../types'

import OrgDuty from './orgDuty'

// 직책. The third of the organisation property types, and the same shape as the
// other two — see orgDivision/property.tsx for why displayValue hands back IDs
// rather than names.
//
// filterValueType stays 'orgUnit' even though a duty is not an organisation
// unit: the key picks which filter UI to draw, and the duty filter draws the
// same search-and-checkboxes panel as 본부 and 부서 (research R3).
export default class OrgDutyProperty extends PropertyType {
    Editor = OrgDuty
    name = 'OrgDuty'
    type = 'orgDuty' as PropertyTypeEnum
    isMultiValue = true
    canFilter = true
    canGroup = true
    filterValueType = 'orgUnit' as FilterValueType
    displayName = (intl: IntlShape) => intl.formatMessage({id: 'PropertyType.OrgDuty', defaultMessage: 'Duty'})
}
