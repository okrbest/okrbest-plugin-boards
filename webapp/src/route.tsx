// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {Navigate, useParams} from 'react-router-dom'

import {Utils} from './utils'
import {getLoggedIn, getMe, getMyConfig} from './store/users'
import {useAppSelector} from './store/hooks'
import {UserSettingKey} from './userSettings'
import {IUser} from './user'
import {getClientConfig} from './store/clientConfig'
import {ClientConfig} from './config/clientConfig'

type RouteParams = Record<string, string | undefined>

type RouteProps = {
    children: React.ReactNode
    getOriginalPath?: (params: RouteParams) => string
    loginRequired?: boolean
}

function FBRoute(props: RouteProps) {
    const loggedIn = useAppSelector<boolean|null>(getLoggedIn)
    const me = useAppSelector<IUser|null>(getMe)
    const myConfig = useAppSelector(getMyConfig)
    const clientConfig = useAppSelector<ClientConfig>(getClientConfig)
    const params = useParams()

    const disableTour = me?.is_guest || clientConfig?.featureFlags?.disableTour || false

    const showWelcomePage = !disableTour &&
        Utils.isFocalboardPlugin() &&
        (me?.id !== 'single-user') &&
        loggedIn === true &&
        !myConfig[UserSettingKey.WelcomePageViewed]

    if (showWelcomePage) {
        if (props.getOriginalPath) {
            return <Navigate to={`/welcome?r=${props.getOriginalPath(params)}`} replace/>
        }
        return <Navigate to='/welcome' replace/>
    }

    if (loggedIn === false && props.loginRequired) {
        if (props.getOriginalPath) {
            let redirectUrl = '/' + Utils.buildURL(props.getOriginalPath(params))
            if (redirectUrl.indexOf('//') === 0) {
                redirectUrl = redirectUrl.slice(1)
            }
            const loginUrl = `/error?id=not-logged-in&r=${encodeURIComponent(redirectUrl)}`
            return <Navigate to={loginUrl} replace/>
        }
        return <Navigate to='/error?id=not-logged-in' replace/>
    }

    return <>{props.children}</>
}

export default React.memo(FBRoute)
