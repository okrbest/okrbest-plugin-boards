// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render} from '@testing-library/react'
import '@testing-library/jest-dom'

import RootPortal from './rootPortal'

describe('components/RootPortal', () => {
    beforeEach(() => {
        // Quick fix to disregard console error when unmounting a component
        console.error = jest.fn()
    })

    test('should render portal content into document.body', () => {
        const {getByText} = render(
            <RootPortal>
                <div>{'Testing Portal'}</div>
            </RootPortal>,
        )

        expect(getByText('Testing Portal')).toBeVisible()
        expect(document.body.textContent).toContain('Testing Portal')
    })

    test('should remove portal element on unmount', () => {
        const {unmount} = render(
            <RootPortal>
                <div>{'Unmount Test'}</div>
            </RootPortal>,
        )

        expect(document.body.textContent).toContain('Unmount Test')
        unmount()
        expect(document.body.textContent).not.toContain('Unmount Test')
    })
})
