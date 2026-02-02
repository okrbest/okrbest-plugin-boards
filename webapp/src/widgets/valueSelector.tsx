// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, { useCallback, useState, useEffect } from 'react'
import { useIntl } from 'react-intl'
import {
    ActionMeta,
    OnChangeValue,
    components,
    MenuListProps,
    OptionProps,
} from 'react-select'
import { FormatOptionLabelMeta } from 'react-select/base'
import CreatableSelect from 'react-select/creatable'
import {
    DndContext,
    closestCenter,
    DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { CSSObject } from '@emotion/serialize'

import { IPropertyOption } from '../blocks/board'
import { Constants } from '../constants'

import { getSelectBaseStyle } from '../theme'

import Menu from './menu'
import MenuWrapper from './menuWrapper'
import IconButton from './buttons/iconButton'
import OptionsIcon from './icons/options'
import DeleteIcon from './icons/delete'
import EditIcon from './icons/edit'
import CloseIcon from './icons/close'
import GripIcon from './icons/grip'
import Label from './label'

import './valueSelector.scss'

type Props = {
    options: IPropertyOption[]
    value?: IPropertyOption | IPropertyOption[]
    emptyValue: string
    onCreate: (value: string) => void
    onChange: (value: string | string[]) => void
    onChangeColor: (option: IPropertyOption, color: string) => void
    onDeleteOption: (option: IPropertyOption) => void
    onStartRename?: (option: IPropertyOption) => void
    onReorderOption?: (option: IPropertyOption, destIndex: number) => void
    isMulti?: boolean
    onDeleteValue?: (value: IPropertyOption) => void
    onBlur?: () => void
}

type LabelProps = {
    option: IPropertyOption
    meta: FormatOptionLabelMeta<IPropertyOption>
    onChangeColor: (option: IPropertyOption, color: string) => void
    onDeleteOption: (option: IPropertyOption) => void
    onStartRename?: (option: IPropertyOption) => void
    onDeleteValue?: (value: IPropertyOption) => void
    isMulti?: boolean
    showDragHandle?: boolean
}

const ValueSelectorLabel = (props: LabelProps): JSX.Element => {
    const { option, onDeleteValue, meta, isMulti, showDragHandle } = props
    const intl = useIntl()
    if (meta.context === 'value') {
        let className = onDeleteValue
            ? 'Label-no-padding'
            : 'Label-single-select'
        if (!isMulti) {
            className += ' Label-no-margin'
        }
        return (
            <Label color={option.color} className={className}>
                <span className="Label-text">{option.value}</span>
                {onDeleteValue && (
                    <IconButton
                        onClick={() => onDeleteValue(option)}
                        icon={<CloseIcon />}
                        title="Clear"
                        className="margin-left delete-value"
                    />
                )}
            </Label>
        )
    }
    return (
        <div className="value-menu-option" role="menuitem">
            {showDragHandle && (
                <div className="value-menu-option__drag-handle">
                    <GripIcon />
                </div>
            )}
            <div className="label-container">
                <Label color={option.color}>{option.value}</Label>
            </div>
            <MenuWrapper stopPropagationOnToggle={true}>
                <IconButton
                    title={intl.formatMessage({
                        id: 'ValueSelectorLabel.openMenu',
                        defaultMessage: 'Open menu',
                    })}
                    icon={<OptionsIcon />}
                />
                <Menu position="left">
                    {props.onStartRename && (
                        <Menu.Text
                            id="rename"
                            icon={<EditIcon />}
                            name={intl.formatMessage({
                                id: 'ValueSelector.rename',
                                defaultMessage: 'Rename',
                            })}
                            onClick={() => props.onStartRename?.(option)}
                        />
                    )}
                    <Menu.Text
                        id="delete"
                        icon={<DeleteIcon />}
                        name={intl.formatMessage({
                            id: 'BoardComponent.delete',
                            defaultMessage: 'Delete',
                        })}
                        onClick={() => props.onDeleteOption(option)}
                    />
                    <Menu.Separator />
                    {Object.entries(Constants.menuColors).map(
                        ([key, color]: [string, string]) => (
                            <Menu.Color
                                key={key}
                                id={key}
                                name={color}
                                onClick={() => props.onChangeColor(option, key)}
                            />
                        )
                    )}
                </Menu>
            </MenuWrapper>
        </div>
    )
}

const valueSelectorStyle = {
    ...getSelectBaseStyle(),
    option: (
        provided: CSSObject,
        state: { isFocused: boolean }
    ): CSSObject => ({
        ...provided,
        background: state.isFocused
            ? 'rgba(var(--center-channel-color-rgb), 0.1)'
            : 'rgb(var(--center-channel-bg-rgb))',
        color: state.isFocused
            ? 'rgb(var(--center-channel-color-rgb))'
            : 'rgb(var(--center-channel-color-rgb))',
        padding: '8px',
    }),
    control: (): CSSObject => ({
        border: 0,
        width: '100%',
        margin: '0',
    }),
    valueContainer: (provided: CSSObject): CSSObject => ({
        ...provided,
        padding: '0 8px',
        overflow: 'unset',
    }),
    singleValue: (provided: CSSObject): CSSObject => ({
        ...provided,
        position: 'static',
        top: 'unset',
        transform: 'unset',
    }),
    placeholder: (provided: CSSObject): CSSObject => ({
        ...provided,
        color: 'rgba(var(--center-channel-color-rgb), 0.4)',
    }),
    multiValue: (provided: CSSObject): CSSObject => ({
        ...provided,
        margin: 0,
        padding: 0,
        backgroundColor: 'transparent',
    }),
    multiValueLabel: (provided: CSSObject): CSSObject => ({
        ...provided,
        display: 'flex',
        paddingLeft: 0,
        padding: 0,
    }),
    multiValueRemove: (): CSSObject => ({
        display: 'none',
    }),
    menu: (provided: CSSObject): CSSObject => ({
        ...provided,
        width: 'unset',
        background: 'rgb(var(--center-channel-bg-rgb))',
        minWidth: '260px',
    }),
}

type SortableOptionWrapperProps = {
    id: string
    children: React.ReactNode
}

const SortableOptionWrapper = ({
    id,
    children,
}: SortableOptionWrapperProps): JSX.Element => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 1,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={isDragging ? 'value-selector-option--dragging' : ''}
            {...attributes}
            {...listeners}
        >
            {children}
        </div>
    )
}

