// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import {PropertyProps} from '../types'
import BaseTextEditor from '../baseTextEditor'

const Email = (props: PropertyProps): React.JSX.Element => {
    return (
        <BaseTextEditor
            {...props}
            validator={(value: string) => {
                // 빈 값은 허용 (삭제 가능, required 체크는 별도로 처리)
                if (!value || value.trim() === '') {
                    return true
                }
                // 값이 있으면 유효한 이메일 형식이어야 함
                const emailRegexp = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
                return emailRegexp.test(value)
            }}
        />
    )
}
export default Email
