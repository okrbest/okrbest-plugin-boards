// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useEffect, useMemo} from 'react'
import {IntlProvider, useIntl, FormattedMessage} from 'react-intl'
import debounce from 'lodash/debounce'

import {getMessages} from '../i18n'
import {getLanguage} from '../store/language'

import {useWebsockets} from '../hooks/websockets'

import octoClient from '../octoClient'
import mutator from '../mutator'
import {getCurrentTeamId, getAllTeams, Team} from '../store/teams'
import {createBoard, Board} from '../blocks/board'
import {useAppSelector, useAppDispatch} from '../store/hooks'
import {EmptySearch, EmptyResults} from '../components/searchDialog/searchDialog'
import ConfirmationDialog from '../components/confirmationDialogBox'
import Dialog from '../components/dialog'
import SearchIcon from '../widgets/icons/search'
import Button from '../widgets/buttons/button'
import {getCurrentLinkToChannel, setLinkToChannel} from '../store/boards'
import {WSClient} from '../wsclient'
// import {SuiteWindow} from '../types/index' // 미사용

import BoardSelectorItem from './boardSelectorItem'

import './boardSelector.scss'

const BoardSelector = () => {
    const teamsById:Record<string, Team> = {}
    useAppSelector(getAllTeams).forEach((t) => {
        teamsById[t.id] = t
    })
    const intl = useIntl()
    const teamId = useAppSelector(getCurrentTeamId)
    const currentChannel = useAppSelector(getCurrentLinkToChannel)
    const dispatch = useAppDispatch()

    const [results, setResults] = useState<Array<Board>>([])
    const [isSearching, setIsSearching] = useState<boolean>(false)
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [showLinkBoardConfirmation, setShowLinkBoardConfirmation] = useState<Board|null>(null)

    const searchHandler = useCallback(async (query: string): Promise<void> => {
        setSearchQuery(query)

        if (!teamId) {
            return
        }
        const items = await octoClient.searchLinkableBoards(teamId, query)

        setResults(items)
        setIsSearching(false)
    }, [teamId])

    const debouncedSearchHandler = useMemo(() => debounce(searchHandler, 200), [searchHandler])

    // 검색어 변경 시 즉시 처리 (빈 검색어일 때는 즉시, 그 외에는 디바운스)
    const handleSearchChange = useCallback((query: string) => {
        if (query.trim().length === 0) {
            // 빈 검색어일 때는 즉시 전체 목록 표시
            searchHandler('')
        } else {
            // 검색어가 있을 때는 디바운스 적용
            debouncedSearchHandler(query)
        }
    }, [searchHandler, debouncedSearchHandler])

    // 컴포넌트 마운트 시 초기 검색 실행 (전체 목록 표시)
    useEffect(() => {
        if (teamId) {
            searchHandler('')
        }
    }, [teamId]) // eslint-disable-line react-hooks/exhaustive-deps

    // currentChannel이 변경될 때마다 초기 검색 실행 (모달이 열릴 때)
    useEffect(() => {
        if (teamId && currentChannel) {
            searchHandler('')
        }
    }, [currentChannel, teamId]) // eslint-disable-line react-hooks/exhaustive-deps

    const emptyResult = results.length === 0 && !isSearching && searchQuery

    useWebsockets(teamId, (wsClient: WSClient) => {
        const onChangeBoardHandler = (_: WSClient, boards: Board[]): void => {
            const newResults = [...results]
            let updated = false
            results.forEach((board, idx) => {
                for (const newBoard of boards) {
                    if (newBoard.id == board.id) {
                        newResults[idx] = newBoard
                        updated = true
                    }
                }
            })
            if (updated) {
                setResults(newResults)
            }
        }

        wsClient.addOnChange(onChangeBoardHandler, 'board')

        return () => {
            wsClient.removeOnChange(onChangeBoardHandler, 'board')
        }
    }, [results])


    if (!teamId) {
        return null
    }
    if (!currentChannel) {
        return null
    }

    const linkBoard = async (board: Board, confirmed?: boolean): Promise<void> => {
        if (!confirmed) {
            setShowLinkBoardConfirmation(board)
            return
        }
        const newBoard = createBoard({...board, channelId: currentChannel})
        await mutator.updateBoard(newBoard, board, 'linked channel')
        setShowLinkBoardConfirmation(null)
        dispatch(setLinkToChannel(''))
        setResults([])
        setIsSearching(false)
        setSearchQuery('')
    }

    const unlinkBoard = async (board: Board): Promise<void> => {
        const newBoard = createBoard({...board, channelId: ''})
        await mutator.updateBoard(newBoard, board, 'unlinked channel')
    }

    const newLinkedBoard = async (): Promise<void> => {
        const windowAny = window as any
        window.open(`${windowAny.frontendBaseURL}/team/${teamId}/new/${currentChannel}`, '_blank', 'noopener')
        dispatch(setLinkToChannel(''))
    }

    let confirmationSubText
    if (showLinkBoardConfirmation?.channelId !== '') {
        confirmationSubText = intl.formatMessage({
            id: 'boardSelector.confirm-link-board-subtext-with-other-channel',
            defaultMessage: 'When you link "{boardName}" to the channel, all members of the channel (existing and new) will be able to edit it. This excludes members who are guests.{lineBreak} This board is currently linked to another channel. It will be unlinked if you choose to link it here.'
        }, {boardName: showLinkBoardConfirmation?.title, lineBreak: <p/>})
    } else {
        confirmationSubText = intl.formatMessage({
            id: 'boardSelector.confirm-link-board-subtext',
            defaultMessage: 'When you link "{boardName}" to the channel, all members of the channel (existing and new) will be able to edit it. This excludes members who are guests. You can unlink a board from a channel at any time.'
        }, {boardName: showLinkBoardConfirmation?.title})
    }

    const closeDialog = () => {
        dispatch(setLinkToChannel(''))
        setResults([])
        setIsSearching(false)
        setSearchQuery('')
        setShowLinkBoardConfirmation(null)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if(event.key == 'Escape') {
            closeDialog()
        }
    }


    return (
        <div
            className='focalboard-body'
            onKeyDown={handleKeyDown}
        >
            <Dialog
                className='BoardSelector'
                onClose={closeDialog}
                title={
                    <FormattedMessage
                        id='boardSelector.title'
                        defaultMessage='Link boards'
                    />
                }
                toolbar={
                    <Button
                        onClick={() => newLinkedBoard()}
                        emphasis='secondary'
                    >
                        <FormattedMessage
                            id='boardSelector.create-a-board'
                            defaultMessage='Create a board'
                        />
                    </Button>
                }
            >
                {showLinkBoardConfirmation &&
                    <ConfirmationDialog
                        dialogBox={{
                            heading: intl.formatMessage({id: 'boardSelector.confirm-link-board', defaultMessage: 'Link board to channel'}),
                            subText: confirmationSubText,
                            confirmButtonText: intl.formatMessage({id: 'boardSelector.confirm-link-board-button', defaultMessage: 'Yes, link board'}),
                            destructive: showLinkBoardConfirmation?.channelId !== '',
                            onConfirm: () => linkBoard(showLinkBoardConfirmation, true),
                            onClose: () => setShowLinkBoardConfirmation(null),
                        }}
                    />}
                <div className='BoardSelectorBody'>
                    <div className='head'>
                        <div className='queryWrapper'>
                            <SearchIcon/>
                            <input
                                className='searchQuery'
                                placeholder={intl.formatMessage({id: 'boardSelector.search-for-boards', defaultMessage:'Search for boards'})}
                                type='text'
                                onChange={(e) => handleSearchChange(e.target.value)}
                                autoFocus={true}
                                maxLength={100}
                            />
                        </div>
                    </div>
                    <div className='searchResults'>
                        {/*When there are results to show*/}
                        {results.length > 0 &&
                            results.map((result) => (<BoardSelectorItem
                                key={result.id}
                                item={result}
                                linkBoard={linkBoard}
                                unlinkBoard={unlinkBoard}
                                currentChannel={currentChannel}
                            />))}

                        {/*when user searched for something and there were no results*/}
                        {emptyResult && <EmptyResults query={searchQuery}/>}

                        {/*default state, when user didn't search for anything. This is the initial screen*/}
                        {!emptyResult && !searchQuery && results.length === 0 && <EmptySearch/>}
                    </div>
                </div>
            </Dialog>
        </div>
    )
}

const IntlBoardSelector = () => {
    const language = useAppSelector<string>(getLanguage)

    return (
        <IntlProvider
            locale={language.split(/[_]/)[0]}
            messages={getMessages(language)}
        >
            <BoardSelector/>
        </IntlProvider>
    )
}

export default IntlBoardSelector
