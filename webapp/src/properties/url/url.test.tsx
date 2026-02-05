// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React from 'react'
import {render, screen} from '@testing-library/react'

import {mocked} from 'jest-mock'

import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'

import {wrapIntl} from '../../testUtils'
import {TestBlockFactory} from '../../test/testBlockFactory'
import {Utils} from '../../utils'
import {sendFlashMessage} from '../../components/flashMessages'
import mutator from '../../mutator'

import UrlProperty from './property'
import Url from './url'

jest.mock('../../components/flashMessages')
jest.mock('../../mutator')

const mockedCopy = jest.spyOn(Utils, 'copyTextToClipboard').mockImplementation(() => true)
const mockedSendFlashMessage = mocked(sendFlashMessage, true)
const mockedMutator = mocked(mutator, true)

describe('properties/link', () => {
    beforeEach(jest.clearAllMocks)

    const board = TestBlockFactory.createBoard()
    const card = TestBlockFactory.createCard()
    const propertyTemplate = board.cardProperties[0]
    const baseData = {
        property: new UrlProperty(),
        card,
        board,
        propertyTemplate,
        readOnly: false,
        showEmptyPlaceholder: false,
    }

    it('should match snapshot for link with empty url', () => {
        const {container} = render(wrapIntl((
            <Url
                {...baseData}
                propertyValue=''
            />
        )))
        expect(container).toMatchSnapshot()
    })

    it('should match snapshot for link with non-empty url', () => {
        const {container} = render(wrapIntl((
            <Url
                {...baseData}
                propertyValue='https://github.com/mattermost/focalboard'
            />
        )))
        expect(container).toMatchSnapshot()
    })

    it('should match snapshot for readonly link with non-empty url', () => {
        const {container} = render(wrapIntl((
            <Url
                {...baseData}
                propertyValue='https://github.com/mattermost/focalboard'
                readOnly={true}
            />
        )))
        expect(container).toMatchSnapshot()
    })

    it('should change to link after entering url', async () => {
        render(
            wrapIntl(
                <Url
                    {...baseData}
                    propertyValue=''
                />,
            ),
        )

        const url = 'https://mattermost.com'
        const input = await screen.findByRole('textbox')
        await userEvent.type(input, `${url}{enter}`)

        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith(board.id, card, propertyTemplate.id, url)
    })

    it('should allow to edit link url', async () => {
        render(
            wrapIntl(
                <Url
                    {...baseData}
                    propertyValue='https://mattermost.com'
                />,
            ),
        )

        const editButton = await screen.findByRole('button', {name: 'Edit'})
        await userEvent.click(editButton)
        const newURL = 'https://github.com/mattermost'
        const input = await screen.findByRole('textbox')
        await userEvent.clear(input)
        await userEvent.type(input, `${newURL}{enter}`)
        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith(board.id, card, propertyTemplate.id, newURL)
    })

    it('should allow to copy url', async () => {
        const url = 'https://mattermost.com'
        render(
            wrapIntl(
                <Url
                    {...baseData}
                    propertyValue={url}
                />,
            ),
        )
        const copyButton = await screen.findByRole('button', {name: 'Copy'})
        await userEvent.click(copyButton)
        expect(mockedCopy).toHaveBeenCalledWith(url)
        expect(mockedSendFlashMessage).toHaveBeenCalledWith({content: 'Copied!', severity: 'high'})
    })
})
