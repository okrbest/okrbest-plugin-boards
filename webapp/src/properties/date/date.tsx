// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo, useState, useCallback, useEffect} from 'react'
import {useIntl} from 'react-intl'
import {DateUtils} from 'react-day-picker'
import MomentLocaleUtils from 'react-day-picker/moment'
import DayPicker from 'react-day-picker/DayPicker'

import moment from 'moment'

import mutator from '../../mutator'

import Editable from '../../widgets/editable'
import SwitchOption from '../../widgets/menu/switchOption'
import Button from '../../widgets/buttons/button'

import Modal from '../../components/modal'
import ModalWrapper from '../../components/modalWrapper'
import {Utils} from '../../utils'

import 'react-day-picker/lib/style.css'
import './date.scss'

import {PropertyProps} from '../types'

export type DateProperty = {
    from?: number
    to?: number
    includeTime?: boolean
    timeZone?: string
}

export function createDatePropertyFromString(initialValue: string): DateProperty {
    let dateProperty: DateProperty = {}
    if (initialValue) {
        const singleDate = new Date(Number(initialValue))
        if (singleDate && DateUtils.isDate(singleDate)) {
            dateProperty.from = singleDate.getTime()
        } else {
            try {
                dateProperty = JSON.parse(initialValue)
            } catch {
                //Don't do anything, return empty dateProperty
            }
        }
    }
    return dateProperty
}

function datePropertyToString(dateProperty: DateProperty): string {
    return dateProperty.from || dateProperty.to ? JSON.stringify(dateProperty) : ''
}

const loadedLocales: Record<string, moment.Locale> = {}

