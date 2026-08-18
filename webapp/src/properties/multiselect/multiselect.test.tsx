// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'
import {mocked} from 'jest-mock'

import {Board, IPropertyOption, IPropertyTemplate, createBoard} from '../../blocks/board'
import {createCard} from '../../blocks/card'
import {Provider as ReduxProvider} from 'react-redux'
import configureStore from 'redux-mock-store'
import mutator from '../../mutator'

import MultiSelectProperty from './property'
import MultiSelect from './multiselect'

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

function buildMultiSelectPropertyTemplate(options: IPropertyOption[] = []): IPropertyTemplate {
    return {
        id: 'multiselect-template-1',
        name: 'Multi',
        options: [
            {
                color: 'propColorDefault',
                id: 'multi-option-1',
                value: 'a',
            },
            {
                color: '',
                id: 'multi-option-2',
                value: 'b',
            },
            {
                color: 'propColorDefault',
                id: 'multi-option-3',
                value: 'c',
            },
            ...options,
        ],
        type: 'multiSelect',
    }
}

type WrapperProps = {
    children?: React.ReactNode
}

// 판정 훅이 팀과 보드 멤버십을 읽는다. 기본은 보드 관리자 — 잠금을 다루는 테스트만
// 자기 스토어를 따로 세운다.
const storeFor = (b: Board, membership: Record<string, unknown>) => configureStore([])({
    teams: {current: {id: 'team-1'}},
    boards: {current: b.id, boards: {[b.id]: b}, myBoardMemberships: {[b.id]: membership}},
    users: {me: {id: 'user-1'}},
})

const board = createBoard()
board.teamId = 'team-1'

const Wrapper = ({children}: WrapperProps) => {
    return (
        <ReduxProvider store={storeFor(board, {userId: 'user-1', schemeAdmin: true})}>
            <IntlProvider locale='en'><>{children}</></IntlProvider>
        </ReduxProvider>
    )
}

