// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import './topBar.scss'
// import {FormattedMessage} from 'react-intl' // 미사용

// import HelpIcon from '../widgets/icons/help' // 미사용
import {Utils} from '../utils'
// import {Constants} from '../constants' // 미사용

const TopBar = (): JSX.Element => {
    if (Utils.isFocalboardPlugin()) {
        // const feedbackUrl = 'https://www.focalboard.com/fwlink/feedback-boards.html?v=' + Constants.versionString // 미사용
        return (
            <div
                className='TopBar'
            >
                {/* <a
                    className='link'
                    href={feedbackUrl}
                    target='_blank'
                    rel='noreferrer'
                >
                    <FormattedMessage
                        id='TopBar.give-feedback'
                        defaultMessage='Give feedback'
                    />
                </a>
                <div className='versionFrame'>
                    <div
                        className='version'
                        title={`v${Constants.versionString}`}
                    >
                        {`v${Constants.versionString}`}
                    </div>
                </div> */}
            </div>
        )
    }

    // const focalboardFeedbackUrl = 'https://www.focalboard.com/fwlink/feedback-focalboard.html?v=' + Constants.versionString // 미사용
    return (
        <div
            className='TopBar'
        >
            {/* <a
                className='link'
                href={focalboardFeedbackUrl}
                target='_blank'
                rel='noreferrer'
            >
                <FormattedMessage
                    id='TopBar.give-feedback'
                    defaultMessage='Give feedback'
                />
            </a>
            <a
                href='https://www.focalboard.com/guide/user?utm_source=webapp'
                target='_blank'
                rel='noreferrer'
            >
                <HelpIcon/>
            </a> */}
        </div>
    )
}

export default React.memo(TopBar)
