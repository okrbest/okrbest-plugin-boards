// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'
import {render} from '@testing-library/react'
import configureStore from 'redux-mock-store'

import '@testing-library/jest-dom'
import {wrapDNDIntl} from '../../testUtils'

import 'isomorphic-fetch'

import {TestBlockFactory} from '../../test/testBlockFactory'

import {ColumnResizeProvider} from './tableColumnResizeContext'
import TableRow from './tableRow'

describe('components/table/TableRow', () => {
    const board = TestBlockFactory.createBoard()
    const view = TestBlockFactory.createBoardView(board)

    const view2 = TestBlockFactory.createBoardView(board)
    view2.fields.sortOptions = []

    const card = TestBlockFactory.createCard(board)
    const cardTemplate = TestBlockFactory.createCard(board)
    cardTemplate.fields.isTemplate = true

    const state = {
        users: {},
        comments: {
            comments: {},
        },
        contents: {
            contents: {},
        },
        cards: {
            cards: {
                [card.id]: card,
            },
        },
    }

    const mockStore = configureStore([])

    const Wrapper: React.FC<React.PropsWithChildren<unknown>> = ({children}) => {
        const store = mockStore(state)
        return wrapDNDIntl(
            <ColumnResizeProvider
                columnWidths={{}}
                onResizeColumn={jest.fn()}
            >
                <ReduxProvider store={store}>
                    {children}
                </ReduxProvider>
            </ColumnResizeProvider>,
        )
    }

    test('should match snapshot', async () => {
        const {container} = render(
            <Wrapper>
                <TableRow
                    board={board}
                    columnWidths={view.fields.columnWidths}
                    addCard={jest.fn()}
                    visiblePropertyIds={view.fields.visiblePropertyIds}
                    isManualSort={view.fields.sortOptions.length === 0}
                    groupById={view.fields.groupById}
                    isLastCard={false}
                    collapsedOptionIds={view.fields.collapsedOptionIds}
                    card={card}
                    isSelected={false}
                    focusOnMount={false}
                    showCard={jest.fn()}
                    readonly={false}
                    onDrop={jest.fn()}
                />
            </Wrapper>,
        )
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot, read-only', async () => {
        const {container} = render(
            <Wrapper>
                <TableRow
                    board={board}
                    card={card}
                    columnWidths={view.fields.columnWidths}
                    addCard={jest.fn()}
                    visiblePropertyIds={view.fields.visiblePropertyIds}
                    isManualSort={view.fields.sortOptions.length === 0}
                    groupById={view.fields.groupById}
                    isLastCard={false}
                    collapsedOptionIds={view.fields.collapsedOptionIds}
                    isSelected={false}
                    focusOnMount={false}
                    showCard={jest.fn()}
                    readonly={true}
                    onDrop={jest.fn()}
                />
            </Wrapper>,
        )
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot, isSelected', async () => {
        const {container} = render(
            <Wrapper>
                <TableRow
                    board={board}
                    card={card}
                    columnWidths={view.fields.columnWidths}
                    addCard={jest.fn()}
                    visiblePropertyIds={view.fields.visiblePropertyIds}
                    isManualSort={view.fields.sortOptions.length === 0}
                    groupById={view.fields.groupById}
                    isLastCard={false}
                    collapsedOptionIds={view.fields.collapsedOptionIds}
                    isSelected={true}
                    focusOnMount={false}
                    showCard={jest.fn()}
                    readonly={false}
                    onDrop={jest.fn()}
                />
            </Wrapper>,
        )
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot, collapsed tree', async () => {
        const {container} = render(
            <Wrapper>
                <TableRow
                    board={board}
                    card={card}
                    columnWidths={view.fields.columnWidths}
                    addCard={jest.fn()}
                    visiblePropertyIds={view.fields.visiblePropertyIds}
                    isManualSort={view.fields.sortOptions.length === 0}
                    groupById={view.fields.groupById}
                    isLastCard={false}
                    collapsedOptionIds={['value1']}
                    isSelected={false}
                    focusOnMount={false}
                    showCard={jest.fn()}
                    readonly={false}
                    onDrop={jest.fn()}
                />
            </Wrapper>,
        )
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot, display properties', async () => {
        const {container} = render(
            <Wrapper>
                <TableRow
                    board={board}
                    card={card}
                    visiblePropertyIds={['property1', 'property2']}
                    columnWidths={view.fields.columnWidths}
                    addCard={jest.fn()}
                    isManualSort={view.fields.sortOptions.length === 0}
                    groupById={view.fields.groupById}
                    collapsedOptionIds={view.fields.collapsedOptionIds}
                    isLastCard={false}
                    isSelected={false}
                    focusOnMount={false}
                    showCard={jest.fn()}
                    readonly={false}
                    onDrop={jest.fn()}
                />
            </Wrapper>,
        )
        expect(container).toMatchSnapshot()
    })

    test('should match snapshot, resizing column', async () => {
        const {container} = render(
            <Wrapper>
                <TableRow
                    board={board}
                    card={card}
                    visiblePropertyIds={['property1', 'property2']}
                    columnWidths={view.fields.columnWidths}
                    addCard={jest.fn()}
                    isManualSort={view.fields.sortOptions.length === 0}
                    groupById={view.fields.groupById}
                    isLastCard={false}
                    collapsedOptionIds={view.fields.collapsedOptionIds}
                    isSelected={false}
                    focusOnMount={false}
                    showCard={jest.fn()}
                    readonly={false}
                    onDrop={jest.fn()}
                />
            </Wrapper>,
        )
        expect(container).toMatchSnapshot()
    })

    test('adds hidden class for collapsed multiSelect group key', async () => {
        const groupedBoard = TestBlockFactory.createBoard()
        const multiSelectProperty = {
            id: 'multi-select-property-id',
            name: 'Multi Select',
            type: 'multiSelect',
            options: [
                {id: 'opt-a', value: 'A', color: 'propColorGray'},
                {id: 'opt-b', value: 'B', color: 'propColorGray'},
            ],
        }
        groupedBoard.cardProperties.push(multiSelectProperty)

        const groupedCard = TestBlockFactory.createCard(groupedBoard)
        groupedCard.fields.properties[multiSelectProperty.id] = ['opt-b', 'opt-a']

        const {container} = render(
            <Wrapper>
                <TableRow
                    board={groupedBoard}
                    card={groupedCard}
                    columnWidths={view.fields.columnWidths}
                    addCard={jest.fn()}
                    visiblePropertyIds={view.fields.visiblePropertyIds}
                    isManualSort={view.fields.sortOptions.length === 0}
                    groupById={multiSelectProperty.id}
                    isLastCard={false}
                    collapsedOptionIds={['opt-a,opt-b']}
                    isSelected={false}
                    focusOnMount={false}
                    showCard={jest.fn()}
                    readonly={false}
                    onDrop={jest.fn()}
                />
            </Wrapper>,
        )

        expect(container.querySelector('.TableRow')).toHaveClass('hidden')
    })

    test('adds hidden class for collapsed card property group key', async () => {
        const groupedBoard = TestBlockFactory.createBoard()
        const cardProperty = {
            id: 'card-property-id',
            name: 'Linked Card',
            type: 'card',
            options: [{id: 'linked-board-id', value: 'Linked Board', color: 'propColorGray'}],
        }
        groupedBoard.cardProperties.push(cardProperty)

        const groupedCard = TestBlockFactory.createCard(groupedBoard)
        groupedCard.fields.properties[cardProperty.id] = JSON.stringify({
            boardId: 'linked-board-id',
            cards: [
                {id: 'card-b', title: 'Card B'},
                {id: 'card-a', title: 'Card A'},
            ],
        })

        const collapsedGroupID = JSON.stringify({
            boardId: 'linked-board-id',
            cards: [
                {id: 'card-a', title: 'Card A'},
                {id: 'card-b', title: 'Card B'},
            ],
        })

        const {container} = render(
            <Wrapper>
                <TableRow
                    board={groupedBoard}
                    card={groupedCard}
                    columnWidths={view.fields.columnWidths}
                    addCard={jest.fn()}
                    visiblePropertyIds={view.fields.visiblePropertyIds}
                    isManualSort={view.fields.sortOptions.length === 0}
                    groupById={cardProperty.id}
                    isLastCard={false}
                    collapsedOptionIds={[collapsedGroupID]}
                    isSelected={false}
                    focusOnMount={false}
                    showCard={jest.fn()}
                    readonly={false}
                    onDrop={jest.fn()}
                />
            </Wrapper>,
        )

        expect(container.querySelector('.TableRow')).toHaveClass('hidden')
    })
})
