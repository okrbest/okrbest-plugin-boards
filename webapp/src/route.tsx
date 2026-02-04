// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {
    Redirect,
    Route,
    RouteComponentProps,
} from 'react-router-dom'

import {Utils} from './utils'
import {getLoggedIn, getMe, getMyConfig} from './store/users'
import {useAppSelector} from './store/hooks'
import {UserSettingKey} from './userSettings'
import {IUser} from './user'
import {getClientConfig} from './store/clientConfig'
import {ClientConfig} from './config/clientConfig'

type RouteRenderProps = RouteComponentProps<Record<string, string | undefined>>

type RouteProps = {
    path: string|string[]
    exact?: boolean
    render?: (props: RouteRenderProps) => React.ReactElement
    component?: React.ComponentType<React.PropsWithChildren<unknown>>
    children?: React.ReactElement
    getOriginalPath?: (match: RouteRenderProps['match']) => string
    loginRequired?: boolean
}

function FBRoute(props: RouteProps) {
    const loggedIn = useAppSelector<boolean|null>(getLoggedIn)
    const me = useAppSelector<IUser|null>(getMe)
    const myConfig = useAppSelector(getMyConfig)
    const clientConfig = useAppSelector<ClientConfig>(getClientConfig)

    const disableTour = me?.is_guest || clientConfig?.featureFlags?.disableTour || false

    const showWelcomePage = !disableTour &&
        Utils.isFocalboardPlugin() &&
        (me?.id !== 'single-user') &&
        props.path !== '/welcome' &&
        loggedIn === true &&
        !myConfig[UserSettingKey.WelcomePageViewed]

    const getRedirectRender = (): ((routeProps: RouteRenderProps) => React.ReactElement) | undefined => {
        if (showWelcomePage) {
            const WelcomeRedirect = ({match}: RouteRenderProps): React.ReactElement => {
                if (props.getOriginalPath) {
                    return <Redirect to={`/welcome?r=${props.getOriginalPath(match)}`}/>
                }
                return <Redirect to='/welcome'/>
            }
            return WelcomeRedirect
        }

        if (loggedIn === false && props.loginRequired) {
            const LoginRedirect = ({match}: RouteRenderProps): React.ReactElement => {
                if (props.getOriginalPath) {
                    let redirectUrl = '/' + Utils.buildURL(props.getOriginalPath(match))
                    if (redirectUrl.indexOf('//') === 0) {
                        redirectUrl = redirectUrl.slice(1)
                    }
                    const loginUrl = `/error?id=not-logged-in&r=${encodeURIComponent(redirectUrl)}`
                    return <Redirect to={loginUrl}/>
                }
                return <Redirect to='/error?id=not-logged-in'/>
            }
            return LoginRedirect
        }

        return undefined
    }

    const redirectRender = getRedirectRender()

    if (redirectRender) {
        return (
            <Route
                path={props.path}
                exact={props.exact}
                render={redirectRender}
            />
        )
    }

    return (
        <Route
            path={props.path}
            render={props.render}
            component={props.component}
            exact={props.exact}
        >
            {props.children}
        </Route>
    )
}

export default React.memo(FBRoute)
