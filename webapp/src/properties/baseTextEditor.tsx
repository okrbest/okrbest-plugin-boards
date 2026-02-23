// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React, {useCallback, useState, useRef, useEffect} from 'react'

import {useIntl} from 'react-intl'

import mutator from '../mutator'
import Editable from '../widgets/editable'

import {PropertyProps} from './types'

const BaseTextEditor = (props: PropertyProps & {validator: (value: string) => boolean, spellCheck?: boolean}): React.JSX.Element => {
    const [value, setValue] = useState(props.card.fields.properties[props.propertyTemplate.id || ''] || '')
    const onCancel = useCallback(() => setValue(props.propertyValue || ''), [props.propertyValue])

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

    const intl = useIntl()
    const emptyDisplayValue = props.showEmptyPlaceholder ? intl.formatMessage({id: 'PropertyValueElement.empty', defaultMessage: 'Empty'}) : ''

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
    // props.propertyValue는 서버에서 온 최신 값을 반영함
    const serverValue = props.card.fields.properties[props.propertyTemplate?.id || ''] || ''
    useEffect(() => {
        setValue(serverValue)
    }, [props.card.id, props.propertyTemplate?.id, serverValue])

    if (!props.readOnly) {
        return (
            <Editable
                className={props.property.valueClassName(props.readOnly)}
                placeholderText={emptyDisplayValue}
                value={value.toString()}
                autoExpand={true}
                onChange={setValue}
                onSave={saveTextProperty}
                onCancel={onCancel}
                validator={props.validator}
                spellCheck={props.spellCheck}
            />
        )
    }
    return <div className={props.property.valueClassName(true)}>{props.propertyValue}</div>
}

export default BaseTextEditor
