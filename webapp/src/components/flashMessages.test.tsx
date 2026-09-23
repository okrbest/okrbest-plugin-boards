// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'

import {render, act, screen, fireEvent} from '@testing-library/react'

import '@testing-library/jest-dom'

import userEvent from '@testing-library/user-event'

import {wrapIntl} from '../testUtils'

import {FlashMessages, sendFlashMessage} from './flashMessages'

jest.mock('../mutator')

beforeEach(() => {
    jest.useFakeTimers()
})

afterEach(() => {
    jest.clearAllTimers()
})

describe('components/flashMessages', () => {
    test('renders a flash message with high severity', () => {
        const {container} = render(
            wrapIntl(<FlashMessages milliseconds={200}/>),
        )

        /**
         * Check for high severity
         */

        act(() => {
            sendFlashMessage({content: 'Mock Content', severity: 'high'})
        })

        expect(container).toMatchSnapshot()

        act(() => {
            jest.advanceTimersByTime(200)
        })

        expect(screen.queryByText('Mock Content')).toBeNull()
    })

    test('renders a flash message with normal severity', () => {
        const {container} = render(
            wrapIntl(<FlashMessages milliseconds={200}/>),
        )

        act(() => {
            sendFlashMessage({content: 'Mock Content', severity: 'normal'})
        })

        expect(screen.getByText('Mock Content')).toHaveClass('normal')

        expect(container).toMatchSnapshot()

        act(() => {
            jest.advanceTimersByTime(200)
        })

        expect(screen.queryByText('Mock Content')).toBeNull()
    })

    test('renders a flash message with low severity', () => {
        const {container} = render(
            wrapIntl(<FlashMessages milliseconds={200}/>),
        )

        act(() => {
            sendFlashMessage({content: 'Mock Content', severity: 'low'})
        })

        expect(screen.getByText('Mock Content')).toHaveClass('low')

        expect(container).toMatchSnapshot()

        act(() => {
            jest.advanceTimersByTime(200)
        })

        expect(screen.queryByText('Mock Content')).toBeNull()
    })

    test('renders a flash message with low severity and custom HTML in flash message', () => {
        const {container} = render(
            wrapIntl(<FlashMessages milliseconds={200}/>),
        )

        act(() => {
            sendFlashMessage({content: <div data-testid='mock-test-id'>{'Mock Content'}</div>, severity: 'low'})
        })

        expect(screen.getByTestId('mock-test-id')).toBeVisible()

        expect(container).toMatchSnapshot()

        act(() => {
            jest.advanceTimersByTime(200)
        })

        expect(screen.queryByText('Mock Content')).toBeNull()
    })

    test('renders a flash message with low severity and check onClick on flash works', async () => {
        const {container} = render(
            wrapIntl(<FlashMessages milliseconds={200}/>),
        )

        act(() => {
            sendFlashMessage({content: 'Mock Content', severity: 'low'})
        })

        await userEvent.click(screen.getByText('Mock Content'))

        expect(container).toMatchSnapshot()

        act(() => {
            jest.advanceTimersByTime(200)
        })

        expect(screen.queryByText('Mock Content')).toBeNull()
    })
    // --- 016: 동작 버튼과 개별 표시 시간 (contracts/unhide-flow.md F-04·F-05) ---

    test('renders an action button when the message carries an action', () => {
        render(wrapIntl(<FlashMessages milliseconds={200}/>))

        act(() => {
            sendFlashMessage({content: 'Hidden', severity: 'low', action: {label: 'Undo', onClick: jest.fn()}})
        })

        expect(screen.getByRole('button', {name: 'Undo'})).toBeInTheDocument()
    })

    test('action click runs onClick, closes the message, and does not bubble past the message', () => {
        const onClick = jest.fn()
        const outerClick = jest.fn()
        render(wrapIntl(
            <div onClick={outerClick}>
                <FlashMessages milliseconds={200}/>
            </div>,
        ))

        act(() => {
            sendFlashMessage({content: 'Hidden', severity: 'low', action: {label: 'Undo', onClick}})
        })

        fireEvent.click(screen.getByRole('button', {name: 'Undo'}))

        expect(onClick).toHaveBeenCalledTimes(1)
        expect(outerClick).not.toHaveBeenCalled()

        act(() => {
            jest.advanceTimersByTime(200)
        })
        expect(screen.queryByText('Hidden')).toBeNull()
    })

    test('durationMs keeps a message visible longer than the default', () => {
        render(wrapIntl(<FlashMessages milliseconds={200}/>))

        act(() => {
            sendFlashMessage({content: 'Slow', severity: 'low', durationMs: 500})
        })

        act(() => {
            jest.advanceTimersByTime(250)
        })
        expect(screen.getByText('Slow')).toBeInTheDocument()

        act(() => {
            jest.advanceTimersByTime(250)
        })
        expect(screen.queryByText('Slow')).toBeNull()
    })

    test('renders no button when the message has no action (guard: markup unchanged)', () => {
        const {container} = render(wrapIntl(<FlashMessages milliseconds={200}/>))

        act(() => {
            sendFlashMessage({content: 'Plain', severity: 'low'})
        })

        expect(container.querySelector('button')).toBeNull()
    })

    test('a new message replaces the previous one and its timer', () => {
        render(wrapIntl(<FlashMessages milliseconds={200}/>))

        act(() => {
            sendFlashMessage({content: 'First', severity: 'low'})
        })
        act(() => {
            sendFlashMessage({content: 'Second', severity: 'low', durationMs: 5200})
        })

        expect(screen.queryByText('First')).toBeNull()
        expect(screen.getByText('Second')).toBeInTheDocument()

        // 앞 메시지의 200ms 타이머가 남아 있으면 여기서 사라진다
        act(() => {
            jest.advanceTimersByTime(300)
        })
        expect(screen.getByText('Second')).toBeInTheDocument()

        act(() => {
            jest.advanceTimersByTime(4900)
        })
        expect(screen.queryByText('Second')).toBeNull()
    })
})
