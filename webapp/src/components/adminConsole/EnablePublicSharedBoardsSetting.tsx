// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react'

import {getCurrentLanguage, getMessages} from '../../i18n'

type Props = {
    id: string
    value?: boolean | string
    disabled?: boolean
    setByEnv?: boolean
    onChange: (id: string, value: boolean) => void
    setSaveNeeded: (saveNeeded: boolean) => void
}

function parseBool(value: Props['value']): boolean {
    return value === true || value === 'true'
}

const EnablePublicSharedBoardsSetting = (props: Props) => {
    const enabled = parseBool(props.value)
    const isDisabled = Boolean(props.disabled || props.setByEnv)
    const messages = useMemo(() => getMessages(getCurrentLanguage()), [])

    const formatMessage = useCallback((id: string, defaultMessage: string) => {
        return messages[id] || defaultMessage
    }, [messages])

    const updateValue = useCallback((nextValue: boolean) => {
        props.onChange(props.id, nextValue)
        props.setSaveNeeded(true)
    }, [props])

    return (
        <div className='form-group'>
            <label
                className='control-label col-sm-4'
                htmlFor={`${props.id}_true`}
            >
                {formatMessage('AdminConsole.EnablePublicSharedBoards.displayName', 'Enable Publicly-Shared Boards:')}
            </label>
            <div className='col-sm-8'>
                <label className='radio-inline' htmlFor={`${props.id}_true`}>
                    <input
                        id={`${props.id}_true`}
                        type='radio'
                        name={props.id}
                        checked={enabled}
                        disabled={isDisabled}
                        onChange={() => updateValue(true)}
                    />
                    {formatMessage('AdminConsole.Common.enabled', 'Enabled')}
                </label>
                <label className='radio-inline' htmlFor={`${props.id}_false`}>
                    <input
                        id={`${props.id}_false`}
                        type='radio'
                        name={props.id}
                        checked={!enabled}
                        disabled={isDisabled}
                        onChange={() => updateValue(false)}
                    />
                    {formatMessage('AdminConsole.Common.disabled', 'Disabled')}
                </label>
                <div className='help-text'>
                    {formatMessage(
                        'AdminConsole.EnablePublicSharedBoards.helpText',
                        'This allows board editors to share boards that can be accessed by anyone with the link.',
                    )}
                </div>
            </div>
        </div>
    )
}

export default EnablePublicSharedBoardsSetting
