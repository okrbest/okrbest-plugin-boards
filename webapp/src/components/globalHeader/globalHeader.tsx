// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {IntlProvider} from 'react-intl'

import store from '../../store'
import {useAppSelector} from '../../store/hooks'
import {getLanguage} from '../../store/language'
import {getMessages} from '../../i18n'

import GlobalHeaderSettingsMenu from './globalHeaderSettingsMenu'

import './globalHeader.scss'

const HeaderItems = () => {
    const language = useAppSelector<string>(getLanguage)

    return (
        <IntlProvider
            locale={language.split(/[_]/)[0]}
            messages={getMessages(language)}
        >
            <div className='GlobalHeaderComponent'>
                <span className='spacer'/>
                <GlobalHeaderSettingsMenu/>
            </div>
        </IntlProvider>
    )
}

const GlobalHeader = (): JSX.Element => {
    return (
        <ReduxProvider store={store}>
            <HeaderItems/>
        </ReduxProvider>
    )
}

export default GlobalHeader