function DateRange(props: PropertyProps): JSX.Element {
    const {propertyValue, propertyTemplate, showEmptyPlaceholder, readOnly, board, card} = props
    const [value, setValue] = useState(propertyValue)
    const intl = useIntl()
    const locale = intl.locale.toLowerCase()

    if (locale && locale !== 'en' && !loadedLocales[locale]) {
        // eslint-disable-next-line global-require
        loadedLocales[locale] = require(`moment/locale/${locale}`)
    }

    const localeData = moment.localeData(locale)
    const fallbackLocaleData = moment.localeData()
    const dateFormat = localeData ? localeData.longDateFormat('L') : fallbackLocaleData.longDateFormat('L')
    const timeFormat = 'HH:mm'

    useEffect(() => {
        if (value !== propertyValue) {
            setValue(propertyValue)
        }
    }, [propertyValue, setValue])

    const onChange = useCallback((newValue: string) => {
        if (value !== newValue) {
            setValue(newValue)
        }
    }, [value, board.id, card, propertyTemplate.id])

    const getDisplayDate = (date: Date | null | undefined) => {
        let displayDate = ''
        if (date) {
            displayDate = Utils.displayDate(date, intl)
        }
        return displayDate
    }

    const getDisplayDateWithTime = (date: Date | null | undefined, includeTime: boolean) => {
        if (!date) {
            return ''
        }
        return includeTime ? Utils.displayDateTime(date, intl) : Utils.displayDate(date, intl)
    }

    const getDisplayTime = (date: Date | null | undefined, includeTime: boolean) => {
        if (!includeTime || !date) {
            return ''
        }
        return moment(date).format(timeFormat)
    }

    const timeZoneOffset = (date: number): number => {
        return new Date(date).getTimezoneOffset() * 60 * 1000
    }

    const dateProperty = useMemo(() => createDatePropertyFromString(value as string), [value])
    const [showDialog, setShowDialog] = useState(false)
    const [includeTime, setIncludeTime] = useState(Boolean(dateProperty.includeTime))

    // Keep dateProperty as UTC,
    // dateFrom / dateTo will need converted to local time, to ensure date stays consistent
    // dateFrom / dateTo will be used for input and calendar dates
    const dateFrom = dateProperty.from ? new Date(dateProperty.from + (dateProperty.includeTime ? 0 : timeZoneOffset(dateProperty.from))) : undefined
    const dateTo = dateProperty.to ? new Date(dateProperty.to + (dateProperty.includeTime ? 0 : timeZoneOffset(dateProperty.to))) : undefined
    const [fromInput, setFromInput] = useState<string>(getDisplayDate(dateFrom))
    const [toInput, setToInput] = useState<string>(getDisplayDate(dateTo))
    const [fromTimeInput, setFromTimeInput] = useState<string>(getDisplayTime(dateFrom, includeTime))
    const [toTimeInput, setToTimeInput] = useState<string>(getDisplayTime(dateTo, includeTime))

    const isRange = dateTo !== undefined

    const applyTimeFromSource = (target: Date, source?: Date) => {
        if (includeTime && source) {
            target.setHours(source.getHours(), source.getMinutes(), 0, 0)
        } else {
            target.setHours(12, 0, 0, 0)
        }
    }

    const handleDayClick = (day: Date) => {
        const normalizedDay = new Date(day)
        const range: DateProperty = {}
        if (isRange) {
            const newRange = DateUtils.addDayToRange(normalizedDay, {from: dateFrom, to: dateTo})
            if (newRange.from) {
                const newFrom = new Date(newRange.from)
                applyTimeFromSource(newFrom, dateFrom)
                range.from = newFrom.getTime()
            }
            if (newRange.to) {
                const newTo = new Date(newRange.to)
                applyTimeFromSource(newTo, dateTo)
                range.to = newTo.getTime()
            }
        } else {
            applyTimeFromSource(normalizedDay, dateFrom)
            range.from = normalizedDay.getTime()
            range.to = undefined
        }
        saveRangeValue(range, includeTime)
    }

    const onRangeClick = () => {
        let range: DateProperty = {
            from: dateFrom?.getTime(),
            to: dateFrom?.getTime(),
        }
        if (isRange) {
            range = ({
                from: dateFrom?.getTime(),
                to: undefined,
            })
        }
        saveRangeValue(range, includeTime)
    }

    const onClear = () => {
        saveRangeValue({}, includeTime)
    }

    const saveRangeValue = (range: DateProperty, nextIncludeTime: boolean) => {
        const rangeUTC: DateProperty = {...range}
        if (nextIncludeTime) {
            rangeUTC.includeTime = true
        } else {
            delete rangeUTC.includeTime
        }
        if (rangeUTC.from) {
            rangeUTC.from -= nextIncludeTime ? 0 : timeZoneOffset(rangeUTC.from)
        }
        if (rangeUTC.to) {
            rangeUTC.to -= nextIncludeTime ? 0 : timeZoneOffset(rangeUTC.to)
        }

        onChange(datePropertyToString(rangeUTC))
        setIncludeTime(nextIncludeTime)
        const displayFrom = range.from ? new Date(range.from) : undefined
        const displayTo = range.to ? new Date(range.to) : undefined
        setFromInput(getDisplayDate(displayFrom))
        setToInput(getDisplayDate(displayTo))
        setFromTimeInput(getDisplayTime(displayFrom, nextIncludeTime))
        setToTimeInput(getDisplayTime(displayTo, nextIncludeTime))
    }

    useEffect(() => {
        const includesTime = Boolean(dateProperty.includeTime)
        setIncludeTime(includesTime)
        setFromInput(getDisplayDate(dateFrom))
        setToInput(getDisplayDate(dateTo))
        setFromTimeInput(getDisplayTime(dateFrom, includesTime))
        setToTimeInput(getDisplayTime(dateTo, includesTime))
    }, [dateProperty.includeTime, dateProperty.from, dateProperty.to, dateFrom?.getTime(), dateTo?.getTime()])

    let displayValue = ''
    if (dateFrom) {
        displayValue = getDisplayDateWithTime(dateFrom, includeTime)
    }
    if (dateTo) {
        const separator = displayValue ? ' → ' : ''
        displayValue += separator + getDisplayDateWithTime(dateTo, includeTime)
    }

    const onClose = () => {
        const newDate = datePropertyToString(dateProperty)
        onChange(newDate)
        mutator.changePropertyValue(board.id, card, propertyTemplate.id, newDate)
        setShowDialog(false)
    }

    let buttonText = displayValue
    if (!buttonText && showEmptyPlaceholder) {
        buttonText = intl.formatMessage({id: 'DateRange.empty', defaultMessage: 'Empty'})
    }

    const onIncludeTimeToggle = () => {
        const nextIncludeTime = !includeTime
        const range: DateProperty = {
            from: dateFrom?.getTime(),
            to: dateTo?.getTime(),
        }

        if (!nextIncludeTime) {
            if (range.from) {
                const newFrom = new Date(range.from)
                newFrom.setHours(12, 0, 0, 0)
                range.from = newFrom.getTime()
            }
            if (range.to) {
                const newTo = new Date(range.to)
                newTo.setHours(12, 0, 0, 0)
                range.to = newTo.getTime()
            }
        }
        saveRangeValue(range, nextIncludeTime)
    }

    const normalizeDateForTimeEdit = (baseDate: Date | undefined): Date => {
        if (baseDate) {
            return new Date(baseDate)
        }
        const now = new Date()
        now.setSeconds(0, 0)
        return now
    }

    const onTimeSave = (inputValue: string, isStart: boolean) => {
        const parsed = moment(inputValue, [timeFormat, 'H:mm'], true)
        if (!parsed.isValid()) {
            if (isStart) {
                setFromTimeInput(getDisplayTime(dateFrom, includeTime))
            } else {
                setToTimeInput(getDisplayTime(dateTo, includeTime))
            }
            return
        }

        const targetDate = normalizeDateForTimeEdit(isStart ? dateFrom : dateTo)
        targetDate.setHours(parsed.hours(), parsed.minutes(), 0, 0)

        const range: DateProperty = {
            from: isStart ? targetDate.getTime() : dateFrom?.getTime(),
            to: isStart ? dateTo?.getTime() : targetDate.getTime(),
        }

        saveRangeValue(range, true)
    }

    const className = props.property.valueClassName(readOnly)
    if (readOnly) {
        return <div className={className}>{displayValue}</div>
    }

    return (
        <div className={`DateRange ${displayValue ? '' : 'empty'} ` + className}>
            <Button
                onClick={() => setShowDialog(true)}
            >
                {buttonText}
            </Button>

            {showDialog &&
            <ModalWrapper>
                <Modal
                    onClose={() => onClose()}
                >
                    <div
                        className={className + '-overlayWrapper'}
                    >
                        <div className={className + '-overlay'}>
                            <div className={'inputContainer'}>
                                <Editable
                                    value={fromInput}
                                    placeholderText={dateFormat}
                                    onFocus={() => {
                                        if (dateFrom) {
                                            return setFromInput(Utils.inputDate(dateFrom, intl))
                                        }
                                        return undefined
                                    }}
                                    onChange={setFromInput}
                                    onSave={() => {
                                        const newDate = MomentLocaleUtils.parseDate(fromInput, 'L', intl.locale)
                                        if (newDate && DateUtils.isDate(newDate)) {
                                            newDate.setHours(12)
                                            const range: DateProperty = {
                                                from: newDate.getTime(),
                                                to: dateTo?.getTime(),
                                            }
                                            saveRangeValue(range, includeTime)
                                        } else {
                                            setFromInput(getDisplayDate(dateFrom))
                                        }
                                    }}
                                    onCancel={() => {
                                        setFromInput(getDisplayDate(dateFrom))
                                    }}
                                />
                                {dateTo &&
                                    <Editable
                                        value={toInput}
                                        placeholderText={dateFormat}
                                        onFocus={() => {
                                            if (dateTo) {
                                                return setToInput(Utils.inputDate(dateTo, intl))
                                            }
                                            return undefined
                                        }}
                                        onChange={setToInput}
                                        onSave={() => {
                                            const newDate = MomentLocaleUtils.parseDate(toInput, 'L', intl.locale)
                                            if (newDate && DateUtils.isDate(newDate)) {
                                                newDate.setHours(12)
                                                const range: DateProperty = {
                                                    from: dateFrom?.getTime(),
                                                    to: newDate.getTime(),
                                                }
                                                saveRangeValue(range, includeTime)
                                            } else {
                                                setToInput(getDisplayDate(dateTo))
                                            }
                                        }}
                                        onCancel={() => {
                                            setToInput(getDisplayDate(dateTo))
                                        }}
                                    />
                                }
                            </div>
                            {includeTime && (dateFrom || dateTo) &&
                                <div className='timeContainer'>
                                    {dateFrom &&
                                        <div className='timeField'>
                                            <span className='timeLabel'>{intl.formatMessage({id: 'DateRange.startTime', defaultMessage: 'Start time'})}</span>
                                            <Editable
                                                value={fromTimeInput}
                                                placeholderText={timeFormat}
                                                onFocus={() => {
                                                    if (dateFrom) {
                                                        setFromTimeInput(moment(dateFrom).format(timeFormat))
                                                    }
                                                }}
                                                onChange={setFromTimeInput}
                                                onSave={() => onTimeSave(fromTimeInput, true)}
                                                onCancel={() => setFromTimeInput(getDisplayTime(dateFrom, includeTime))}
                                            />
                                        </div>
                                    }
                                    {dateTo &&
                                        <div className='timeField'>
                                            <span className='timeLabel'>{intl.formatMessage({id: 'DateRange.endTime', defaultMessage: 'End time'})}</span>
                                            <Editable
                                                value={toTimeInput}
                                                placeholderText={timeFormat}
                                                onFocus={() => {
                                                    if (dateTo) {
                                                        setToTimeInput(moment(dateTo).format(timeFormat))
                                                    }
                                                }}
                                                onChange={setToTimeInput}
                                                onSave={() => onTimeSave(toTimeInput, false)}
                                                onCancel={() => setToTimeInput(getDisplayTime(dateTo, includeTime))}
                                            />
                                        </div>
                                    }
                                </div>
                            }
                            <DayPicker
                                onDayClick={handleDayClick}
                                initialMonth={dateFrom || new Date()}
                                showOutsideDays={false}
                                locale={locale}
                                localeUtils={MomentLocaleUtils}
                                todayButton={intl.formatMessage({id: 'DateRange.today', defaultMessage: 'Today'})}
                                onTodayButtonClick={handleDayClick}
                                month={dateFrom}
                                selectedDays={[dateFrom, dateTo ? {from: dateFrom, to: dateTo} : {from: dateFrom, to: dateFrom}]}
                                modifiers={dateTo ? {start: dateFrom, end: dateTo} : {start: dateFrom, end: dateFrom}}
                            />
                            <hr/>
                            <SwitchOption
                                key={'EndDateOn'}
                                id={'EndDateOn'}
                                name={intl.formatMessage({id: 'DateRange.endDate', defaultMessage: 'End date'})}
                                isOn={isRange}
                                onClick={onRangeClick}
                            />
                            <SwitchOption
                                key={'IncludeTime'}
                                id={'IncludeTime'}
                                name={intl.formatMessage({id: 'DateRange.includeTime', defaultMessage: 'Include time'})}
                                isOn={includeTime}
                                onClick={onIncludeTimeToggle}
                            />
                            <hr/>
                            <div
                                className='MenuOption menu-option'
                            >
                                <Button
                                    onClick={onClear}
                                >
                                    {intl.formatMessage({id: 'DateRange.clear', defaultMessage: 'Clear'})}
                                </Button>
                            </div>
                        </div>
                    </div>
                </Modal>
            </ModalWrapper>
            }
        </div>
    )
}

export default DateRange
