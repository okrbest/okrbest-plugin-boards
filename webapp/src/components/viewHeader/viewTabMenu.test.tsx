// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'

import {wrapIntl} from '../../testUtils'

import ViewTabMenu from './viewTabMenu'

describe('components/viewHeader/viewTabMenu', () => {
    test('renders menu items', () => {
        render(
            wrapIntl(
                <ViewTabMenu
                    onRename={jest.fn()}
                    onDuplicate={jest.fn()}
                    onDelete={jest.fn()}
                    onClose={jest.fn()}
                    canDelete={true}
                />,
            ),
        )
        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.getByText('Duplicate view')).toBeInTheDocument()
        expect(screen.getByText('Delete view')).toBeInTheDocument()
    })

    test('hides delete when canDelete is false', () => {
        render(
            wrapIntl(
                <ViewTabMenu
                    onRename={jest.fn()}
                    onDuplicate={jest.fn()}
                    onDelete={jest.fn()}
                    onClose={jest.fn()}
                    canDelete={false}
                />,
            ),
        )
        expect(screen.queryByText('Delete view')).not.toBeInTheDocument()
    })

    test('calls onRename when rename clicked', () => {
        const onRename = jest.fn()
        render(
            wrapIntl(
                <ViewTabMenu
                    onRename={onRename}
                    onDuplicate={jest.fn()}
                    onDelete={jest.fn()}
                    onClose={jest.fn()}
                    canDelete={true}
                />,
            ),
        )
        fireEvent.click(screen.getByText('Rename'))
        expect(onRename).toHaveBeenCalled()
    })

    test('calls onDuplicate when duplicate clicked', () => {
        const onDuplicate = jest.fn()
        render(
            wrapIntl(
                <ViewTabMenu
                    onRename={jest.fn()}
                    onDuplicate={onDuplicate}
                    onDelete={jest.fn()}
                    onClose={jest.fn()}
                    canDelete={true}
                />,
            ),
        )
        fireEvent.click(screen.getByText('Duplicate view'))
        expect(onDuplicate).toHaveBeenCalled()
    })

    test('calls onDelete when delete clicked', () => {
        const onDelete = jest.fn()
        render(
            wrapIntl(
                <ViewTabMenu
                    onRename={jest.fn()}
                    onDuplicate={jest.fn()}
                    onDelete={onDelete}
                    onClose={jest.fn()}
                    canDelete={true}
                />,
            ),
        )
        fireEvent.click(screen.getByText('Delete view'))
        expect(onDelete).toHaveBeenCalled()
    })
})
