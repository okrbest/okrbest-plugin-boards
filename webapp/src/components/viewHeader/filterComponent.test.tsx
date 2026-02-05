// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'

import {mocked} from 'jest-mock'
import '@testing-library/jest-dom'

import userEvent from '@testing-library/user-event'

import {FilterClause} from '../../blocks/filterClause'

import {TestBlockFactory} from '../../test/testBlockFactory'
import mutator from '../../mutator'

import {wrapIntl, mockStateStore} from '../../testUtils'

import FilterComponenet from './filterComponent'

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

const board = TestBlockFactory.createBoard()
const activeView = TestBlockFactory.createBoardView(board)

const filter: FilterClause = {
    propertyId: board.cardProperties[0].id,
    condition: 'includes',
    values: ['Status'],
}
const unknownFilter: FilterClause = {
    propertyId: 'unknown',
    condition: 'includes',
    values: [],
}

const state = {
    users: {
        me: {
            id: 'user-id-1',
            username: 'username_1',
        },
    },
}
const store = mockStateStore([], state)
describe('components/viewHeader/filterComponent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        board.cardProperties[0].options = [{id: 'Status', value: 'Status', color: ''}]
        activeView.fields.filter.filters = [filter]
    })
    test('return filterComponent', async () => {
         const {container} = render(
             wrapIntl(
                 <ReduxProvider store={store}>
                     <FilterComponenet
                         board={board}
                         activeView={activeView}
                         onClose={jest.fn()}
                     />
                 </ReduxProvider>,
             ),
         )
         const buttonElements = await screen.findAllByRole('button', {name: 'menuwrapper'})
         userEvent.click(buttonElements[0])
         expect(container).toMatchSnapshot()
     })
    test('return filterComponent and add Filter', async () => {
         const {container} = render(
             wrapIntl(
                 <ReduxProvider store={store}>
                     <FilterComponenet
                         board={board}
                         activeView={activeView}
                         onClose={jest.fn()}
                     />
                 </ReduxProvider>,
             ),
         )
         const buttonElements = await screen.findAllByRole('button', {name: 'menuwrapper'})
         userEvent.click(buttonElements[0])
         expect(container).toMatchSnapshot()
         const buttonAdd = await screen.findByText('+ Add filter')
         userEvent.click(buttonAdd)
         expect(mockedMutator.changeViewFilter).toBeCalledTimes(1)
     })

    test('return filterComponent and filter by status', async () => {
         activeView.fields.filter.filters = [unknownFilter]
         const {container} = render(
             wrapIntl(
                 <ReduxProvider store={store}>
                     <FilterComponenet
                         board={board}
                         activeView={activeView}
                         onClose={jest.fn()}
                     />
                 </ReduxProvider>,
             ),
         )
         const buttonElements = await screen.findAllByRole('button', {name: 'menuwrapper'})
         userEvent.click(buttonElements[0])
         expect(container).toMatchSnapshot()
         const buttonStatus = await screen.findByRole('button', {name: 'Status'})
         userEvent.click(buttonStatus)
         expect(mockedMutator.changeViewFilter).toBeCalledTimes(1)
     })

    test('return filterComponent and click is empty', async () => {
         const {container} = render(
             wrapIntl(
                 <ReduxProvider store={store}>
                     <FilterComponenet
                         board={board}
                         activeView={activeView}
                         onClose={jest.fn()}
                     />
                 </ReduxProvider>,
             ),
         )
         const buttonElements = await screen.findAllByRole('button', {name: 'menuwrapper'})
         userEvent.click(buttonElements[1])
         expect(container).toMatchSnapshot()
         const buttonNotInclude = await screen.findByRole('button', {name: 'is empty'})
         userEvent.click(buttonNotInclude)
         expect(mockedMutator.changeViewFilter).toBeCalledTimes(1)
     })
})