describe('properties/multiSelect', () => {
    const nonEditableMultiSelectTestId = 'multiselect-non-editable'

    const card = createCard()

    const expectOptionsMenuToBeVisible = (template: IPropertyTemplate) => {
        for (const option of template.options) {
            expect(screen.getByRole('menuitem', {name: option.value})).toBeInTheDocument()
        }
    }

    beforeEach(() => {
        jest.resetAllMocks()
    })

    it('shows only the selected options when menu is not opened', () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()
        const propertyValue = ['multi-option-1', 'multi-option-2']

        const {container} = render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={true}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={propertyValue}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        const multiSelectParent = screen.getByTestId(nonEditableMultiSelectTestId)

        expect(multiSelectParent.children.length).toBe(propertyValue.length)

        expect(container).toMatchSnapshot()
    })

    it('opens editable multi value selector menu when the button/label is clicked', async () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()

        render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={[]}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))

        expect(await screen.findByRole('combobox', {name: /value selector/i})).toBeInTheDocument()
    })

    it('can select a option', async () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()
        const propertyValue = ['multi-option-1']

        render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={propertyValue}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))

        await userEvent.type(await screen.findByRole('combobox', {name: /value selector/i}), 'b{enter}')

        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith(board.id, card, propertyTemplate.id, ['multi-option-1', 'multi-option-2'])
        expectOptionsMenuToBeVisible(propertyTemplate)
    })

    it('can unselect a option', async () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()
        const propertyValue = ['multi-option-1', 'multi-option-2']

        render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={propertyValue}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))

        await userEvent.click((await screen.findAllByRole('button', {name: /clear/i}))[0])

        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith(board.id, card, propertyTemplate.id, ['multi-option-2'])
        expectOptionsMenuToBeVisible(propertyTemplate)
    })

    it('can unselect a option via backspace', async () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()
        const propertyValue = ['multi-option-1', 'multi-option-2']

        render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={propertyValue}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))

        await userEvent.type(await screen.findByRole('combobox', {name: /value selector/i}), '{backspace}')

        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith(board.id, card, propertyTemplate.id, ['multi-option-1'])
        expectOptionsMenuToBeVisible(propertyTemplate)
    })

    it('can close menu on escape', async () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()
        const propertyValue = ['multi-option-1', 'multi-option-2']

        render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={propertyValue}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))

        await userEvent.type(await screen.findByRole('combobox', {name: /value selector/i}), '{escape}')

        for (const option of propertyTemplate.options) {
            expect(screen.queryByRole('menuitem', {name: option.value})).toBeNull()
        }
    })

    it('can create a new option', async () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()
        const propertyValue = ['multi-option-1', 'multi-option-2']

        render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={propertyValue}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        mockedMutator.insertPropertyOption.mockResolvedValue()

        await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))
        await userEvent.type(await screen.findByRole('combobox', {name: /value selector/i}), 'new-value{enter}')

        expect(mockedMutator.insertPropertyOption).toHaveBeenCalledWith(board.id, board.cardProperties, propertyTemplate, expect.objectContaining({value: 'new-value'}), 'add property option')
        expectOptionsMenuToBeVisible(propertyTemplate)
    })

    it('can delete a option', async () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()
        const propertyValue = ['multi-option-1', 'multi-option-2']

        render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={propertyValue}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))

        await userEvent.click((await screen.findAllByRole('button', {name: /open menu/i}))[0])

        const deleteButtons = await screen.findAllByRole('button', {name: /delete/i})
        const menuDeleteButton = deleteButtons.find((btn) => btn.classList.contains('MenuOption'))
        await userEvent.click(menuDeleteButton!)

        const optionToDelete = propertyTemplate.options.find((option: IPropertyOption) => option.id === propertyValue[0])

        expect(mockedMutator.deletePropertyOption).toHaveBeenCalledWith(board.id, board.cardProperties, propertyTemplate, optionToDelete)
    })

    it('can change color for any option', async () => {
        const propertyTemplate = buildMultiSelectPropertyTemplate()
        const propertyValue = ['multi-option-1', 'multi-option-2']
        const newColorKey = 'propColorYellow'
        const newColorValue = 'yellow'

        render(
            <MultiSelect
                property={new MultiSelectProperty()}
                readOnly={false}
                showEmptyPlaceholder={false}
                propertyTemplate={propertyTemplate}
                propertyValue={propertyValue}
                board={{...board}}
                card={{...card}}
            />,
            {wrapper: Wrapper},
        )

        await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))

        await userEvent.click((await screen.findAllByRole('button', {name: /open menu/i}))[0])

        const colorButtons = await screen.findAllByRole('button', {name: new RegExp(newColorValue, 'i')})
        const menuColorButton = colorButtons.find((btn) => btn.classList.contains('MenuOption'))
        await userEvent.click(menuColorButton!)

        const selectedOption = propertyTemplate.options.find((option: IPropertyOption) => option.id === propertyValue[0])

        expect(mockedMutator.changePropertyOptionColor).toHaveBeenCalledWith(board.id, board.cardProperties, propertyTemplate, selectedOption, newColorKey)
    })

    // U-05·U-08 — select와 같은 규율. 옵션 목록은 잠기고 값 고르기는 남는다.
    describe('속성 편집 잠금', () => {
        beforeEach(() => {
            jest.clearAllMocks()
        })

        const lockedBoard = () => {
            const b = createBoard()
            b.teamId = 'team-1'
            b.properties = {adminOnlyCardProperties: true}
            return b
        }

        const openMenu = async (membership: Record<string, unknown>) => {
            const b = lockedBoard()
            const propertyTemplate = buildMultiSelectPropertyTemplate()
            const LockedWrapper = ({children}: WrapperProps) => (
                <ReduxProvider store={storeFor(b, membership)}>
                    <IntlProvider locale='en'><>{children}</></IntlProvider>
                </ReduxProvider>
            )
            const result = render(
                <MultiSelect
                    property={new MultiSelectProperty()}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                    propertyTemplate={propertyTemplate}
                    propertyValue={['multi-option-1']}
                    board={{...b}}
                    card={{...card}}
                />,
                {wrapper: LockedWrapper},
            )
            await userEvent.click(screen.getByTestId(nonEditableMultiSelectTestId))
            return {...result, propertyTemplate}
        }

        it('에디터는 옵션별 편집 메뉴를 못 본다', async () => {
            const {baseElement} = await openMenu({userId: 'user-1', schemeEditor: true})

            expect(within(baseElement).queryAllByRole('button', {name: /open menu/i})).toHaveLength(0)
        })

        it('에디터는 옵션을 새로 만들 수 없다', async () => {
            await openMenu({userId: 'user-1', schemeEditor: true})

            await userEvent.type(screen.getByRole('combobox'), '새 옵션{enter}')

            expect(mockedMutator.insertPropertyOption).not.toHaveBeenCalled()
        })

        it('에디터도 값은 고를 수 있다', async () => {
            const {propertyTemplate} = await openMenu({userId: 'user-1', schemeEditor: true})

            await userEvent.click(screen.getByRole('menuitem', {name: propertyTemplate.options[1].value}))

            expect(mockedMutator.changePropertyValue).toHaveBeenCalled()
        })

        it('보드 관리자는 옵션별 편집 메뉴를 본다', async () => {
            const {baseElement} = await openMenu({userId: 'user-1', schemeAdmin: true})

            expect(within(baseElement).queryAllByRole('button', {name: /open menu/i}).length).toBeGreaterThan(0)
        })
    })
})
