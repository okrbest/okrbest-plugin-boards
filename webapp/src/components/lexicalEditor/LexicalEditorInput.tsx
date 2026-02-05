// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {LexicalComposer} from '@lexical/react/LexicalComposer'
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin'
import {ContentEditable} from '@lexical/react/LexicalContentEditable'
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin'
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary'
import {$getRoot, $createParagraphNode, $createTextNode, LexicalEditor} from 'lexical'
import {debounce} from 'lodash'
import {
    BeautifulMentionsPlugin,
    BeautifulMentionsMenuProps,
    BeautifulMentionsMenuItemProps,
    BeautifulMentionNode,
    BeautifulMentionsItem,
    BeautifulMentionsMenuItem,
} from 'lexical-beautiful-mentions'
import {SearchIndex} from 'emoji-mart'

import {useAppSelector} from '../../store/hooks'
import {IUser} from '../../user'
import {getBoardUsersList, getMe} from '../../store/users'
import {useHasPermissions} from '../../hooks/permissions'
import {Permission} from '../../constants'
import {BoardMember, BoardTypeOpen, MemberRole} from '../../blocks/board'
import mutator from '../../mutator'
import ConfirmAddUserForNotifications from '../confirmAddUserForNotifications'
import RootPortal from '../rootPortal'
import {getCurrentBoard} from '../../store/boards'
import octoClient from '../../octoClient'
import {Utils} from '../../utils'
import {ClientConfig} from '../../config/clientConfig'
import {getClientConfig} from '../../store/clientConfig'
import GuestBadge from '../../widgets/guestBadge'

import editorTheme, {mentionsTheme, emojiTheme} from './themes/editorTheme'
import OnChangePlugin from './plugins/OnChangePlugin'
import FocusPlugin from './plugins/FocusPlugin'
import KeyboardPlugin from './plugins/KeyboardPlugin'

import './lexicalEditor.scss'

const imageURLForUser = (window as any).Components?.imageURLForUser
const BotBadge = (window as any).Components?.BotBadge

type Props = {
    onChange?: (text: string) => void
    onFocus?: () => void
    onBlur?: (text: string) => void
    onEditorCancel?: () => void
    initialText?: string
    id?: string
    isEditing: boolean
    saveOnEnter?: boolean
}

const MentionsMenu = ({loading, ...props}: BeautifulMentionsMenuProps) => {
    return (
        <ul className='LexicalEditor__mentionsMenu' {...props}>
            {props.children}
        </ul>
    )
}

const MentionsMenuItem = React.forwardRef<HTMLLIElement, BeautifulMentionsMenuItemProps>(
    ({selected, item, itemValue, ...props}, ref) => {
        const avatar = typeof item === 'object' ? (item.avatar as string) || '' : ''
        const displayName = typeof item === 'object' ? (item.displayName as string) || itemValue : itemValue
        const isBoardMember = typeof item === 'object' ? item.isBoardMember as boolean : true
        const isBot = typeof item === 'object' ? item.is_bot as boolean : false
        const isGuest = typeof item === 'object' ? item.is_guest as boolean : false

        return (
            <li
                ref={ref}
                className={`LexicalEditor__mentionItem ${selected ? 'LexicalEditor__mentionItem--selected' : ''}`}
                {...props}
            >
                <div className='LexicalEditor__mentionItem__left'>
                    <img
                        src={avatar}
                        className='LexicalEditor__mentionItem__avatar'
                        alt=''
                    />
                    <span className='LexicalEditor__mentionItem__name'>
                        {displayName}
                        {BotBadge && isBot && <BotBadge/>}
                        <GuestBadge show={isGuest}/>
                    </span>
                </div>
                {!isBoardMember && (
                    <span className='LexicalEditor__mentionItem__hint'>
                        (not board member)
                    </span>
                )}
            </li>
        )
    },
)
MentionsMenuItem.displayName = 'MentionsMenuItem'

const EmojiMenu = ({loading, ...props}: BeautifulMentionsMenuProps) => {
    return (
        <ul className='LexicalEditor__emojiMenu' {...props}>
            {props.children}
        </ul>
    )
}

