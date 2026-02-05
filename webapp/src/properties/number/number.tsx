// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import {PropertyProps} from '../types'
import BaseTextEditor from '../baseTextEditor'

const Number = (props: PropertyProps): React.JSX.Element => {
    return (
        <BaseTextEditor
            {...props}
            validator={(value: string) => {
                // 빈 값은 허용 (필수 여부는 required 속성으로 처리)
                if (!value || value.trim() === '') {
                    return true
                }
                return !isNaN(parseInt(value, 10))
            }}
        />
    )
}
export default Number
