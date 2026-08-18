import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'
import configureStore from 'redux-mock-store'

import {createBoard} from '../../blocks/board'
import {useCanEditCardProperties} from '../../hooks/permissions'

const Probe = ({board}: {board: ReturnType<typeof createBoard>}) => (
    <div data-testid='probe'>{String(useCanEditCardProperties(board))}</div>
)

test('probe', () => {
    const b = createBoard()
    b.teamId = 'team-1'
    b.properties = {adminOnlyCardProperties: true}
    const store = configureStore([])({
        teams: {current: {id: 'team-1'}},
        boards: {current: b.id, boards: {[b.id]: b}, myBoardMemberships: {[b.id]: {userId: 'user-1', schemeEditor: true}}},
        users: {me: {id: 'user-1'}},
    })
    render(<ReduxProvider store={store}><Probe board={{...b}}/></ReduxProvider>)
    // eslint-disable-next-line no-console
    console.log('HOOK ANSWER =', screen.getByTestId('probe').textContent)
})