const EmojiMenuItem = React.forwardRef<HTMLLIElement, BeautifulMentionsMenuItemProps>(
    ({selected, item, itemValue, ...props}, ref) => {
        const native = typeof item === 'object' ? (item.native as string) || '' : ''
        const shortName = typeof item === 'object' ? (item.shortName as string) || itemValue : itemValue

        return (
            <li
                ref={ref}
                className={`LexicalEditor__emojiItem ${selected ? 'LexicalEditor__emojiItem--selected' : ''}`}
                {...props}
            >
                <span className='LexicalEditor__emojiItem__emoji'>{native}</span>
                <span className='LexicalEditor__emojiItem__name'>:{shortName}:</span>
            </li>
        )
    },
)
EmojiMenuItem.displayName = 'EmojiMenuItem'

const LexicalEditorInput = (props: Props): React.ReactElement => {
    const {onChange, onFocus, onBlur, initialText, id, saveOnEnter, onEditorCancel} = props
    const boardUsers = useAppSelector<IUser[]>(getBoardUsersList)
    const board = useAppSelector(getCurrentBoard)
    const clientConfig = useAppSelector<ClientConfig>(getClientConfig)
    const allowManageBoardRoles = useHasPermissions(board?.teamId, board?.id, [Permission.ManageBoardRoles])
    const [confirmAddUser, setConfirmAddUser] = useState<IUser | null>(null)
    const me = useAppSelector<IUser | null>(getMe)
    const editorRef = useRef<LexicalEditor | null>(null)

    const userMapRef = useRef<Map<string, IUser>>(new Map())

    const loadSuggestions = useCallback(async (query?: string | null): Promise<BeautifulMentionsItem[]> => {
        const term = query || ''
        let users: IUser[]

        if (!me?.is_guest && (allowManageBoardRoles || (board && board.type === BoardTypeOpen))) {
            const excludeBots = true
            users = await octoClient.searchTeamUsers(term, excludeBots)
        } else {
            users = boardUsers
                .filter((user) => {
                    if (!term) {
                        return true
                    }
                    return Utils.getUserDisplayName(user, clientConfig.teammateNameDisplay)
                        .toLowerCase()
                        .includes(term.toLowerCase())
                })
                .slice(0, 10)
        }

        users.forEach((user) => {
            userMapRef.current.set(user.id, user)
        })

        return users.map((user: IUser): BeautifulMentionsItem => ({
            value: user.username,
            id: user.id,
            avatar: imageURLForUser ? imageURLForUser(user.id) : '',
            is_bot: user.is_bot,
            is_guest: user.is_guest,
            displayName: Utils.getUserDisplayName(user, clientConfig.teammateNameDisplay),
            isBoardMember: Boolean(boardUsers.find((u) => u.id === user.id)),
        }))
    }, [me, allowManageBoardRoles, board, boardUsers, clientConfig.teammateNameDisplay])

    const debouncedSearch = useMemo(
        () =>
            debounce(async (_trigger: string, query?: string | null) => {
                await loadSuggestions(query)
            }, 100),
        [loadSuggestions],
    )

    const handleMentionSearch = useCallback(
        async (_trigger: string, query?: string | null): Promise<BeautifulMentionsItem[]> => {
            // Korean IME requires immediate search (no debounce) for proper character composition
            const hasKorean = query ? /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(query) : false
            if (hasKorean || !query || query.length <= 2) {
                return loadSuggestions(query)
            }
            debouncedSearch(_trigger, query)
            return loadSuggestions(query)
        },
        [loadSuggestions, debouncedSearch],
    )

    const handleMentionSelect = useCallback(
        (menuItem: BeautifulMentionsMenuItem) => {
            const userId = menuItem.data?.id as string | undefined
            const isBoardMember = menuItem.data?.isBoardMember as boolean | undefined

            if (userId && isBoardMember === false) {
                const user = userMapRef.current.get(userId)
                if (user) {
                    setConfirmAddUser(user)
                }
            }
        },
        [],
    )

    const handleEmojiSearch = useCallback(
        async (_trigger: string, query?: string | null): Promise<BeautifulMentionsItem[]> => {
            if (!query || query.length < 2) {
                return []
            }

            const results = await SearchIndex.search(query) || []

            return results
                .slice(0, 10)
                .map((emoji: {id: string, skins: Array<{native: string}>}): BeautifulMentionsItem => ({
                    value: emoji.skins[0].native,
                    id: emoji.id,
                    native: emoji.skins[0].native,
                    shortName: emoji.id,
                }))
        },
        [],
    )

    const addUser = useCallback(
        async (userId: string, role: string) => {
            const newRole = role || MemberRole.Viewer
            const newMember = {
                boardId: board.id,
                userId,
                roles: role,
                schemeAdmin: newRole === MemberRole.Admin,
                schemeEditor: newRole === MemberRole.Admin || newRole === MemberRole.Editor,
                schemeCommenter:
                    newRole === MemberRole.Admin ||
                    newRole === MemberRole.Editor ||
                    newRole === MemberRole.Commenter,
                schemeViewer:
                    newRole === MemberRole.Admin ||
                    newRole === MemberRole.Editor ||
                    newRole === MemberRole.Commenter ||
                    newRole === MemberRole.Viewer,
            } as BoardMember

            setConfirmAddUser(null)
            editorRef.current?.focus()
            await mutator.createBoardMember(newMember)
        },
        [board],
    )

    const initialConfig = useMemo(
        () => ({
            namespace: id || 'LexicalEditor',
            theme: {
                ...editorTheme,
                beautifulMentions: {
                    ...mentionsTheme,
                    ':': emojiTheme[':'],
                },
            },
            nodes: [BeautifulMentionNode],
            onError: (error: Error) => {
                console.error('Lexical Editor Error:', error)
            },
            editorState: initialText
                ? () => {
                    const root = $getRoot()
                    const paragraph = $createParagraphNode()
                    paragraph.append($createTextNode(initialText))
                    root.append(paragraph)
                }
                : undefined,
        }),
        [id, initialText],
    )

    useEffect(() => {
        loadSuggestions('')
    }, [loadSuggestions])

    return (
        <div className='LexicalEditor'>
            <LexicalComposer initialConfig={initialConfig}>
                <div className='LexicalEditor__container'>
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className='LexicalEditor__input'
                                aria-label='Editor'
                            />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin/>
                    <OnChangePlugin onChange={onChange}/>
                    <FocusPlugin
                        onFocus={onFocus}
                        onBlur={confirmAddUser ? undefined : onBlur}
                    />
                    <KeyboardPlugin
                        saveOnEnter={saveOnEnter}
                        onSave={onBlur}
                        onCancel={onEditorCancel}
                        editorRef={editorRef}
                    />
                    <BeautifulMentionsPlugin
                        triggers={['@', ':']}
                        onSearch={(trigger, query) => {
                            if (trigger === ':') {
                                return handleEmojiSearch(trigger, query)
                            }
                            return handleMentionSearch(trigger, query)
                        }}
                        searchDelay={0}
                        menuComponent={(menuProps) => {
                            if (menuProps.trigger === ':') {
                                return <EmojiMenu {...menuProps}/>
                            }
                            return <MentionsMenu {...menuProps}/>
                        }}
                        menuItemComponent={(itemProps) => {
                            if (itemProps.trigger === ':') {
                                return <EmojiMenuItem {...itemProps}/>
                            }
                            return <MentionsMenuItem {...itemProps}/>
                        }}
                        onMenuItemSelect={(menuItem) => {
                            if (menuItem.trigger === ':') {
                                return
                            }
                            handleMentionSelect(menuItem)
                        }}
                    />
                </div>
            </LexicalComposer>
            {confirmAddUser && (
                <RootPortal>
                    <ConfirmAddUserForNotifications
                        allowManageBoardRoles={allowManageBoardRoles}
                        minimumRole={board.minimumRole}
                        user={confirmAddUser}
                        onConfirm={addUser}
                        onClose={() => {
                            setConfirmAddUser(null)
                            editorRef.current?.focus()
                        }}
                    />
                </RootPortal>
            )}
        </div>
    )
}

export default LexicalEditorInput
