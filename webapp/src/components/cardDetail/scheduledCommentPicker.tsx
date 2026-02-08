// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useMemo} from 'react'
import {useIntl} from 'react-intl'

import Button from '../../widgets/buttons/button'
import './scheduledCommentPicker.scss'

type Props = {
    onSchedule: (scheduledAt: number) => void
    onCancel: () => void
}

const ScheduledCommentPicker: React.FC<React.PropsWithChildren<Props>> = ({onSchedule, onCancel}) => {
    const intl = useIntl()

    // Default: tomorrow at 9 AM
    const defaultDateTime = useMemo(() => {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(9, 0, 0, 0)
        return {
            date: tomorrow.toISOString().split('T')[0],
            time: '09:00',
        }
    }, [])

    const [date, setDate] = useState(defaultDateTime.date)
    const [time, setTime] = useState(defaultDateTime.time)
    const [error, setError] = useState<string | null>(null)

    const minDate = useMemo(() => new Date().toISOString().split('T')[0], [])

    const maxDate = useMemo(() => {
        const max = new Date()
        max.setDate(max.getDate() + 30)
        return max.toISOString().split('T')[0]
    }, [])

    const handleSchedule = useCallback(() => {
        const scheduledDate = new Date(`${date}T${time}`)
        const now = new Date()

        // Validate: must be at least 1 minute in the future
        if (scheduledDate.getTime() <= now.getTime() + 60000) {
            setError(intl.formatMessage({
                id: 'ScheduledCommentPicker.error.tooSoon',
                defaultMessage: 'Scheduled time must be at least 1 minute in the future',
            }))
            return
        }

        // Validate: cannot be more than 30 days in the future
        const maxTime = now.getTime() + (30 * 24 * 60 * 60 * 1000)
        if (scheduledDate.getTime() > maxTime) {
            setError(intl.formatMessage({
                id: 'ScheduledCommentPicker.error.tooFar',
                defaultMessage: 'Scheduled time cannot be more than 30 days in the future',
            }))
            return
        }

        setError(null)
        onSchedule(scheduledDate.getTime())
    }, [date, time, onSchedule, intl])

    const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setDate(e.target.value)
        setError(null)
    }, [])

    const handleTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setTime(e.target.value)
        setError(null)
    }, [])

    return (
        <div className='ScheduledCommentPicker'>
            <div className='ScheduledCommentPicker__header'>
                {intl.formatMessage({
                    id: 'ScheduledCommentPicker.title',
                    defaultMessage: 'Schedule comment',
                })}
            </div>

            <div className='ScheduledCommentPicker__inputs'>
                <div className='ScheduledCommentPicker__field'>
                    <label htmlFor='scheduled-date'>
                        {intl.formatMessage({
                            id: 'ScheduledCommentPicker.date',
                            defaultMessage: 'Date',
                        })}
                    </label>
                    <input
                        id='scheduled-date'
                        type='date'
                        value={date}
                        min={minDate}
                        max={maxDate}
                        onChange={handleDateChange}
                    />
                </div>
                <div className='ScheduledCommentPicker__field'>
                    <label htmlFor='scheduled-time'>
                        {intl.formatMessage({
                            id: 'ScheduledCommentPicker.time',
                            defaultMessage: 'Time',
                        })}
                    </label>
                    <input
                        id='scheduled-time'
                        type='time'
                        value={time}
                        onChange={handleTimeChange}
                    />
                </div>
            </div>

            {error && (
                <div className='ScheduledCommentPicker__error'>
                    {error}
                </div>
            )}

            <div className='ScheduledCommentPicker__actions'>
                <Button onClick={onCancel}>
                    {intl.formatMessage({
                        id: 'ScheduledCommentPicker.cancel',
                        defaultMessage: 'Cancel',
                    })}
                </Button>
                <Button
                    filled={true}
                    onClick={handleSchedule}
                >
                    {intl.formatMessage({
                        id: 'ScheduledCommentPicker.schedule',
                        defaultMessage: 'Schedule',
                    })}
                </Button>
            </div>
        </div>
    )
}

export default React.memo(ScheduledCommentPicker)
