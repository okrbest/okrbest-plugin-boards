// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {wrapIntl} from '../testUtils'
import {IPropertyOption} from '../blocks/board'

import ValueSelector from './valueSelector'

// fixedOptions says "the board does not own these choices". Until 007 that also
// meant no menu at all, which took the colour picker with it — renaming a 본부 is
// the main server's business, but colouring one is the board's.
describe('widgets/valueSelector — the option menu', () => {
    const options: IPropertyOption[] = [
        {id: 'opt-1', value: '생산본부', color: 'propColorBlue'},
        {id: 'opt-2', value: '영업본부', color: 'propColorGreen'},
    ]

    // The option list is open from the start (defaultMenuIsOpen); what this
    // opens is the per-option menu behind each row.
    const optionMenuButtons = () => screen.queryAllByTitle('Open menu')

    const openOptionMenu = async () => {
        await userEvent.click(optionMenuButtons()[0])
    }

    const renderSelector = (props: Record<string, unknown>) => render(wrapIntl(
        <ValueSelector
            options={options}
            emptyValue=''
            onChange={jest.fn()}
            {...props}
        />,
    ))

    test('a board owned option keeps rename, delete and colour', async () => {
        renderSelector({
            onChangeColor: jest.fn(),
            onDeleteOption: jest.fn(),
            onStartRename: jest.fn(),
        })
        await openOptionMenu()

        expect(screen.queryByText('Rename')).not.toBeNull()
        expect(screen.queryByText('Delete')).not.toBeNull()
        expect(screen.queryByText('Blue')).not.toBeNull()
    })

    test('a fixed option with a colour handler offers colours only', async () => {
        renderSelector({fixedOptions: true, onChangeColor: jest.fn()})
        await openOptionMenu()

        expect(screen.queryByText('Blue')).not.toBeNull()
        expect(screen.queryByText('Rename')).toBeNull()
        expect(screen.queryByText('Delete')).toBeNull()
    })

    test('a fixed option without a colour handler offers no menu', async () => {
        // 006 and earlier. Nothing about the option can be changed from here.
        renderSelector({fixedOptions: true})

        expect(optionMenuButtons()).toHaveLength(0)
        expect(screen.queryByText('Blue')).toBeNull()
    })

    test('picking a colour reports the option and the palette key', async () => {
        const onChangeColor = jest.fn()
        renderSelector({fixedOptions: true, onChangeColor})
        await openOptionMenu()

        await userEvent.click(screen.getByText('Blue'))

        expect(onChangeColor).toHaveBeenCalledWith(options[0], 'propColorBlue')
    })

    test('offers a way back to the automatic colour when the caller allows it', async () => {
        const onClearColor = jest.fn()
        renderSelector({fixedOptions: true, onChangeColor: jest.fn(), onClearColor})
        await openOptionMenu()

        await userEvent.click(screen.getByText('Automatic colour'))

        expect(onClearColor).toHaveBeenCalledWith(options[0])
    })

    test('leaves the clear entry out when the caller does not pass one', async () => {
        renderSelector({fixedOptions: true, onChangeColor: jest.fn()})
        await openOptionMenu()

        expect(screen.queryByText('Automatic colour')).toBeNull()
    })
})
