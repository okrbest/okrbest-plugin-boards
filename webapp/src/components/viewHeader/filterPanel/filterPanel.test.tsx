// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'
import {mocked} from 'jest-mock'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'

import {TestBlockFactory} from '../../../test/testBlockFactory'
import mutator from '../../../mutator'
import {wrapIntl, mockStateStore} from '../../../testUtils'
import {FilterClause} from '../../../blocks/filterClause'
import {createFilterGroup} from '../../../blocks/filterGroup'

import FilterPanel from './filterPanel'

jest.mock('../../../mutator')
const mockedMutator = mocked(mutator, true)

const board = TestBlockFactory.createBoard()
const activeView = TestBlockFactory.createBoardView(board)

const state = {
    users: {
        me: {
            id: 'user-id-1',
            username: 'username_1',
        },
        boardUsers: {
            'user-id-1': {id: 'user-id-1', username: 'username_1'},
        },
    },
}

describe('components/viewHeader/filterPanel/filterPanel', () => {
    let store: ReturnType<typeof mockStateStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = mockStateStore([], state)

        // Reset board properties to defaults from TestBlockFactory
        board.cardProperties = []
        for (let i = 0; i < 3; i++) {
            board.cardProperties.push({
                id: `property${i + 1}`,
                name: `Property ${i + 1}`,
                type: 'select',
                options: [{id: 'value1', value: 'value 1', color: 'propColorBrown'}],
            })
        }

        // Reset filter to default from TestBlockFactory
        const filterGroup = createFilterGroup()
        const filter: FilterClause = {
            propertyId: 'property1',
            condition: 'includes',
            values: ['value1'],
        }
        filterGroup.filters.push(filter)
        activeView.fields.filter = filterGroup
    })

    test('should render property list with all filterable properties', () => {
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // All 3 select properties should appear in the property list
        expect(screen.getByText('Property 1')).toBeInTheDocument()
        expect(screen.getByText('Property 2')).toBeInTheDocument()
        expect(screen.getByText('Property 3')).toBeInTheDocument()
    })

    test('should auto-select first property with active filter and show its option values', () => {
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // Property 1 has an active filter, so it should be auto-selected
        // Its option value 'value 1' should be visible in the value panel
        expect(screen.getByText('value 1')).toBeInTheDocument()

        // The checkbox for 'value1' should be checked since the filter includes it
        const checkbox = screen.getByRole('checkbox', {name: /value 1/i})
        expect(checkbox).toHaveAttribute('aria-checked', 'true')
    })

    test('should show first property selected when no active filters exist', () => {
        // Clear all filters
        activeView.fields.filter = createFilterGroup()

        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // Property 1 should be auto-selected (first filterable property)
        // Its option 'value 1' should be shown
        expect(screen.getByText('value 1')).toBeInTheDocument()

        // The checkbox should be unchecked since there are no filters
        const checkbox = screen.getByRole('checkbox', {name: /value 1/i})
        expect(checkbox).toHaveAttribute('aria-checked', 'false')
    })

    test('should call mutator.changeViewFilter when clicking an option value', async () => {
        // Start with no filters so clicking will add a new clause
        activeView.fields.filter = createFilterGroup()

        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // Click on the option 'value 1' to toggle it
        const optionCheckbox = screen.getByRole('checkbox', {name: /value 1/i})
        await userEvent.click(optionCheckbox)

        expect(mockedMutator.changeViewFilter).toHaveBeenCalledTimes(1)
    })

    test('should show filter count badge for properties with active filters', () => {
        // Property 1 has a filter with 1 value selected
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // Property 1 should have a badge showing '1'
        const badge = screen.getByText('1')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('FilterPropertyList__item-badge')
    })

    test('should switch property when clicking a different property in the list', async () => {
        // Give Property 2 a distinct option
        board.cardProperties[1].options = [{id: 'opt2', value: 'Option Two', color: 'propColorGreen'}]

        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // Initially Property 1's option should be visible
        expect(screen.getByText('value 1')).toBeInTheDocument()

        // Click on Property 2
        const property2Button = screen.getByText('Property 2')
        await userEvent.click(property2Button)

        // Property 2's option should now be visible
        expect(screen.getByText('Option Two')).toBeInTheDocument()
    })

    test('should remove filter clause when unchecking the last selected value', async () => {
        // Property 1 has filter with 'value1' selected
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // Click on the checked option to uncheck it
        const checkbox = screen.getByRole('checkbox', {name: /value 1/i})
        expect(checkbox).toHaveAttribute('aria-checked', 'true')
        await userEvent.click(checkbox)

        // mutator.changeViewFilter should be called to remove the clause
        expect(mockedMutator.changeViewFilter).toHaveBeenCalledTimes(1)

        // The new filter group passed to mutator should have the clause removed
        const callArgs = mockedMutator.changeViewFilter.mock.calls[0]
        const newFilterGroup = callArgs[3]
        // When the last value is unchecked, the clause is removed entirely
        const remainingClauses = newFilterGroup.filters.filter(
            (f: FilterClause | Record<string, unknown>) => 'propertyId' in f && f.propertyId === 'property1',
        )
        expect(remainingClauses).toHaveLength(0)
    })

    test('should render empty state when board has no filterable properties', () => {
        // Remove all card properties
        board.cardProperties = []

        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        expect(screen.getByText('No filterable properties')).toBeInTheDocument()
    })

    test('should call onClose when Modal closes', async () => {
        const onClose = jest.fn()

        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={onClose}
                    />
                </ReduxProvider>,
            ),
        )

        // Modal has a close button for small screens
        const closeButton = screen.getByRole('button', {name: 'Close'})
        await userEvent.click(closeButton)
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
