// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'

import {TestBlockFactory} from '../../test/testBlockFactory'
import {wrapIntl} from '../../testUtils'

import ViewTab from './viewTab'

const board = TestBlockFactory.createBoard()

describe('components/viewHeader/viewTab', () => {
    const view = TestBlockFactory.createBoardView(board)
    view.title = 'Test View'
    view.fields.viewType = 'board'

    test('renders inactive tab with icon and name', () => {
        const {container} = render(
            wrapIntl(
                <ViewTab
                    view={view}
                    isActive={false}
                    readonly={false}
                    onClick={jest.fn()}
                />,
            ),
        )
        expect(screen.getByText('Test View')).toBeInTheDocument()
        expect(container.querySelector('.ViewTab')).toBeInTheDocument()
        expect(container.querySelector('.ViewTab--active')).not.toBeInTheDocument()
    })

    test('renders active tab with active class', () => {
        const {container} = render(
            wrapIntl(
                <ViewTab
                    view={view}
                    isActive={true}
                    readonly={false}
                    onClick={jest.fn()}
                />,
            ),
        )
        expect(container.querySelector('.ViewTab--active')).toBeInTheDocument()
    })

    test('calls onClick when clicked', () => {
        const onClick = jest.fn()
        render(
            wrapIntl(
                <ViewTab
                    view={view}
                    isActive={false}
                    readonly={false}
                    onClick={onClick}
                />,
            ),
        )
        fireEvent.click(screen.getByText('Test View'))
        expect(onClick).toHaveBeenCalled()
    })
})
