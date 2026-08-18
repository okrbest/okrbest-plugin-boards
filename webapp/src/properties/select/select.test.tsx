// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen, within} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'
import configureStore from 'redux-mock-store'
import '@testing-library/jest-dom'
import {mocked} from 'jest-mock'

import userEvent from '@testing-library/user-event'

import {IPropertyTemplate, createBoard} from '../../blocks/board'
import {createCard} from '../../blocks/card'

import {wrapIntl} from '../../testUtils'
import mutator from '../../mutator'

import SelectProperty from './property'
import Select from './select'

jest.mock('../../mutator')
const mockedMutator = mocked(mutator, true)

function selectPropertyTemplate(): IPropertyTemplate {
    return {
        id: 'select-template',
        name: 'select',
        type: 'select',
        options: [
            {
                id: 'option-1',
                value: 'one',
                color: 'propColorDefault',
            },
            {
                id: 'option-2',
                value: 'two',
                color: 'propColorGreen',
            },
            {
                id: 'option-3',
                value: 'three',
                color: 'propColorRed',
            },
        ],
    }
}

describe('properties/select', () => {
    const nonEditableSelectTestId = 'select-non-editable'

    const clearButton = () => screen.queryByRole('button', {name: /clear/i})
    const board = createBoard()
    board.teamId = 'team-1'
    const card = createCard()

    // 옵션 목록을 바꾸는 일은 보드가 잠글 수 있다. 판정 훅이 팀과 보드 멤버십을
    // 읽으므로 렌더할 때 함께 준다.
    const mockStore = configureStore([])
    const renderSelect = (
        ui: React.ReactElement,
        membership: Record<string, unknown> = {userId: 'user-1', schemeAdmin: true},
        b = board,
    ) => render(
        <ReduxProvider
            store={mockStore({
                teams: {current: {id: 'team-1'}},
                boards: {current: b.id, boards: {[b.id]: b}, myBoardMemberships: {[b.id]: membership}},
                users: {me: {id: 'user-1'}},
            })}
        >
            {wrapIntl(ui)}
        </ReduxProvider>,
    )

    it('shows the selected option', () => {
        const propertyTemplate = selectPropertyTemplate()
        const option = propertyTemplate.options[0]

        const {container} = renderSelect(
            <Select
                property={new SelectProperty()}
                board={{...board}}
                card={{...card}}
                propertyTemplate={propertyTemplate}
                propertyValue={option.id}
                readOnly={true}
                showEmptyPlaceholder={false}
            />,
        )

        expect(screen.getByText(option.value)).toBeInTheDocument()
        expect(clearButton()).not.toBeInTheDocument()

        expect(container).toMatchSnapshot()
    })

    it('shows empty placeholder', () => {
        const propertyTemplate = selectPropertyTemplate()
        const emptyValue = 'Empty'

        const {container} = renderSelect(
            <Select
                property={new SelectProperty()}
                board={{...board}}
                card={{...card}}
                showEmptyPlaceholder={true}
                propertyTemplate={propertyTemplate}
                propertyValue={''}
                readOnly={true}
            />,
        )

        expect(screen.getByText(emptyValue)).toBeInTheDocument()
        expect(clearButton()).not.toBeInTheDocument()

        expect(container).toMatchSnapshot()
    })

    it('shows the menu with options when preview is clicked', async () => {
        const propertyTemplate = selectPropertyTemplate()
        const selected = propertyTemplate.options[1]

        renderSelect(
            <Select
                property={new SelectProperty()}
                board={{...board}}
                card={{...card}}
                propertyTemplate={propertyTemplate}
                propertyValue={selected.id}
                showEmptyPlaceholder={false}
                readOnly={false}
            />,
        )

        await userEvent.click(screen.getByTestId(nonEditableSelectTestId))

        // check that all options are visible
        for (const option of propertyTemplate.options) {
            const elements = await screen.findAllByText(option.value)

            // selected option is rendered twice: in the input and inside the menu
            const expected = option.id === selected.id ? 2 : 1
            expect(elements.length).toBe(expected)
        }

        expect(clearButton()).toBeInTheDocument()
    })

    it('can select the option from menu', async () => {
        const propertyTemplate = selectPropertyTemplate()
        const optionToSelect = propertyTemplate.options[2]

        renderSelect(
            <Select
                property={new SelectProperty()}
                board={{...board}}
                card={{...card}}
                propertyTemplate={propertyTemplate}
                propertyValue={''}
                showEmptyPlaceholder={false}
                readOnly={false}
            />,
        )

        await userEvent.click(screen.getByTestId(nonEditableSelectTestId))
        await userEvent.click(await screen.findByText(optionToSelect.value))

        expect(clearButton()).not.toBeInTheDocument()
        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith(board.id, card, propertyTemplate.id, optionToSelect.id)
    })

    it('can clear the selected option', async () => {
        const propertyTemplate = selectPropertyTemplate()
        const selected = propertyTemplate.options[1]

        renderSelect(
            <Select
                property={new SelectProperty()}
                board={{...board}}
                card={{...card}}
                propertyTemplate={propertyTemplate}
                propertyValue={selected.id}
                showEmptyPlaceholder={false}
                readOnly={false}
            />,
        )

        await userEvent.click(screen.getByTestId(nonEditableSelectTestId))

        const clear = clearButton()
        expect(clear).toBeInTheDocument()
        await userEvent.click(clear!)

        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith(board.id, card, propertyTemplate.id, '')
    })

    it('can create new option', async () => {
        const propertyTemplate = selectPropertyTemplate()
        const initialOption = propertyTemplate.options[0]
        const newOption = 'new-option'

        renderSelect(
            <Select
                property={new SelectProperty()}
                board={{...board}}
                card={{...card}}
                propertyTemplate={propertyTemplate}
                propertyValue={initialOption.id}
                showEmptyPlaceholder={false}
                readOnly={false}
            />,
        )

        mockedMutator.insertPropertyOption.mockResolvedValue()

        await userEvent.click(screen.getByTestId(nonEditableSelectTestId))
        await userEvent.type(await screen.findByRole('combobox', {name: /value selector/i}), `${newOption}{enter}`)

        expect(mockedMutator.insertPropertyOption).toHaveBeenCalledWith(board.id, board.cardProperties, propertyTemplate, expect.objectContaining({value: newOption}), 'add property option')
        expect(mockedMutator.changePropertyValue).toHaveBeenCalledWith(board.id, card, propertyTemplate.id, 'option-3')
    })

    // U-04·U-08 — 잠긴 보드에서 에디터는 옵션 목록을 바꾸지 못한다. 값을 고르는
    // 일은 잠금과 무관하므로 목록과 선택은 그대로 남는다.
    describe('속성 편집 잠금', () => {
        // 이 파일은 mock을 초기화하지 않아, 앞선 테스트의 호출이 남으면
        // "부르지 않았다"를 확인할 수 없다.
        beforeEach(() => {
            jest.clearAllMocks()
        })


        const lockedBoard = () => {
            const b = createBoard()
            b.teamId = 'team-1'
            b.properties = {adminOnlyCardProperties: true}
            return b
        }
        const editor = {userId: 'user-1', schemeEditor: true}

        const openMenu = async (membership: Record<string, unknown>, b = lockedBoard()) => {
            const propertyTemplate = selectPropertyTemplate()
            const result = renderSelect(
                <Select
                    property={new SelectProperty()}
                    board={{...b}}
                    card={{...card}}
                    propertyTemplate={propertyTemplate}
                    propertyValue={propertyTemplate.options[0].id}
                    readOnly={false}
                    showEmptyPlaceholder={false}
                />,
                membership,
                b,
            )
            await userEvent.click(screen.getByTestId(nonEditableSelectTestId))
            return {...result, propertyTemplate}
        }

        it('에디터는 옵션을 새로 만들 수 없다', async () => {
            await openMenu(editor)

            await userEvent.type(
                await screen.findByRole('combobox', {name: /value selector/i}),
                '새 옵션{enter}',
            )

            expect(mockedMutator.insertPropertyOption).not.toHaveBeenCalled()
        })

        it('에디터는 옵션별 편집 메뉴를 못 본다', async () => {
            const {baseElement} = await openMenu(editor)

            // 이름·색·삭제는 옵션마다 붙는 "Open menu" 버튼 뒤에 있다.
            expect(within(baseElement).queryAllByRole('button', {name: /open menu/i})).toHaveLength(0)
        })

        it('보드 관리자는 옵션별 편집 메뉴를 본다', async () => {
            const {baseElement} = await openMenu({userId: 'user-1', schemeAdmin: true})

            expect(within(baseElement).queryAllByRole('button', {name: /open menu/i}).length).toBeGreaterThan(0)
        })

        it('에디터도 값은 고를 수 있다', async () => {
            const {propertyTemplate} = await openMenu(editor)

            await userEvent.click(screen.getByText(propertyTemplate.options[1].value))

            expect(mockedMutator.changePropertyValue).toHaveBeenCalled()
        })

        it('보드 관리자는 옵션을 새로 만들 수 있다', async () => {
            mockedMutator.insertPropertyOption.mockResolvedValue()
            await openMenu({userId: 'user-1', schemeAdmin: true})

            await userEvent.type(
                await screen.findByRole('combobox', {name: /value selector/i}),
                '새 옵션{enter}',
            )

            expect(mockedMutator.insertPropertyOption).toHaveBeenCalled()
        })
    })
})
