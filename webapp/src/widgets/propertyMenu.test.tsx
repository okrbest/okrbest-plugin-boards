// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {Provider} from 'react-redux'
import '@testing-library/jest-dom'

import {mockStateStore, wrapIntl} from '../testUtils'
import propsRegistry from '../properties'

import PropertyMenu from './propertyMenu'

describe('widgets/PropertyMenu', () => {
    const mockStore = mockStateStore([], {
        teams: {
            currentId: 'team-id',
        },
        boards: {
            current: 'board-id',
            boards: {
                'board-id': {
                    id: 'board-id',
                    cardProperties: [],
                },
            },
        },
    })

    beforeEach(() => {
        // Quick fix to disregard console error when unmounting a component
        console.error = jest.fn()
        document.execCommand = jest.fn()
        baseProps.onTypeAndNameChanged.mockClear()
        baseProps.onDelete.mockClear()
    })

    const baseProps = {
        propertyId: 'id',
        propertyName: 'email of a person',
        propertyType: propsRegistry.get('email'),
        onTypeAndNameChanged: jest.fn(),
        onDelete: jest.fn(),
    }

    test('should display the type of property', () => {
        const callback = jest.fn()
        const component = wrapIntl(
            <Provider store={mockStore}>
                <PropertyMenu
                    {...baseProps}
                    onTypeAndNameChanged={callback}
                    onDelete={callback}
                />
            </Provider>,
        )
        const {getByText} = render(component)
        expect(getByText('Type: Email')).toBeVisible()
    })

    test('handles delete event', () => {
        const callback = jest.fn()
        const component = wrapIntl(
            <Provider store={mockStore}>
                <PropertyMenu
                    {...baseProps}
                    onTypeAndNameChanged={callback}
                    onDelete={callback}
                />
            </Provider>,
        )
        const {getByText} = render(component)
        fireEvent.click(getByText(/delete/i))
        expect(callback).toHaveBeenCalledWith('id')
    })

    test('handles name change event', () => {
        const callback = jest.fn()
        const component = wrapIntl(
            <Provider store={mockStore}>
                <PropertyMenu
                    {...baseProps}
                    propertyName={'test-property'}
                    propertyType={propsRegistry.get('text')}
                    onTypeAndNameChanged={callback}
                />
            </Provider>,
        )
        const {getByDisplayValue} = render(component)
        const input = getByDisplayValue(/test-property/i)
        fireEvent.change(input, {target: {value: 'changed name'}})
        fireEvent.blur(input)
        expect(callback).toHaveBeenCalledWith(propsRegistry.get('text'), 'changed name')
    })

    test('handles type change event', async () => {
        const callback = jest.fn()
        const component = wrapIntl(
            <Provider store={mockStore}>
                <PropertyMenu
                    {...baseProps}
                    propertyName={'test-property'}
                    propertyType={propsRegistry.get('text')}
                    onTypeAndNameChanged={callback}
                />
            </Provider>,
        )
        const {getByText} = render(component)
        const menuOpen = getByText(/Type: Text/i)
        fireEvent.click(menuOpen)
        fireEvent.click(getByText('Select'))
        setTimeout(() => expect(callback).toHaveBeenCalledWith('select', 'test-property'), 2000)
    })

    test('handles name and type change event', () => {
        const callback = jest.fn()
        const component = wrapIntl(
            <Provider store={mockStore}>
                <PropertyMenu
                    {...baseProps}
                    propertyName={'test-property'}
                    propertyType={propsRegistry.get('text')}
                    onTypeAndNameChanged={callback}
                />
            </Provider>,
        )
        const {getByDisplayValue, getByText} = render(component)
        const input = getByDisplayValue(/test-property/i)
        fireEvent.change(input, {target: {value: 'changed name'}})

        const menuOpen = getByText(/Type: Text/i)
        fireEvent.click(menuOpen)
        fireEvent.click(getByText('Select'))
        setTimeout(() => expect(callback).toHaveBeenCalledWith('select', 'changed name'), 2000)
    })

    test('should match snapshot', () => {
        const callback = jest.fn()
        const component = wrapIntl(
            <Provider store={mockStore}>
                <PropertyMenu
                    {...baseProps}
                    propertyName={'test-property'}
                    propertyType={propsRegistry.get('text')}
                    onTypeAndNameChanged={callback}
                />
            </Provider>,
        )
        const {container, getByText} = render(component)
        const menuOpen = getByText(/Type: Text/i)
        fireEvent.click(menuOpen)
        expect(container).toMatchSnapshot()
    })

    // The narrowing only makes sense where a person is chosen, so the switch
    // stays off every other property type.
    describe('organisation link switch', () => {
        const renderMenu = (type: string, orgScoped?: boolean, onOrgScopedChanged = jest.fn()) => {
            const component = wrapIntl(
                <Provider store={mockStore}>
                    <PropertyMenu
                        {...baseProps}
                        propertyType={propsRegistry.get(type as never)}
                        orgScoped={orgScoped}
                        onOrgScopedChanged={onOrgScopedChanged}
                    />
                </Provider>,
            )
            return render(component)
        }

        test('offers the switch on a person property', () => {
            const {queryByText} = renderMenu('person')
            expect(queryByText('Link to organisation')).not.toBeNull()
        })

        test('offers the switch on a multiPerson property', () => {
            const {queryByText} = renderMenu('multiPerson')
            expect(queryByText('Link to organisation')).not.toBeNull()
        })

        test('hides the switch on other property types', () => {
            const {queryByText} = renderMenu('email')
            expect(queryByText('Link to organisation')).toBeNull()
        })

        test('reports the flag turning off', () => {
            const callback = jest.fn()
            const {getByText} = renderMenu('person', undefined, callback)

            fireEvent.click(getByText('Link to organisation'))

            expect(callback).toHaveBeenCalledWith(false)
        })

        test('reports the flag turning on', () => {
            const callback = jest.fn()
            const {getByText} = renderMenu('person', false, callback)

            fireEvent.click(getByText('Link to organisation'))

            expect(callback).toHaveBeenCalledWith(true)
        })
    })
})
