// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

export default function ZoomOutIcon(): React.JSX.Element {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
        >
            <circle
                cx='11'
                cy='11'
                r='8'
            />
            <path d='M21 21l-4.35-4.35'/>
            <line
                x1='8'
                y1='11'
                x2='14'
                y2='11'
            />
        </svg>
    )
}

