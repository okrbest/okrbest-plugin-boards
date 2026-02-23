// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React, {useEffect, useRef, useState, useCallback} from 'react'
import {useIntl} from 'react-intl'

import Editable, {Focusable} from '../../widgets/editable'

import {Utils} from '../../utils'
import mutator from '../../mutator'
import EditIcon from '../../widgets/icons/edit'
import IconButton from '../../widgets/buttons/iconButton'
import DuplicateIcon from '../../widgets/icons/duplicate'
import {sendFlashMessage} from '../../components/flashMessages'

import {PropertyProps} from '../types'

import './url.scss'

const URLProperty = (props: PropertyProps): React.JSX.Element => {
    if (!props.propertyTemplate) {
        return <></>
    }

    const [value, setValue] = useState(props.card.fields.properties[props.propertyTemplate.id || ''] || '')
    const [isEditing, setIsEditing] = useState(false)
    const isEmpty = !(props.propertyValue as string)?.trim()
    const showEditable = !props.readOnly && (isEditing || isEmpty)
    const editableRef = useRef<Focusable>(null)
    const intl = useIntl()

    const emptyDisplayValue = props.showEmptyPlaceholder ? intl.formatMessage({id: 'PropertyValueElement.empty', defaultMessage: 'Empty'}) : ''

    // 저장 대기 중인 데이터를 ref로 관리 (cleanup에서 안전하게 접근 가능)
    // card 객체는 깊은 복사하여 stale 참조 문제 방지
    const pendingSaveRef = useRef<{
        boardId: string
        card: typeof props.card
        propertyId: string
        value: string
        originalValue: string | string[]
        readOnly: boolean
    } | null>(null)

    // 값이 변경될 때마다 저장 대기 데이터 업데이트
    useEffect(() => {
        const propertyId = props.propertyTemplate?.id || ''
        const originalValue = props.card.fields.properties[propertyId] ?? ''
        pendingSaveRef.current = {
            boardId: props.board.id,
            // card 객체 깊은 복사 (Redux 업데이트로 인한 stale 참조 방지)
            card: {
                ...props.card,
                fields: {
                    ...props.card.fields,
                    properties: {...props.card.fields.properties},
                },
            },
            propertyId,
            value: value as string,
            originalValue,
            readOnly: props.readOnly,
        }
    }, [props.board.id, props.card, props.propertyTemplate?.id, value, props.readOnly])

    const saveTextProperty = useCallback(() => {
        if (value !== (props.card.fields.properties[props.propertyTemplate?.id || ''] || '')) {
            mutator.changePropertyValue(props.board.id, props.card, props.propertyTemplate?.id || '', value)
        }
    }, [props.board.id, props.card, props.propertyTemplate?.id, value])

    // 카드나 프로퍼티가 변경될 때 cleanup에서 이전 값을 저장
    useEffect(() => {
        return () => {
            const pending = pendingSaveRef.current
            if (pending && !pending.readOnly && pending.value !== pending.originalValue) {
                mutator.changePropertyValue(pending.boardId, pending.card, pending.propertyId, pending.value)
            }
        }
    }, [props.card.id, props.propertyTemplate?.id])

    // 카드나 프로퍼티가 변경될 때, 또는 서버에서 값이 업데이트될 때 value를 초기화
    // serverValue는 서버에서 온 최신 값을 반영함
    const serverValue = props.card.fields.properties[props.propertyTemplate?.id || ''] || ''
    useEffect(() => {
        setValue(serverValue)
    }, [props.card.id, props.propertyTemplate?.id, serverValue])

    useEffect(() => {
        if (isEditing) {
            editableRef.current?.focus()
        }
    }, [isEditing])

    if (showEditable) {
        return (
            <div className='URLProperty'>
                <Editable
                    className={props.property.valueClassName(props.readOnly)}
                    ref={editableRef}
                    placeholderText={emptyDisplayValue}
                    value={value as string}
                    autoExpand={true}
                    readonly={props.readOnly}
                    onChange={setValue}
                    onSave={() => {
                        setIsEditing(false)
                        saveTextProperty()
                    }}
                    onCancel={() => {
                        setIsEditing(false)
                        setValue(props.propertyValue || '')
                    }}
                    onFocus={() => {
                        setIsEditing(true)
                    }}
                    validator={() => {
                        if (value === '') {
                            return true
                        }
                        const urlRegexp = /(((.+:(?:\/\/)?)?(?:[-;:&=+$,\w]+@)?[A-Za-z0-9.-]+|(?:www\.|[-;:&=+$,\w]+@)[A-Za-z0-9.-]+)((?:\/[+~%/.\w\-_]*)?\??(?:[-+=&;%@.\w_]*)#?(?:[.!/\\\w]*))?)/
                        return urlRegexp.test(value as string)
                    }}
                />
            </div>
        )
    }

    return (
        <div className={`URLProperty ${props.property.valueClassName(props.readOnly)}`}>
            <a
                className='link'
                href={Utils.ensureProtocol((props.propertyValue as string).trim())}
                target='_blank'
                rel='noreferrer'
                onClick={(event) => event.stopPropagation()}
            >
                {props.propertyValue}
            </a>
            {!props.readOnly &&
            <IconButton
                className='Button_Edit'
                title={intl.formatMessage({id: 'URLProperty.edit', defaultMessage: 'Edit'})}
                icon={<EditIcon/>}
                onClick={() => setIsEditing(true)}
            />}
            <IconButton
                className='Button_Copy'
                title={intl.formatMessage({id: 'URLProperty.copy', defaultMessage: 'Copy'})}
                icon={<DuplicateIcon/>}
                onClick={(e) => {
                    e.stopPropagation()
                    Utils.copyTextToClipboard(props.propertyValue as string)
                    sendFlashMessage({content: intl.formatMessage({id: 'URLProperty.copiedLink', defaultMessage: 'Copied!'}), severity: 'high'})
                }}
            />
        </div>
    )
}

export default URLProperty
