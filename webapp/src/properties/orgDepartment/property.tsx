// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl'

import {PropertyType, PropertyTypeEnum, FilterValueType} from '../types'

import OrgDepartment from './orgDepartment'

// 부서. Same shape as 본부 — see orgDivision/property.tsx for why displayValue
// hands back IDs rather than names.
export default class OrgDepartmentProperty extends PropertyType {
    Editor = OrgDepartment
    name = 'OrgDepartment'
    type = 'orgDepartment' as PropertyTypeEnum
    isMultiValue = true
    canFilter = true
    canGroup = true
    filterValueType = 'orgUnit' as FilterValueType
    displayName = (intl: IntlShape) => intl.formatMessage({id: 'PropertyType.OrgDepartment', defaultMessage: 'Department'})
}
