// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import {PropertyProps} from '../types'
import BaseTextEditor from '../baseTextEditor'

const Text = (props: PropertyProps): React.JSX.Element => {
    return (
        <BaseTextEditor
            {...props}
            validator={(_value: string) => true}
            spellCheck={true}
        />
    )
}
export default Text
