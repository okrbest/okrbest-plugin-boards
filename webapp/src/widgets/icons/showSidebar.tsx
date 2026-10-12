// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import CompassIcon from './compassIcon'

import './showSidebar.scss'

export default function ShowSidebarIcon(): React.JSX.Element {
    // 018: 채널 사이드바 토글과 같은 dock 글리프를 쓴다
    return (
        <CompassIcon
            icon='dock-left'
            className='ShowSidebarIcon Icon'
        />
    )
}
