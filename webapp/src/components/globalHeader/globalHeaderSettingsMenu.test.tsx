// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {Provider as ReduxProvider} from 'react-redux'

import {render, screen, fireEvent} from '@testing-library/react'

import userEvent from '@testing-library/user-event'
import configureStore from 'redux-mock-store'

import {mocked} from 'jest-mock'

import {wrapIntl} from '../../testUtils'

import TelemetryClient, {TelemetryCategory, TelemetryActions} from '../../telemetry/telemetryClient'

import client from '../../octoClient'

import GlobalHeaderSettingsMenu from './globalHeaderSettingsMenu'

jest.mock('../../telemetry/telemetryClient')
jest.mock('../../octoClient')
const mockedTelemetry = mocked(TelemetryClient, true)
const mockedOctoClient = mocked(client, true)

describe('components/sidebar/GlobalHeaderSettingsMenu', () => {
    const mockStore = configureStore([])
    let store = mockStore({})
    beforeEach(() => {
        store = mockStore({
            teams: {
                current: {id: 'team_id_1'},
            },
            boards: {
                current: 'board_id',
                boards: {
                    board_id: {id: 'board_id'},
                },
                myBoardMemberships: {
                    board_id: {userId: 'user_id_1', schemeAdmin: true},
                },
            },
            users: {
                me: {
                    id: 'user-id',
                },
            },
        })
    })
    test('settings menu closed should match snapshot', () => {
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <GlobalHeaderSettingsMenu/>
            </ReduxProvider>,
        )

        const {container} = render(component)
        expect(container).toMatchSnapshot()
    })

    test('settings menu open should match snapshot', async () => {
        const user = userEvent.setup()
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <GlobalHeaderSettingsMenu/>
            </ReduxProvider>,
        )

        const {container} = render(component)
        await user.click(container.querySelector('.menu-entry') as Element)
        expect(container).toMatchSnapshot()
    })

    test('languages menu open should match snapshot', async () => {
        const user = userEvent.setup()
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <GlobalHeaderSettingsMenu/>
            </ReduxProvider>,
        )

        const {container} = render(component)
        await user.click(container.querySelector('.menu-entry') as Element)
        await user.click(container.querySelector('#lang') as Element)
        expect(container).toMatchSnapshot()
    })

    test('imports menu open should match snapshot', async () => {
        const user = userEvent.setup()
        window.open = jest.fn()
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <GlobalHeaderSettingsMenu/>
            </ReduxProvider>,
        )

        const {container} = render(component)
        await user.click(container.querySelector('.menu-entry') as Element)
        await user.click(container.querySelector('#import') as Element)
        expect(container).toMatchSnapshot()

        const asanaButton = await screen.findByRole('button', {name: 'Asana'})
        await user.click(asanaButton)
        expect(mockedTelemetry.trackEvent).toBeCalledWith(TelemetryCategory, TelemetryActions.ImportAsana)
    })

    test('Product Tour option restarts the tour', async () => {
        const user = userEvent.setup()
        const component = wrapIntl(
            <ReduxProvider store={store}>
                <GlobalHeaderSettingsMenu/>
            </ReduxProvider>,
        )

        const {container} = render(component)
        await user.click(container.querySelector('.menu-entry') as Element)
        await user.click(container.querySelector('.product-tour') as Element)

        expect(mockedOctoClient.patchUserConfig).toBeCalledWith('user-id', {
            updatedFields: {
                onboardingTourStarted: '1',
                onboardingTourStep: '0',
                tourCategory: 'onboarding',
            },
        })
    })
})
