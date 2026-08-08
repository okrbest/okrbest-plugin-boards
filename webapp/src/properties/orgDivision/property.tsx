// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl'

import {PropertyType, PropertyTypeEnum, FilterValueType} from '../types'

import OrgDivision from './orgDivision'

// 본부. Multi valued from the start, so there is no single valued sibling and
// no "multi" prefix to tell them apart.
//
// displayValue returns the stored IDs rather than names: it is a pure function
// with no access to the organisation master. Screens resolve names through the
// editor, and CSV export through the dedicated branch in csvExporter.
export default class OrgDivisionProperty extends PropertyType {
    Editor = OrgDivision
    name = 'OrgDivision'
    type = 'orgDivision' as PropertyTypeEnum
    isMultiValue = true
    canFilter = true
    canGroup = true
    filterValueType = 'orgUnit' as FilterValueType
    displayName = (intl: IntlShape) => intl.formatMessage({id: 'PropertyType.OrgDivision', defaultMessage: 'Division'})
}
