// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ReactNode, useRef, useState, useEffect} from 'react'

import './boardSwitcherDialog.scss'
import {useIntl} from 'react-intl'

import {useNavigate, useParams, useLocation} from 'react-router-dom'

import octoClient from '../../octoClient'
import SearchDialog from '../searchDialog/searchDialog'
import Globe from '../../widgets/icons/globe'
import LockOutline from '../../widgets/icons/lockOutline'
import {useAppSelector} from '../../store/hooks'
import {getAllTeams, getCurrentTeam, Team} from '../../store/teams'
import {getMe} from '../../store/users'
import {Utils} from '../../utils'
import {BoardTypeOpen, BoardTypePrivate} from '../../blocks/board'
import {Constants} from '../../constants'

type Props = {
    onClose: () => void
}

const BoardSwitcherDialog = (props: Props): React.JSX.Element => {
    const [selected, setSelected] = useState<number>(-1)
    const itemRefs = useRef<Map<number, HTMLElement | null>>(new Map())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [IDs, setIDs] = useState<any>({})
    const [initialData, setInitialData] = useState<ReactNode[]>([])
    const intl = useIntl()
    const team = useAppSelector(getCurrentTeam)
    const me = useAppSelector(getMe)
    const title = intl.formatMessage({id: 'FindBoardsDialog.Title', defaultMessage: 'Find Boards'})
    const subTitle = intl.formatMessage(
        {
            id: 'FindBoardsDialog.SubTitle',
            defaultMessage: 'Type to find a board. Use <b>UP/DOWN</b> to browse. <b>ENTER</b> to select, <b>ESC</b> to dismiss',
        },
        {
            b: (chunks: string[]) => chunks.join(''),
        },
    )

    const params = useParams<{boardId: string, viewId: string, cardId?: string}>()
    const navigate = useNavigate()
    const location = useLocation()

    const selectBoard = async (teamId: string, boardId: string): Promise<void> => {
        if (!me) {
            return
        }
        const newPath = Utils.buildBoardPath(location.pathname, {teamId, boardId})
        navigate(newPath)
        props.onClose()
    }

    const teamsById: Record<string, Team> = {}
    useAppSelector(getAllTeams).forEach((t) => {
        teamsById[t.id] = t
    })

    const searchHandler = async (query: string): Promise<ReactNode[]> => {
        if (!team) {
            return []
        }

        const items = await octoClient.searchAll(query)
        const currentTeamItems: typeof items = []
        const otherTeamItems: typeof items = []
        for (const item of items) {
            if (item.teamId === team.id) {
                currentTeamItems.push(item)
            } else {
                otherTeamItems.push(item)
            }
        }
        const sortedItems = currentTeamItems.concat(otherTeamItems)
        const untitledBoardTitle = intl.formatMessage({id: 'ViewTitle.untitled-board', defaultMessage: 'Untitled board'})
        
        // Clean up refs for items that are no longer in the list
        const currentKeys = new Set(itemRefs.current.keys())
        for (const key of currentKeys) {
            if (key >= sortedItems.length) {
                itemRefs.current.delete(key)
            }
        }
        
        return sortedItems.flatMap((item, i) => {
            const resultTitle = item.title || untitledBoardTitle
            const teamInfo = teamsById[item.teamId]
            if (!teamInfo) {
                return []
            }
            const teamTitle = teamInfo.title
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setIDs((prevIDs: any) => ({
                ...prevIDs,
                [i]: [item.teamId, item.id],
            }))
            return (
                <div
                    key={item.id}
                    className='blockSearchResult'
                    onClick={() => selectBoard(item.teamId, item.id)}
                    ref={(el) => {
                        if (el) {
                            itemRefs.current.set(i, el)
                        }
                    }}
                >
                    {item.type === BoardTypeOpen && <Globe/>}
                    {item.type === BoardTypePrivate && <LockOutline/>}
                    <span className='resultTitle'>{resultTitle}</span>
                    <span className='teamTitle'>{teamTitle}</span>
                </div>
            )
        })
    }

    // 컴포넌트 마운트 시 초기 검색 실행 (전체 목록 표시)
    useEffect(() => {
        if (team) {
            searchHandler('').then((results) => {
                setInitialData(results)
            })
        }
    }, [team])

    const handleEnterKeyPress = (e: KeyboardEvent) => {
        if (Utils.isKeyPressed(e, Constants.keyCodes.ENTER) && selected > -1) {
            e.preventDefault()
            const [teamId, id] = IDs[selected]
            selectBoard(teamId, id)
        }
    }

    useEffect(() => {
        if (selected >= 0) {
            const element = itemRefs.current.get(selected)
            if (element?.parentElement) {
                element.parentElement.focus()
            }
        }

        document.addEventListener('keydown', handleEnterKeyPress)

        return () => {
            document.removeEventListener('keydown', handleEnterKeyPress)
        }
    }, [selected, IDs])

    return (
        <SearchDialog
            onClose={props.onClose}
            title={title}
            subTitle={subTitle}
            searchHandler={searchHandler}
            initialData={initialData}
            selected={selected}
            setSelected={(n: number) => setSelected(n)}
        />
    )
}

export default BoardSwitcherDialog
