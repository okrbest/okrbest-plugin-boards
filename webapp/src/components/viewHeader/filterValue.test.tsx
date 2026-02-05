// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render, screen, waitFor, act} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'

import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'

import {mocked} from 'jest-mock'

import {FilterClause} from '../../blocks/filterClause'
import {IPropertyTemplate} from '../../blocks/board'

import {TestBlockFactory} from '../../test/testBlockFactory'

import {wrapIntl, mockStateStore} from '../../testUtils'

import mutator from '../../mutator'
import propsRegistry from '../../properties'

import FilterValue from './filterValue'

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

const board = TestBlockFactory.createBoard()
const activeView = TestBlockFactory.createBoardView(board)
const state = {
    users: {
        me: {
            id: 'user-id-1',
            username: 'username_1',
        },
    },
}
const store = mockStateStore([], state)
const filter: FilterClause = {
    propertyId: '1',
    condition: 'includes',
    values: ['Status'],
}

describe('components/viewHeader/filterValue', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        board.cardProperties[0].options = [{id: 'Status', value: 'Status', color: ''}]
        activeView.fields.filter.filters = [filter]
    })
    test('return filterValue', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterValue
                        view={activeView}
                        filter={filter}
                        template={board.cardProperties[0]}
                        propertyType={propsRegistry.get(board.cardProperties[0].type)}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'menuwrapper'})
        await act(async () => {
            userEvent.click(buttonElement)
        })
        expect(container).toMatchSnapshot()
    })
    test('return filterValue and click Status', async () => {
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterValue
                        view={activeView}
                        filter={filter}
                        template={board.cardProperties[0]}
                        propertyType={propsRegistry.get(board.cardProperties[0].type)}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'menuwrapper'})
        await act(async () => {
            userEvent.click(buttonElement)
        })
        const switchStatus = (await screen.findAllByText('Status'))[1]
        await act(async () => {
            userEvent.click(switchStatus)
        })
        expect(mockedMutator.changeViewFilter).toBeCalledTimes(1)
        expect(container).toMatchSnapshot()
    })
    test('return filterValue and click Status with Status not in filter', async () => {
        filter.values = ['test']
        activeView.fields.filter.filters = [filter]
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterValue
                        view={activeView}
                        filter={filter}
                        template={board.cardProperties[0]}
                        propertyType={propsRegistry.get(board.cardProperties[0].type)}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: 'menuwrapper'})
        await act(async () => {
            userEvent.click(buttonElement)
        })
        const switchStatus = (await screen.findAllByText('Status'))[0]
        await act(async () => {
            userEvent.click(switchStatus)
        })
        expect(mockedMutator.changeViewFilter).toBeCalledTimes(1)
        expect(container).toMatchSnapshot()
    })
    test('return filterValue and verify that menu is not closed after clicking on the item', async () => {
        filter.values = []
        activeView.fields.filter.filters = [filter]
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterValue
                        view={activeView}
                        filter={filter}
                        template={board.cardProperties[0]}
                        propertyType={propsRegistry.get(board.cardProperties[0].type)}
                    />
                </ReduxProvider>,
            ),
        )
        const buttonElement = await screen.findByRole('button', {name: '(empty)'})
        await act(async () => {
            userEvent.click(buttonElement)
        })

        const switchStatus = await screen.findByRole('button', {name: 'Status'})
        await act(async () => {
            userEvent.click(switchStatus)
        })
        expect(switchStatus).toBeInTheDocument()
    })

    test('return date filter value', async () => {
        const propertyTemplate: IPropertyTemplate = {
            id: 'datePropertyID',
            name: 'My Date Property',
            type: 'date',
            options: [],
        }
        board.cardProperties.push(propertyTemplate)

        const dateFilter: FilterClause = {
            propertyId: 'datePropertyID',
            condition: 'is',
            values: [],
        }

        // filter.values = []
        activeView.fields.filter.filters = [dateFilter]
        const {container} = render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterValue
                        view={activeView}
                        filter={filter}
                        template={propertyTemplate}
                        propertyType={propsRegistry.get(propertyTemplate.type)}
                    />
                </ReduxProvider>,
            ),
        )
        expect(container).toMatchSnapshot()

        const buttonElement = await screen.findByRole('button', {name: 'Empty'})
        await act(async () => {
            userEvent.click(buttonElement)
        })

        // make sure modal is displayed
        const clearButton = await screen.findByRole('button', {name: 'Clear'})
        expect(clearButton).toBeInTheDocument()
    })
})
