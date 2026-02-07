// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useState, KeyboardEvent } from 'react'
import ReactDOM from 'react-dom'
import { useIntl } from 'react-intl'

import { IPropertyOption } from '../blocks/board'

import Dialog from '../components/dialog'

import Button from './buttons/button'

import './renameOptionDialog.scss'

type Props = {
    option: IPropertyOption
    onClose: () => void
    onRename: (option: IPropertyOption, newValue: string) => void
}

const RenameOptionDialog = (props: Props): JSX.Element => {
    const intl = useIntl()
    const [name, setName] = useState(props.option.value)

    const placeholder = intl.formatMessage({
        id: 'RenameOptionDialog.placeholder',
        defaultMessage: 'Option name',
    })
    const cancelText = intl.formatMessage({
        id: 'RenameOptionDialog.cancel',
        defaultMessage: 'Cancel',
    })
    const updateText = intl.formatMessage({
        id: 'RenameOptionDialog.update',
        defaultMessage: 'Update',
    })

    const handleKeypress = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && name.trim()) {
            handleRename()
        } else if (e.key === 'Escape') {
            props.onClose()
        }
    }

    const handleRename = () => {
        if (name.trim() && name.trim() !== props.option.value) {
            props.onRename(props.option, name.trim())
        }
        props.onClose()
    }

    return ReactDOM.createPortal(
        <Dialog
            size="small"
            title={
                <span>
                    {intl.formatMessage({
                        id: 'RenameOptionDialog.title',
                        defaultMessage: 'Rename option',
                    })}
                </span>
            }
            className="RenameOptionDialog"
            onClose={props.onClose}
        >
            <div className="RenameOptionDialog__content">
                <input
                    className="RenameOptionDialog__input"
                    type="text"
                    placeholder={placeholder}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus={true}
                    maxLength={100}
                    onKeyUp={handleKeypress}
                />
                <div className="RenameOptionDialog__actions">
                    <Button
                        size="medium"
                        emphasis="tertiary"
                        onClick={props.onClose}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        size="medium"
                        filled={Boolean(name.trim())}
                        onClick={handleRename}
                        disabled={!name.trim()}
                    >
                        {updateText}
                    </Button>
                </div>
            </div>
        </Dialog>,
        document.body
    )
}

export default RenameOptionDialog