function ValueSelector(props: Props): JSX.Element {
    const intl = useIntl()
    const [localOptions, setLocalOptions] = useState(props.options)

    useEffect(() => {
        setLocalOptions(props.options)
    }, [props.options])

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    )

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event
            if (!over || !props.onReorderOption) {
                return
            }
            if (active.id === over.id) {
                return
            }
            const srcIndex = localOptions.findIndex((o) => o.id === active.id)
            const destIndex = localOptions.findIndex((o) => o.id === over.id)
            if (srcIndex === -1 || destIndex === -1) {
                return
            }
            const option = localOptions[srcIndex]
            const newOptions = [...localOptions]
            newOptions.splice(srcIndex, 1)
            newOptions.splice(destIndex, 0, option)
            setLocalOptions(newOptions)
            props.onReorderOption(option, destIndex)
        },
        [localOptions, props.onReorderOption]
    )

    const CustomMenuList = useCallback(
        (menuListProps: MenuListProps<IPropertyOption, boolean>) => {
            if (!props.onReorderOption) {
                return <components.MenuList {...menuListProps} />
            }
            return (
                <SortableContext
                    items={localOptions.map((o) => o.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="value-selector-menu-list">
                        {menuListProps.children}
                    </div>
                </SortableContext>
            )
        },
        [props.onReorderOption, localOptions]
    )

    const CustomOption = useCallback(
        (optionProps: OptionProps<IPropertyOption, boolean>) => {
            if (!props.onReorderOption) {
                return <components.Option {...optionProps} />
            }
            return (
                <SortableOptionWrapper id={optionProps.data.id}>
                    <components.Option {...optionProps} />
                </SortableOptionWrapper>
            )
        },
        [props.onReorderOption]
    )

    const selectComponent = (
        <CreatableSelect
            noOptionsMessage={() =>
                intl.formatMessage({
                    id: 'ValueSelector.noOptions',
                    defaultMessage:
                        'No options. Start typing to add the first one!',
                })
            }
            aria-label={intl.formatMessage({
                id: 'ValueSelector.valueSelector',
                defaultMessage: 'Value selector',
            })}
            captureMenuScroll={true}
            maxMenuHeight={1200}
            isMulti={props.isMulti}
            isClearable={true}
            styles={valueSelectorStyle}
            components={{
                MenuList: CustomMenuList,
                Option: CustomOption,
            }}
            formatOptionLabel={(
                option: IPropertyOption,
                meta: FormatOptionLabelMeta<IPropertyOption>
            ) => (
                <ValueSelectorLabel
                    option={option}
                    meta={meta}
                    isMulti={props.isMulti}
                    onChangeColor={props.onChangeColor}
                    onDeleteOption={props.onDeleteOption}
                    onStartRename={props.onStartRename}
                    onDeleteValue={props.onDeleteValue}
                    showDragHandle={
                        Boolean(props.onReorderOption) &&
                        meta.context === 'menu'
                    }
                />
            )}
            className="ValueSelector"
            classNamePrefix="ValueSelector"
            options={localOptions}
            getOptionLabel={(o: IPropertyOption) => o.value}
            getOptionValue={(o: IPropertyOption) => o.id}
            onChange={(
                value: OnChangeValue<IPropertyOption, true | false>,
                action: ActionMeta<IPropertyOption>
            ): void => {
                if (
                    action.action === 'select-option' ||
                    action.action === 'pop-value'
                ) {
                    if (Array.isArray(value)) {
                        props.onChange(
                            (value as IPropertyOption[]).map(
                                (option) => option.id
                            )
                        )
                    } else {
                        props.onChange((value as IPropertyOption).id)
                        props.onBlur?.()
                    }
                } else if (action.action === 'clear') {
                    props.onChange('')
                }
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    props.onBlur?.()
                }
            }}
            onBlur={props.onBlur}
            onCreateOption={props.onCreate}
            autoFocus={true}
            value={props.value || null}
            closeMenuOnSelect={!props.isMulti}
            placeholder={props.emptyValue}
            hideSelectedOptions={false}
            defaultMenuIsOpen={true}
            menuIsOpen={props.isMulti}
            blurInputOnSelect={!props.isMulti}
        />
    )

    if (!props.onReorderOption) {
        return selectComponent
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            {selectComponent}
        </DndContext>
    )
}

export default React.memo(ValueSelector)
