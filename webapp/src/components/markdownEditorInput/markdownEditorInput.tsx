// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Editor from '@draft-js-plugins/editor'
import createEmojiPlugin from '@draft-js-plugins/emoji'
import '@draft-js-plugins/emoji/lib/plugin.css'
import createMentionPlugin from '@draft-js-plugins/mention'
import '@draft-js-plugins/mention/lib/plugin.css'
import {ContentState, DraftHandleValue, EditorState, getDefaultKeyBinding} from 'draft-js'
import React, {
    ReactElement, useCallback, useEffect,
    useMemo, useRef,
    useState,
} from 'react'

import {debounce} from 'lodash'

import {useAppSelector} from '../../store/hooks'
import {IUser} from '../../user'
import {getBoardUsersList, getMe} from '../../store/users'
import createLiveMarkdownPlugin from '../live-markdown-plugin/liveMarkdownPlugin'
import {useHasPermissions} from '../../hooks/permissions'
import {Permission} from '../../constants'
import {BoardMember, BoardTypeOpen, MemberRole} from '../../blocks/board'
import mutator from '../../mutator'
import ConfirmAddUserForNotifications from '../confirmAddUserForNotifications'
import RootPortal from '../rootPortal'

import './markdownEditorInput.scss'

import {getCurrentBoard} from '../../store/boards'
import octoClient from '../../octoClient'

import {Utils} from '../../utils'
import {ClientConfig} from '../../config/clientConfig'
import {getClientConfig} from '../../store/clientConfig'

import Entry from './entryComponent/entryComponent'

const imageURLForUser = (window as any).Components?.imageURLForUser

type MentionUser = {
    user: IUser
    name: string
    avatar: string
    is_bot: boolean
    is_guest: boolean
    displayName: string
    isBoardMember: boolean
}

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

