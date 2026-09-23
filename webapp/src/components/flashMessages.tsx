// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useEffect, useRef} from 'react'
import {createNanoEvents} from 'nanoevents'

import './flashMessages.scss'

export type FlashMessage = {
    content: React.ReactNode
    severity: 'low' | 'normal' | 'high'

    // 내용 옆 버튼 하나. 누르면 onClick을 실행한 뒤 알림을 닫는다.
    action?: {label: string, onClick: () => void}

    // 이 알림만 이 시간(ms) 동안 보여준다. 없으면 FlashMessages의 milliseconds.
    durationMs?: number
}

const emitter = createNanoEvents()

export function sendFlashMessage(message: FlashMessage): void {
    emitter.emit('message', message)
}

type Props = {
    milliseconds: number
}

export const FlashMessages = React.memo((props: Props) => {
    const [message, setMessage] = useState<FlashMessage|null>(null)
    const [fadeOut, setFadeOut] = useState(false)

    // 타이머는 ref로 든다. state로 들면 emitter 콜백이 첫 렌더의 값만 봐서 앞 알림의 타이머를 못 지운다.
    const timeoutRef = useRef<ReturnType<typeof setTimeout>|null>(null)

    const clearPendingTimeout = (): void => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }

    const handleTimeout = (): void => {
        timeoutRef.current = null
        setMessage(null)
        setFadeOut(false)
    }

    const handleFadeOut = (): void => {
        setFadeOut(true)
        timeoutRef.current = setTimeout(handleTimeout, 200)
    }

    useEffect(() => {
        let isSubscribed = true
        emitter.on('message', (newMessage: FlashMessage) => {
            if (isSubscribed) {
                clearPendingTimeout()
                setFadeOut(false)
                timeoutRef.current = setTimeout(handleFadeOut, (newMessage.durationMs ?? props.milliseconds) - 200)
                setMessage(newMessage)
            }
        })
        return () => {
            isSubscribed = false
        }
    }, [])

    const handleClick = (): void => {
        clearPendingTimeout()
        handleFadeOut()
    }

    const handleActionClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
        // 컨테이너의 onClick(닫기)으로 번지지 않게 한다. 동작을 먼저 실행하고 닫는다.
        e.stopPropagation()
        message?.action?.onClick()
        handleClick()
    }

    if (!message) {
        return null
    }

    return (
        <div
            className={'FlashMessages ' + message.severity + (fadeOut ? ' flashOut' : ' flashIn')}
            onClick={handleClick}
        >
            {message.content}
            {message.action && (
                <button
                    type='button'
                    className='FlashMessages__action'
                    onClick={handleActionClick}
                >
                    {message.action.label}
                </button>
            )}
        </div>
    )
})

FlashMessages.displayName = 'FlashMessages'
