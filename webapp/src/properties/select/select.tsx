// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React, {useState, useCallback} from 'react'
import {useIntl} from 'react-intl'

import {IPropertyOption} from '../../blocks/board'

import Label from '../../widgets/label'
import {Utils, IDType} from '../../utils'
import mutator from '../../mutator'
import ValueSelector from '../../widgets/valueSelector'
import RenameOptionDialog from '../../widgets/renameOptionDialog'

import {PropertyProps} from '../types'
import {useCanEditCardProperties} from '../../hooks/permissions'

const SelectProperty = (props: PropertyProps) => {
    const {propertyValue, propertyTemplate, board, card} = props
    const intl = useIntl()

    const [open, setOpen] = useState(false)
    const [renameOption, setRenameOption] = useState<IPropertyOption | null>(null)
    const isEditable = !props.readOnly && Boolean(board)

    // 옵션 목록을 바꾸는 일과 값을 고르는 일은 다른 질문이다. 보드가 잠그면 앞의
    // 것만 관리자 몫이 되고, 값 고르기는 그대로 남는다 (spec U-04·U-08).
    //
    // readOnly로 넘기지 않는 이유가 이것이다 — 그러면 값 고르기까지 막혀 카드
    // 작성이 마비된다.
    const canEditOptions = useCanEditCardProperties(board)

    const onCreate = useCallback((newValue: string) => {
        const option: IPropertyOption = {
            id: Utils.createGuid(IDType.BlockID),
            value: newValue,
            color: 'propColorDefault',
        }
        mutator.insertPropertyOption(board.id, board.cardProperties, propertyTemplate, option, 'add property option').then(() => {
            mutator.changePropertyValue(board.id, card, propertyTemplate.id, option.id)
        })
    }, [board, board.id, props.card, propertyTemplate.id])

    const emptyDisplayValue = props.showEmptyPlaceholder ? intl.formatMessage({id: 'PropertyValueElement.empty', defaultMessage: 'Empty'}) : ''

    const onChange = useCallback((newValue: string | string[]) => mutator.changePropertyValue(board.id, card, propertyTemplate.id, newValue), [board.id, card, propertyTemplate])
    const onChangeColor = useCallback((option: IPropertyOption, colorId: string) => mutator.changePropertyOptionColor(board.id, board.cardProperties, propertyTemplate, option, colorId), [board, propertyTemplate])
    const onDeleteOption = useCallback((option: IPropertyOption) => mutator.deletePropertyOption(board.id, board.cardProperties, propertyTemplate, option), [board, propertyTemplate])
    const onRenameOption = useCallback((option: IPropertyOption, newValue: string) => mutator.changePropertyOptionValue(board.id, board.cardProperties, propertyTemplate, option, newValue), [board, propertyTemplate])
    const onReorderOption = useCallback((option: IPropertyOption, destIndex: number) => mutator.changePropertyOptionOrder(board.id, board.cardProperties, propertyTemplate, option, destIndex), [board, propertyTemplate])
    const onDeleteValue = useCallback(() => mutator.changePropertyValue(board.id, card, propertyTemplate.id, ''), [card, propertyTemplate.id])

    const option = propertyTemplate.options.find((o: IPropertyOption) => o.id === propertyValue)
    const propertyColorCssClassName = option?.color || ''
    const displayValue = option?.value
    const finalDisplayValue = displayValue || emptyDisplayValue

    const renameDialog = renameOption && (
        <RenameOptionDialog
            option={renameOption}
            onClose={() => setRenameOption(null)}
            onRename={onRenameOption}
        />
    )

    if (!isEditable || !open) {
        return (
            <>
                <div
                    className={props.property.valueClassName(!isEditable)}
                    data-testid='select-non-editable'
                    tabIndex={0}
                    onClick={() => setOpen(true)}
                >
                    <Label color={displayValue ? propertyColorCssClassName : 'empty'}>
                        <span className='Label-text'>{finalDisplayValue}</span>
                    </Label>
                </div>
                {renameDialog}
            </>
        )
    }
    return (
        <>
            <ValueSelector
                emptyValue={emptyDisplayValue}
                options={propertyTemplate.options}
                value={propertyTemplate.options.find((p: IPropertyOption) => p.id === propertyValue)}
                onCreate={canEditOptions ? onCreate : undefined}
                onChange={onChange}
                onChangeColor={canEditOptions ? onChangeColor : undefined}
                onDeleteOption={canEditOptions ? onDeleteOption : undefined}
                onStartRename={canEditOptions ? setRenameOption : undefined}
                onReorderOption={canEditOptions ? onReorderOption : undefined}
                onDeleteValue={onDeleteValue}
                onBlur={() => setOpen(false)}
            />
            {renameDialog}
        </>
    )
}

export default React.memo(SelectProperty)