const MarkdownEditorInput = (props: Props): ReactElement => {
    const {onChange, onFocus, onBlur, initialText, id} = props
    const boardUsers = useAppSelector<IUser[]>(getBoardUsersList)
    const board = useAppSelector(getCurrentBoard)
    const clientConfig = useAppSelector<ClientConfig>(getClientConfig)
    const ref = useRef<Editor>(null)
    const allowManageBoardRoles = useHasPermissions(board.teamId, board.id, [Permission.ManageBoardRoles])
    const [confirmAddUser, setConfirmAddUser] = useState<IUser|null>(null)
    const me = useAppSelector<IUser|null>(getMe)

    const [suggestions, setSuggestions] = useState<MentionUser[]>([])
    const [isComposing, setIsComposing] = useState(false)
    const [manualMentionMode, setManualMentionMode] = useState(false)

    const loadSuggestions = async (term: string) => {
        let users: IUser[]

        if (!me?.is_guest && (allowManageBoardRoles || (board && board.type === BoardTypeOpen))) {
            const excludeBots = true
            // Use original search method
            users = await octoClient.searchTeamUsers(term, excludeBots)
        } else {
            users = boardUsers.
                filter((user) => {
                    // no search term
                    if (!term) {
                        return true
                    }

                    // does the search term occur anywhere in the display name?
                    return Utils.getUserDisplayName(user, clientConfig.teammateNameDisplay).includes(term)
                }).

                // first 10 results
                slice(0, 10)
        }

        const mentions: MentionUser[] = users.map(
            (user: IUser): MentionUser => ({
                name: user.username,
                avatar: `${imageURLForUser ? imageURLForUser(user.id) : ''}`,
                is_bot: user.is_bot,
                is_guest: user.is_guest,
                displayName: Utils.getUserDisplayName(user, clientConfig.teammateNameDisplay),
                isBoardMember: Boolean(boardUsers.find((u) => u.id === user.id)),
                user,
            }))
        setSuggestions(mentions)
    }

    // Reduce debounce time from 200ms to 100ms for faster response like channels
    const debouncedLoadSuggestion = useMemo(() => debounce(loadSuggestions, 100), [])

    useEffect(() => {
        // Get the ball rolling. Searching for empty string
        // returns first 10 users in alphabetical order.
        loadSuggestions('')
    }, [])

    // Add DOM input event listener for better Korean detection
    useEffect(() => {
        const handleDOMInput = () => {
            setTimeout(() => {
                if (ref.current) {
                    const editorState = ref.current.getEditorState()
                    const contentState = editorState.getCurrentContent()
                    const selection = editorState.getSelection()
                    const currentBlock = contentState.getBlockForKey(selection.getStartKey())
                    const text = currentBlock.getText()
                    const cursorPosition = selection.getStartOffset()
                    
                    const textBeforeCursor = text.substring(0, cursorPosition)
                    const mentionMatch = textBeforeCursor.match(/@([^\s]*)$/)
                    
                    if (mentionMatch) {
                        const searchTerm = mentionMatch[1]
                        const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(searchTerm)
                        
                        if (hasKorean && searchTerm.length > 0) {
                            setManualMentionMode(true)
                            setIsMentionPopoverOpen(true)
                            loadSuggestions(searchTerm)
                        }
                    }
                }
            }, 0)
        }

        // Add event listener to the editor container
        const editorElement = ref.current?.editor?.editor
        if (editorElement) {
            editorElement.addEventListener('input', handleDOMInput, true)
            return () => {
                editorElement.removeEventListener('input', handleDOMInput, true)
            }
        }
    }, [loadSuggestions])

    const generateEditorState = (text?: string) => {
        const state = EditorState.createWithContent(ContentState.createFromText(text || ''))
        return EditorState.moveSelectionToEnd(state)
    }

    const [editorState, setEditorState] = useState(() => generateEditorState(initialText))

    const addUser = useCallback(async (userId: string, role: string) => {
        const newRole = role || MemberRole.Viewer
        const newMember = {
            boardId: board.id,
            userId,
            roles: role,
            schemeAdmin: newRole === MemberRole.Admin,
            schemeEditor: newRole === MemberRole.Admin || newRole === MemberRole.Editor,
            schemeCommenter: newRole === MemberRole.Admin || newRole === MemberRole.Editor || newRole === MemberRole.Commenter,
            schemeViewer: newRole === MemberRole.Admin || newRole === MemberRole.Editor || newRole === MemberRole.Commenter || newRole === MemberRole.Viewer,
        } as BoardMember

        setConfirmAddUser(null)
        setEditorState(EditorState.moveSelectionToEnd(editorState))
        ref.current?.focus()
        await mutator.createBoardMember(newMember)
    }, [board, editorState])

    const [initialTextCache, setInitialTextCache] = useState<string | undefined>(initialText)
    const [initialTextUsed, setInitialTextUsed] = useState<boolean>(false)

    // avoiding stale closure
    useEffect(() => {
        // only change editor state when initialText actually changes from one defined value to another.
        // This is needed to make the mentions plugin work. For some reason, if we don't check
        // for this if condition here, mentions don't work. I suspect it's because without
        // the in condition, we're changing editor state twice during component initialization
        // and for some reason it causes mentions to not show up.

        // initial text should only be used once, i'e', initially
        // `initialTextUsed` flag records if the initialText prop has been used
        // to se the editor state once as a truthy value.
        // Once used, we don't react to its changing value
        
        // However, if initialText becomes empty, we should reset the editor
        if (initialText === '' && initialTextCache !== '') {
            setEditorState(generateEditorState(''))
            setInitialTextCache('')
            setInitialTextUsed(false)
            return
        }

        if (!initialTextUsed && initialText && initialText !== initialTextCache) {
            setEditorState(generateEditorState(initialText || ''))
            setInitialTextCache(initialText)
            setInitialTextUsed(true)
        }
    }, [initialText])

    const [isMentionPopoverOpen, setIsMentionPopoverOpen] = useState(false)
    const [isEmojiPopoverOpen, setIsEmojiPopoverOpen] = useState(false)

    const {MentionSuggestions, plugins, EmojiSuggestions} = useMemo(() => {
        // Create mention plugin with custom regex that properly handles Korean
        const mentionPlugin = createMentionPlugin({
            mentionPrefix: '@',
            // Custom regex to include Korean characters properly
            mentionRegExp: '[\\w\\-\xC0-\xD6\xD8-\xF6\xF8-\xFF\u0100-\u0148\u014A-\u017F\u0410-\u044F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]',
            supportWhitespace: false
        })
        const emojiPlugin = createEmojiPlugin()
        const markdownPlugin = createLiveMarkdownPlugin()

        // eslint-disable-next-line @typescript-eslint/no-shadow
        const {EmojiSuggestions} = emojiPlugin
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const {MentionSuggestions} = mentionPlugin
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const plugins = [
            mentionPlugin,
            emojiPlugin,
            markdownPlugin,
        ]
        return {plugins, MentionSuggestions, EmojiSuggestions}
    }, [])

    const onEditorStateChange = useCallback((newEditorState: EditorState) => {
        const newText = newEditorState.getCurrentContent().getPlainText()
        onChange && onChange(newText)
        setEditorState(newEditorState)

        // ALWAYS check for mentions, regardless of composition state
        const selection = newEditorState.getSelection()
        const contentState = newEditorState.getCurrentContent()
        const currentBlock = contentState.getBlockForKey(selection.getStartKey())
        const text = currentBlock.getText()
        const cursorPosition = selection.getStartOffset()
        
        // Look for @ mentions before cursor
        const textBeforeCursor = text.substring(0, cursorPosition)
        const mentionMatch = textBeforeCursor.match(/@([^\s]*)$/)
        
        if (mentionMatch) {
            const searchTerm = mentionMatch[1]
            const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(searchTerm)
            
            if (searchTerm.length > 0) {
                // For Korean, bypass the plugin and handle manually
                if (hasKorean) {
                    setManualMentionMode(true)
                    setIsMentionPopoverOpen(true)
                }
                
                // Force trigger mention for all cases
                setTimeout(() => {
                    loadSuggestions(searchTerm)
                }, 0)
            }
        } else {
            // No mention found, close manual mode
            if (manualMentionMode) {
                setManualMentionMode(false)
                setIsMentionPopoverOpen(false)
            }
        }
    }, [onChange, isComposing, loadSuggestions, manualMentionMode])

    const customKeyBindingFn = useCallback((e: React.KeyboardEvent) => {
        if (isMentionPopoverOpen || isEmojiPopoverOpen) {
            return undefined
        }

        if (e.key === 'Escape') {
            return 'editor-blur'
        }

        if (e.key === 'Backspace') {
            return 'backspace'
        }

        if (getDefaultKeyBinding(e) === 'undo') {
            return 'editor-undo'
        }

        if (getDefaultKeyBinding(e) === 'redo') {
            return 'editor-redo'
        }

        return getDefaultKeyBinding(e as any)
    }, [isEmojiPopoverOpen, isMentionPopoverOpen])

    const handleKeyCommand = useCallback((command: string, currentState: EditorState): DraftHandleValue => {
        if (command === 'editor-blur') {
            ref.current?.blur()
            return 'handled'
        }

        if (command === 'editor-redo') {
            const selectionRemovedState = EditorState.redo(currentState)
            onEditorStateChange(EditorState.redo(selectionRemovedState))

            return 'handled'
        }

        if (command === 'editor-undo') {
            const selectionRemovedState = EditorState.undo(currentState)
            onEditorStateChange(EditorState.undo(selectionRemovedState))

            return 'handled'
        }

        if (command === 'backspace') {
            if (props.onEditorCancel && editorState.getCurrentContent().getPlainText().length === 0) {
                props.onEditorCancel()
                return 'handled'
            }
        }

        return 'not-handled'
    }, [props.onEditorCancel, editorState])

    const onEditorStateBlur = useCallback(() => {
        if (confirmAddUser) {
            return
        }
        const text = editorState.getCurrentContent().getPlainText()
        onBlur && onBlur(text)
    }, [editorState.getCurrentContent().getPlainText(), onBlur, confirmAddUser])

    const onMentionPopoverOpenChange = useCallback((open: boolean) => {
        setIsMentionPopoverOpen(open)
    }, [])

    const onEmojiPopoverOpen = useCallback(() => {
        setIsEmojiPopoverOpen(true)
    }, [])

    const onEmojiPopoverClose = useCallback(() => {
        setIsEmojiPopoverOpen(false)
    }, [])

    // IME handling for Korean input
    const handleCompositionStart = useCallback(() => {
        setIsComposing(true)
    }, [])

    const handleCompositionUpdate = useCallback((e: React.CompositionEvent) => {
        // During Korean composition, get the current input data
        if (e.data && ref.current) {
            const editorState = ref.current.getEditorState()
            const contentState = editorState.getCurrentContent()
            const selection = editorState.getSelection()
            const currentBlock = contentState.getBlockForKey(selection.getStartKey())
            const text = currentBlock.getText()
            const cursorPosition = selection.getStartOffset()
            
            // Construct what the text would be with the composition data
            const textBeforeCursor = text.substring(0, cursorPosition)
            const compositionText = textBeforeCursor + e.data
            
            // Look for @ mentions in the composed text
            const mentionMatch = compositionText.match(/@([^\s]*)$/)
            
            if (mentionMatch) {
                const searchTerm = mentionMatch[1]
                const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(searchTerm)
                
                if (hasKorean && searchTerm.length > 0) {
                    setManualMentionMode(true)
                    setIsMentionPopoverOpen(true)
                    loadSuggestions(searchTerm)
                }
            }
        }
    }, [loadSuggestions])

    const handleCompositionEnd = useCallback(() => {
        setIsComposing(false)
        
        // After Korean input is completed, force check for mentions
        setTimeout(() => {
            if (ref.current) {
                const editorState = ref.current.getEditorState()
                const contentState = editorState.getCurrentContent()
                const selection = editorState.getSelection()
                const currentBlock = contentState.getBlockForKey(selection.getStartKey())
                const text = currentBlock.getText()
                const cursorPosition = selection.getStartOffset()
                
                // Look for @ mentions before cursor
                const textBeforeCursor = text.substring(0, cursorPosition)
                const mentionMatch = textBeforeCursor.match(/@([^\s]*)$/)
                
                if (mentionMatch) {
                    const searchTerm = mentionMatch[1]
                    loadSuggestions(searchTerm)
                    setIsMentionPopoverOpen(true)
                }
            }
        }, 10) // Small delay to ensure DOM is updated
    }, [loadSuggestions])

    const onSearchChange = useCallback(({value}: { value: string }) => {
        // For Korean input (IME), trigger immediate search for better UX
        // Check if the value contains Korean characters
        const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(value)
        if (hasKorean || value.length <= 2 || isComposing || manualMentionMode) {
            // For Korean input, short queries, or during IME composition, search immediately without debounce
            loadSuggestions(value)
        } else {
            // For longer English queries, use debounce to prevent too many requests
            debouncedLoadSuggestion(value)
        }
    }, [suggestions, isComposing, manualMentionMode])

    const className = 'MarkdownEditorInput'

    const handleReturn = (e: any, state: EditorState): DraftHandleValue => {
        if (!e.shiftKey) {
            const text = state.getCurrentContent().getPlainText()
            onBlur && onBlur(text)
            return 'handled'
        }
        return 'not-handled'
    }

    return (
        <div
            className={className}
            onKeyDown={(e: React.KeyboardEvent) => {
                if (isMentionPopoverOpen || isEmojiPopoverOpen) {
                    e.stopPropagation()
                }
            }}
            onKeyUp={(e: React.KeyboardEvent) => {
                // Handle Korean input completion on key up
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    setTimeout(() => {
                        if (ref.current) {
                            const editorState = ref.current.getEditorState()
                            const contentState = editorState.getCurrentContent()
                            const selection = editorState.getSelection()
                            const currentBlock = contentState.getBlockForKey(selection.getStartKey())
                            const text = currentBlock.getText()
                            const cursorPosition = selection.getStartOffset()
                            
                            const textBeforeCursor = text.substring(0, cursorPosition)
                            const mentionMatch = textBeforeCursor.match(/@([^\s]*)$/)
                            
                            if (mentionMatch) {
                                const searchTerm = mentionMatch[1]
                                const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(searchTerm)
                                
                                if (hasKorean && searchTerm.length > 0) {
                                    loadSuggestions(searchTerm)
                                    setIsMentionPopoverOpen(true)
                                }
                            }
                        }
                    }, 10)
                }
            }}
            onCompositionStart={handleCompositionStart}
            onCompositionUpdate={handleCompositionUpdate}
            onCompositionEnd={handleCompositionEnd}
            onInput={() => {
                // Handle Korean input in real-time
                setTimeout(() => {
                    if (ref.current) {
                        const editorState = ref.current.getEditorState()
                        const contentState = editorState.getCurrentContent()
                        const selection = editorState.getSelection()
                        const currentBlock = contentState.getBlockForKey(selection.getStartKey())
                        const text = currentBlock.getText()
                        const cursorPosition = selection.getStartOffset()
                        
                        const textBeforeCursor = text.substring(0, cursorPosition)
                        const mentionMatch = textBeforeCursor.match(/@([^\s]*)$/)
                        
                        if (mentionMatch) {
                            const searchTerm = mentionMatch[1]
                            const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(searchTerm)
                            
                            if (hasKorean) {
                                loadSuggestions(searchTerm)
                                setIsMentionPopoverOpen(true)
                            }
                        }
                    }
                }, 0)
            }}
        >
            <Editor
                editorKey={id}
                editorState={editorState}
                onChange={onEditorStateChange}
                plugins={plugins}
                ref={ref}
                onBlur={onEditorStateBlur}
                onFocus={onFocus}
                keyBindingFn={customKeyBindingFn}
                handleKeyCommand={handleKeyCommand}
                handleReturn={props.saveOnEnter ? handleReturn : undefined}
            />
            <MentionSuggestions
                open={isMentionPopoverOpen || manualMentionMode}
                onOpenChange={onMentionPopoverOpenChange}
                suggestions={suggestions}
                onSearchChange={onSearchChange}
                entryComponent={Entry}
                onAddMention={(mention) => {
                    // Reset manual mode when mention is selected
                    if (manualMentionMode) {
                        setManualMentionMode(false)
                    }
                    
                    if (mention.isBoardMember) {
                        return
                    }
                    setConfirmAddUser(mention.user)
                }}
            />
            <EmojiSuggestions
                onOpen={onEmojiPopoverOpen}
                onClose={onEmojiPopoverClose}
            />
            {confirmAddUser &&
                <RootPortal>
                    <ConfirmAddUserForNotifications
                        allowManageBoardRoles={allowManageBoardRoles}
                        minimumRole={board.minimumRole}
                        user={confirmAddUser}
                        onConfirm={addUser}
                        onClose={() => {
                            setConfirmAddUser(null)
                            setEditorState(EditorState.moveSelectionToEnd(editorState))
                            ref.current?.focus()
                        }}
                    />
                </RootPortal>}
        </div>
    )
}

export default MarkdownEditorInput
