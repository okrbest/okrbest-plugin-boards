// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import {Utils} from './utils'

type State = {
    hasError: boolean
}

type Props = {
    children: React.ReactNode
}

export default class ErrorBoundary extends React.Component<Props, State> {
    state = {hasError: false}
    msg = 'Redirecting to error page...'

    handleError = (): void => {
        // 절대 경로를 사용하여 상대 경로 해석으로 인한 무한 리다이렉션 방지
        const baseURL = Utils.getBaseURL()
        // baseURL이 비어있으면 '/error?id=unknown', 아니면 '/{baseURL}/error?id=unknown'
        const url = baseURL ? `/${baseURL}/error?id=unknown` : '/error?id=unknown'
        Utils.log('error boundary redirecting to ' + url)
        window.location.replace(url)
    }

    static getDerivedStateFromError(/*error: Error*/): State {
        return {hasError: true}
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        Utils.logError(error + ': ' + errorInfo)
    }

    shouldComponentUpdate(): boolean {
        return true
    }

    render(): React.ReactNode {
        if (this.state.hasError) {
            this.handleError()
            return <span>{this.msg}</span>
        }
        return this.props.children
    }
}

