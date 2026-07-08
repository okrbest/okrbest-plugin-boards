// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React, {useState, useEffect, useMemo} from 'react'

import {useIntl, FormattedMessage} from 'react-intl'
import {generatePath, useParams} from 'react-router-dom'
import Select from 'react-select/async'
import {CSSObject} from '@emotion/serialize'

import {useAppSelector} from '../../store/hooks'
import {getCurrentBoard, getCurrentBoardMembers} from '../../store/boards'
import {Channel, ChannelTypeOpen, ChannelTypePrivate} from '../../store/channels'
import {getMe, getBoardUsersList} from '../../store/users'

import {ClientConfig} from '../../config/clientConfig'
import {getClientConfig} from '../../store/clientConfig'

import {Utils, IDType} from '../../utils'
import Tooltip from '../../widgets/tooltip'
import mutator from '../../mutator'

import {ISharing} from '../../blocks/sharing'
import {ACLSubjectOption, BoardACLEntry, BoardPermissionsResponse, BoardMember, createBoard, MemberRole} from '../../blocks/board'

import client from '../../octoClient'
import Dialog from '../dialog'
import ConfirmationDialog from '../confirmationDialogBox'
import {IUser} from '../../user'
import Switch from '../../widgets/switch'
import Button from '../../widgets/buttons/button'
import {sendFlashMessage} from '../flashMessages'
import {Permission} from '../../constants'
import GuestBadge from '../../widgets/guestBadge'
import AdminBadge from '../../widgets/adminBadge/adminBadge'

import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'

import {getSelectBaseStyle} from '../../theme'
import CompassIcon from '../../widgets/icons/compassIcon'
import IconButton from '../../widgets/buttons/iconButton'
import SearchIcon from '../../widgets/icons/search'
import PrivateIcon from '../../widgets/icons/lockOutline'
import PublicIcon from '../../widgets/icons/globe'

import BoardPermissionGate from '../permissions/boardPermissionGate'

import {useHasPermissions} from '../../hooks/permissions'

import TeamPermissionsRow from './teamPermissionsRow'
import ChannelPermissionsRow from './channelPermissionsRow'
import UserPermissionsRow from './userPermissionsRow'

import './shareBoard.scss'

type Props = {
    onClose: () => void
    enableSharedBoards: boolean
}

const baseStyles = getSelectBaseStyle()

const styles = {
    ...baseStyles,
    control: (): CSSObject => ({
        border: 0,
        width: '100%',
        height: '100%',
        margin: '0',
        display: 'flex',
        flexDirection: 'row',
    }),
    menu: (provided: CSSObject): CSSObject => ({
        ...provided,
        minWidth: '100%',
        width: 'max-content',
        background: 'rgb(var(--center-channel-bg-rgb))',
        left: '0',
        marginBottom: '0',
    }),
    singleValue: (provided: CSSObject): CSSObject => ({
        ...baseStyles.singleValue(provided),
        opacity: '0.8',
        fontSize: '12px',
        right: '0',
        textTransform: 'uppercase',
    }),
}

type ACLPermission = 'view'|'edit'|'manage'|'delete'
type ACLSubjectMode = 'org_position'|'user'
type ACLEntryDraft = {
    subjectType: ACLSubjectMode
    orgUnitId: string
    positionCode: string
    subjectId: string
    permission: ACLPermission
}

function isLastAdmin(members: BoardMember[]) {
    let adminCount = 0
    for (const member of members) {
        if (member.schemeAdmin) {
            if (++adminCount > 1) {
                return false
            }
        }
    }
    return true
}

export default function ShareBoardDialog(props: Props): React.JSX.Element {
    const [wasCopiedPublic, setWasCopiedPublic] = useState(false)
    const [wasCopiedInternal, setWasCopiedInternal] = useState(false)
    const [showLinkChannelConfirmation, setShowLinkChannelConfirmation] = useState<Channel|null>(null)
    const [sharing, setSharing] = useState<ISharing|undefined>(undefined)
    const [selectedUser, setSelectedUser] = useState<IUser|Channel|null>(null)
    const [aclEntries, setAclEntries] = useState<BoardACLEntry[]>([])
    const [orgUnitOptions, setOrgUnitOptions] = useState<ACLSubjectOption[]>([])
    const [positionOptions, setPositionOptions] = useState<ACLSubjectOption[]>([])
    const [isACLOptionsLoading, setIsACLOptionsLoading] = useState(false)
    const [aclOptionsError, setACLOptionsError] = useState('')
    const [showAdvancedUserACL, setShowAdvancedUserACL] = useState(false)
    const [editingEntryKey, setEditingEntryKey] = useState('')
    const [entryDraft, setEntryDraft] = useState<ACLEntryDraft>({
        subjectType: 'org_position',
        orgUnitId: '',
        positionCode: '',
        subjectId: '',
        permission: 'view',
    })
    const [creatingEntry, setCreatingEntry] = useState(false)
    const [createDraft, setCreateDraft] = useState<ACLEntryDraft>({
        subjectType: 'org_position',
        orgUnitId: '',
        positionCode: '',
        subjectId: '',
        permission: 'view',
    })
    const [previewUserId, setPreviewUserId] = useState('')
    const [previewResult, setPreviewResult] = useState<BoardPermissionsResponse|undefined>(undefined)
    const clientConfig = useAppSelector<ClientConfig>(getClientConfig)

    // members of the current board
    const members = useAppSelector<{[key: string]: BoardMember}>(getCurrentBoardMembers)
    const board = useAppSelector(getCurrentBoard)
    const boardId = board.id
    const boardUsers = useAppSelector<IUser[]>(getBoardUsersList)
    const me = useAppSelector<IUser|null>(getMe)

    const [publish, setPublish] = useState(false)

    const intl = useIntl()
    const params = useParams<{teamId?: string, boardId: string, viewId: string}>()

    const hasSharePermissions = useHasPermissions(board.teamId, boardId, [Permission.ShareBoard])
    const canManageBoardRoles = useHasPermissions(board.teamId, boardId, [Permission.ManageBoardRoles])
    const canManageACL = canManageBoardRoles

    const loadData = async () => {
        if (hasSharePermissions) {
            const newSharing = await client.getSharing(boardId)
            setSharing(newSharing)
            setWasCopiedPublic(false)
        }
        if (canManageACL) {
            setIsACLOptionsLoading(true)
            setACLOptionsError('')
            try {
                const [entries, orgUnits, positions] = await Promise.all([
                    client.getBoardACL(boardId),
                    client.getOrgUnits(board.teamId),
                    client.getPositions(board.teamId),
                ])
                setAclEntries(entries)
                setOrgUnitOptions(orgUnits)
                setPositionOptions(positions)
            } catch {
                setOrgUnitOptions([])
                setPositionOptions([])
                setACLOptionsError(intl.formatMessage({
                    id: 'shareBoard.acl.optionsLoadError',
                    defaultMessage: '부서/직위 목록을 불러오지 못했습니다. 조직관리 화면과 팀 권한을 확인하세요.',
                }))
            } finally {
                setIsACLOptionsLoading(false)
            }
        }
    }

    const createSharingInfo = () => {
        const newSharing: ISharing = {
            id: boardId,
            enabled: true,
            token: Utils.createGuid(IDType.Token),
        }
        return newSharing
    }

    const onShareChanged = async (isOn: boolean) => {
        const newSharing: ISharing = sharing || createSharingInfo()
        newSharing.id = boardId
        newSharing.enabled = isOn
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ShareBoard, {board: boardId, shareBoardEnabled: isOn})
        await client.setSharing(boardId, newSharing)
        await loadData()
    }

    const onLinkBoard = async (channel: Channel, confirmed?: boolean) => {
        if (!confirmed) {
            setShowLinkChannelConfirmation(channel)
            return
        }
        setShowLinkChannelConfirmation(null)
        const newBoard = createBoard(board)
        newBoard.channelId = channel.id // This is a channel ID hardcoded here as an example
        mutator.updateBoard(newBoard, board, 'linked channel')
    }

    const onRegenerateToken = async () => {
        // eslint-disable-next-line no-alert
        const accept = window.confirm(intl.formatMessage({id: 'ShareBoard.confirmRegenerateToken', defaultMessage: 'This will invalidate previously shared links. Continue?'}))
        if (accept) {
            const newSharing: ISharing = sharing || createSharingInfo()
            newSharing.token = Utils.createGuid(IDType.Token)
            await client.setSharing(boardId, newSharing)
            await loadData()

            const description = intl.formatMessage({id: 'ShareBoard.tokenRegenrated', defaultMessage: 'Token regenerated'})
            sendFlashMessage({content: description, severity: 'low'})
        }
    }

    const addUser = (user: IUser) => {
        const minimumRole = board.minimumRole || MemberRole.Viewer
        const newMember = {
            boardId,
            userId: user.id,
            roles: minimumRole,
            schemeEditor: minimumRole === MemberRole.Editor,
            schemeCommenter: minimumRole === MemberRole.Editor || minimumRole === MemberRole.Commenter,
            schemeViewer: minimumRole === MemberRole.Editor || minimumRole === MemberRole.Commenter || minimumRole === MemberRole.Viewer,
        } as BoardMember
        mutator.createBoardMember(newMember)
    }

    const onUpdateBoardMember = (member: BoardMember, newPermission: string) => {
        if (member.userId === me?.id && isLastAdmin(Object.values(members))) {
            sendFlashMessage({content: intl.formatMessage({id: 'shareBoard.lastAdmin', defaultMessage: 'Boards must have at least one Administrator'}), severity: 'low'})
            return
        }

        const newMember = {
            boardId: member.boardId,
            userId: member.userId,
            roles: member.roles,
        } as BoardMember

        switch (newPermission) {
        case MemberRole.Admin:
            if (member.schemeAdmin) {
                return
            }
            newMember.schemeAdmin = true
            newMember.schemeEditor = true
            break
        case MemberRole.Editor:
            if (!member.schemeAdmin && member.schemeEditor) {
                return
            }
            newMember.schemeAdmin = false
            newMember.schemeEditor = true
            break
        case MemberRole.Commenter:
            if (!member.schemeAdmin && !member.schemeEditor && member.schemeCommenter) {
                return
            }
            newMember.schemeAdmin = false
            newMember.schemeEditor = false
            newMember.schemeCommenter = true
            break
        case MemberRole.Viewer:
            if (!member.schemeAdmin && !member.schemeEditor && !member.schemeCommenter && member.schemeViewer) {
                return
            }
            newMember.schemeAdmin = false
            newMember.schemeEditor = false
            newMember.schemeCommenter = false
            newMember.schemeViewer = true
            break
        default:
            return
        }

        mutator.updateBoardMember(newMember, member)
    }

    const onDeleteBoardMember = (member: BoardMember) => {
        if (member.userId === me?.id && isLastAdmin(Object.values(members))) {
            sendFlashMessage({content: intl.formatMessage({id: 'shareBoard.lastAdmin', defaultMessage: 'Boards must have at least one Administrator'}), severity: 'low'})
            return
        }
        mutator.deleteBoardMember(member)
    }

    useEffect(() => {
        loadData()
    }, [boardId, hasSharePermissions, canManageACL])

    const buildDefaultDraft = (subjectType: ACLSubjectMode): ACLEntryDraft => ({
        subjectType,
        orgUnitId: '',
        positionCode: '',
        subjectId: '',
        permission: 'view',
    })

    const getACLEntryKey = (entry: BoardACLEntry, index: number): string => {
        return entry.id || `${entry.subjectType}-${entry.subjectId}-${entry.orgUnitId || ''}-${entry.positionCode || ''}-${entry.permission}-${index}`
    }

    const validateDraft = (draft: ACLEntryDraft): boolean => {
        if (draft.subjectType === 'org_position') {
            if (!draft.orgUnitId || !draft.positionCode) {
                sendFlashMessage({content: intl.formatMessage({id: 'shareBoard.acl.orgPosRequired', defaultMessage: '부서와 직위를 모두 선택하세요.'}), severity: 'low'})
                return false
            }
            return true
        }

        if (!draft.subjectId) {
            sendFlashMessage({content: intl.formatMessage({id: 'shareBoard.acl.subjectRequired', defaultMessage: '사용자를 선택하세요.'}), severity: 'low'})
            return false
        }
        return true
    }

    const draftToEntry = (draft: ACLEntryDraft, source?: BoardACLEntry): BoardACLEntry => {
        if (draft.subjectType === 'org_position') {
            return {
                id: source?.id || '',
                subjectType: 'org_position',
                subjectId: '',
                orgUnitId: draft.orgUnitId,
                positionCode: draft.positionCode,
                permission: draft.permission,
            }
        }

        return {
            id: source?.id || '',
            subjectType: 'user',
            subjectId: draft.subjectId,
            permission: draft.permission,
        }
    }

    const saveACL = async (entries: BoardACLEntry[]) => {
        const saved = await client.putBoardACL(boardId, entries)
        setAclEntries(saved)
    }

    const startCreateEntry = () => {
        const defaultMode: ACLSubjectMode = showAdvancedUserACL ? 'org_position' : 'org_position'
        setCreateDraft(buildDefaultDraft(defaultMode))
        setCreatingEntry(true)
    }

    const saveNewEntry = async () => {
        if (!validateDraft(createDraft)) {
            return
        }
        const entry = draftToEntry(createDraft)
        const nextEntries = [...aclEntries, entry]
        await saveACL(nextEntries)
        setCreatingEntry(false)
        setCreateDraft(buildDefaultDraft(showAdvancedUserACL ? createDraft.subjectType : 'org_position'))
    }

    const startEditEntry = (entry: BoardACLEntry, index: number) => {
        const entryKey = getACLEntryKey(entry, index)
        setEditingEntryKey(entryKey)
        setEntryDraft({
            subjectType: entry.subjectType === 'user' ? 'user' : 'org_position',
            orgUnitId: entry.orgUnitId || (entry.subjectType === 'org_unit' ? entry.subjectId : ''),
            positionCode: entry.positionCode || (entry.subjectType === 'position' ? entry.subjectId : ''),
            subjectId: entry.subjectId || '',
            permission: entry.permission,
        })
    }

    const saveEditedEntry = async (entry: BoardACLEntry, index: number) => {
        if (!validateDraft(entryDraft)) {
            return
        }

        const nextEntries = aclEntries.map((item, itemIndex) => {
            if (itemIndex !== index) {
                return item
            }
            return draftToEntry(entryDraft, entry)
        })
        await saveACL(nextEntries)
        setEditingEntryKey('')
    }

    const removeACLEntry = async (index: number) => {
        const nextEntries = aclEntries.filter((_, itemIndex) => itemIndex !== index)
        await saveACL(nextEntries)
    }

    const runPermissionPreview = async () => {
        const targetUserId = previewUserId.trim()
        if (!targetUserId) {
            setPreviewResult(undefined)
            return
        }
        const preview = await client.getBoardPermissionsPreview(boardId, targetUserId)
        setPreviewResult(preview)
    }

    const managerMembers = Object.values(members).filter((member) => member.schemeAdmin && !member.synthetic)

    const orgUnitNameById = useMemo(() => {
        return orgUnitOptions.reduce((acc: Record<string, string>, option) => {
            acc[option.id] = option.name
            return acc
        }, {})
    }, [orgUnitOptions])

    const positionNameById = useMemo(() => {
        return positionOptions.reduce((acc: Record<string, string>, option) => {
            acc[option.id] = option.name
            return acc
        }, {})
    }, [positionOptions])

    const boardUserOptions = useMemo(() => {
        return boardUsers.map((user) => ({
            id: user.id,
            name: Utils.getUserDisplayName(user, me?.props?.teammateNameDisplay || clientConfig.teammateNameDisplay),
        }))
    }, [boardUsers, me?.props?.teammateNameDisplay, clientConfig.teammateNameDisplay])

    const resolveACLSubjectLabel = (entry: BoardACLEntry): string => {
        if (entry.subjectType === 'org_position') {
            const orgName = orgUnitNameById[entry.orgUnitId || ''] || entry.orgUnitId || '-'
            const posName = positionNameById[entry.positionCode || ''] || entry.positionCode || '-'
            return `${orgName} + ${posName}`
        }
        if (entry.subjectType === 'org_unit') {
            return orgUnitNameById[entry.subjectId] || entry.subjectId
        }
        if (entry.subjectType === 'position') {
            return positionNameById[entry.subjectId] || entry.subjectId
        }
        const user = boardUsers.find((u) => u.id === entry.subjectId)
        if (user) {
            return Utils.getUserDisplayName(user, me?.props?.teammateNameDisplay || clientConfig.teammateNameDisplay)
        }
        return entry.subjectId
    }

    const isSharing = Boolean(sharing && sharing.id === boardId && sharing.enabled)
    const readToken = (sharing && isSharing) ? sharing.token : ''
    const shareUrl = new URL(window.location.toString())
    shareUrl.searchParams.set('r', readToken)
    const boardUrl = new URL(window.location.toString())

    if (params.teamId) {
        const newPath = generatePath('/team/:teamId/shared/:boardId/:viewId', {
            boardId: params.boardId ?? '',
            viewId: params.viewId ?? '',
            teamId: params.teamId,
        })
        shareUrl.pathname = Utils.buildURL(newPath)

        const boardPath = generatePath('/team/:teamId/:boardId/:viewId', {
            boardId: params.boardId ?? '',
            viewId: params.viewId ?? '',
            teamId: params.teamId,
        })
        boardUrl.pathname = Utils.getFrontendBaseURL() + boardPath
    } else {
        const newPath = generatePath('/shared/:boardId/:viewId', {
            boardId: params.boardId ?? '',
            viewId: params.viewId ?? '',
        })
        shareUrl.pathname = Utils.buildURL(newPath)
        boardUrl.pathname = Utils.buildURL(
            generatePath(':boardId/:viewId', {
                boardId: params.boardId ?? '',
                viewId: params.viewId ?? '',
            },
            ))
    }

    const shareBoardTitle = (
        <FormattedMessage
            id={'ShareBoard.Title'}
            defaultMessage={'Share Board'}
        />
    )

    const shareTemplateTitle = (
        <FormattedMessage
            id={'ShareTemplate.Title'}
            defaultMessage={'Share Template'}
        />
    )

    const formatOptionLabel = (userOrChannel: IUser | Channel) => {
        if ((userOrChannel as IUser).username) {
            const user = userOrChannel as IUser
            return (
                <div className='user-item'>
                    {Utils.isFocalboardPlugin() &&
                        <img
                            src={Utils.getProfilePicture(user.id)}
                            className='user-item__img'
                        />
                    }
                    <div className='ml-3'>
                        <strong>{Utils.getUserDisplayName(user, clientConfig.teammateNameDisplay)}</strong>
                        <GuestBadge show={Boolean(user?.is_guest)}/>
                        <AdminBadge permissions={user.permissions}/>
                    </div>
                </div>
            )
        }

        if (!Utils.isFocalboardPlugin()) {
            return null
        }

        const channel = userOrChannel as Channel
        return (
            <div className='user-item'>
                {channel.type === ChannelTypePrivate && <PrivateIcon/>}
                {channel.type === ChannelTypeOpen && <PublicIcon/>}
                <div className='ml-3'>
                    <strong>{channel.display_name}</strong>
                </div>
            </div>
        )
    }

    let confirmSubtext
    let confirmButtonText
    if (board.channelId === '') {
        confirmSubtext = intl.formatMessage({id: 'shareBoard.confirm-link-channel-subtext', defaultMessage: 'When you link a channel to a board, all members of the channel (existing and new) will be able to edit it. This excludes members who are guests.'})
        confirmButtonText = intl.formatMessage({id: 'shareBoard.confirm-link-channel-button', defaultMessage: 'Link channel'})
    } else {
        confirmSubtext = intl.formatMessage({id: 'shareBoard.confirm-link-channel-subtext-with-other-channel', defaultMessage: 'When you link a channel to a board, all members of the channel (existing and new) will be able to edit it. This excludes members who are guests.{lineBreak}This board is currently linked to another channel.\nIt will be unlinked if you choose to link it here.'}, {lineBreak: <p/>})
        confirmButtonText = intl.formatMessage({id: 'shareBoard.confirm-link-channel-button-with-other-channel', defaultMessage: 'Unlink and link here'})
    }

    return (
        <Dialog
            onClose={props.onClose}
            title={board.isTemplate ? shareTemplateTitle : shareBoardTitle}
            className='ShareBoardDialog'
        >
            {showLinkChannelConfirmation &&
                <ConfirmationDialog
                    dialogBox={{
                        heading: intl.formatMessage({id: 'shareBoard.confirm-link-channel', defaultMessage: 'Link board to channel'}),
                        subText: confirmSubtext,
                        confirmButtonText,
                        destructive: board.channelId !== '',
                        onConfirm: () => onLinkBoard(showLinkChannelConfirmation, true),
                        onClose: () => setShowLinkChannelConfirmation(null),
                    }}
                />}
            <BoardPermissionGate permissions={[Permission.ManageBoardRoles]}>
                <div className='share-input__container'>
                    <div className='share-input'>
                        <SearchIcon/>
                        <Select
                            styles={styles}
                            value={selectedUser}
                            className={'userSearchInput'}
                            cacheOptions={true}
                            filterOption={(o) => {
                                // render non-explicit members
                                if (members[o.value]) {
                                    return members[o.value].synthetic
                                }

                                // not a member, definitely render
                                return true
                            }}
                            loadOptions={async (inputValue: string) => {
                                const result = []
                                if (Utils.isFocalboardPlugin()) {
                                    const excludeBots = true
                                    const users = await client.searchTeamUsers(inputValue, excludeBots)
                                    if (users) {
                                        result.push({label: intl.formatMessage({id: 'shareBoard.members-select-group', defaultMessage: 'Members'}), options: users || []})
                                    }
                                    if (!board.isTemplate) {
                                        const channels = await client.searchUserChannels(params.teamId || '', inputValue)
                                        if (channels) {
                                            result.push({label: intl.formatMessage({id: 'shareBoard.channels-select-group', defaultMessage: 'Channels'}), options: channels || []})
                                        }
                                    }
                                } else {
                                    const users = await client.searchTeamUsers(inputValue) || []
                                    result.push(...users)
                                }
                                return result
                            }}
                            components={{DropdownIndicator: () => null, IndicatorSeparator: () => null}}
                            defaultOptions={true}
                            formatOptionLabel={formatOptionLabel}
                            getOptionValue={(u) => u.id}
                            getOptionLabel={(u: IUser|Channel) => (u as IUser).username || (u as Channel).display_name}
                            isMulti={false}
                            placeholder={board.isTemplate ?
                                intl.formatMessage({id: 'ShareTemplate.searchPlaceholder', defaultMessage: 'Search for people'}) :
                                intl.formatMessage({id: 'ShareBoard.searchPlaceholder', defaultMessage: 'Search for people and channels'})
                            }
                            onChange={(newValue) => {
                                if (newValue && (newValue as IUser).username) {
                                    addUser(newValue as IUser)
                                    setSelectedUser(null)
                                } else if (newValue) {
                                    onLinkBoard(newValue as Channel)
                                }
                            }}
                        />
                    </div>
                </div>
            </BoardPermissionGate>
            <div className='user-items'>
                <TeamPermissionsRow/>
                <ChannelPermissionsRow teammateNameDisplay={me?.props?.teammateNameDisplay || clientConfig.teammateNameDisplay}/>

                {boardUsers.map((user) => {
                    if (!members[user.id]) {
                        return null
                    }
                    if (members[user.id].synthetic) {
                        return null
                    }
                    return (
                        <UserPermissionsRow
                            key={user.id}
                            user={user}
                            member={members[user.id]}
                            teammateNameDisplay={me?.props?.teammateNameDisplay || clientConfig.teammateNameDisplay}
                            onDeleteBoardMember={onDeleteBoardMember}
                            onUpdateBoardMember={onUpdateBoardMember}
                            isMe={user.id === me?.id}
                        />
                    )
                })}
            </div>

            {canManageACL &&
            <div className='tabs-content'>
                <div className='text-heading2 mb-2'>
                    <FormattedMessage
                        id='shareBoard.acl.title'
                        defaultMessage='보드 접근 권한(ACL)'
                    />
                </div>
                <div className='text-light mb-2'>
                    <FormattedMessage
                        id='shareBoard.acl.description'
                        defaultMessage='사용자/팀/직위 단위의 권한(view/edit/manage/delete)을 관리합니다.'
                    />
                </div>
                <div className='d-flex align-items-center mb-2 ShareBoardDialog__acl-toolbar'>
                    <Switch
                        isOn={showAdvancedUserACL}
                        size='small'
                        onChanged={(value) => {
                            setShowAdvancedUserACL(value)
                            if (!value && creatingEntry && createDraft.subjectType === 'user') {
                                setCreateDraft(buildDefaultDraft('org_position'))
                            }
                        }}
                    />
                    <span className='ml-2 text-light'>
                        <FormattedMessage
                            id='shareBoard.acl.advancedUserMode'
                            defaultMessage='고급 모드(예외용 사용자 ACL)'
                        />
                    </span>
                    {!creatingEntry &&
                        <Button
                            emphasis='secondary'
                            size='small'
                            className='ml-auto'
                            onClick={startCreateEntry}
                            disabled={isACLOptionsLoading || !!aclOptionsError}
                        >
                            <FormattedMessage
                                id='shareBoard.acl.addRow'
                                defaultMessage='행 추가'
                            />
                        </Button>
                    }
                </div>
                {isACLOptionsLoading && (
                    <div className='text-light mb-2'>
                        <FormattedMessage
                            id='shareBoard.acl.optionsLoading'
                            defaultMessage='부서/직위 목록을 불러오는 중입니다...'
                        />
                    </div>
                )}
                {!!aclOptionsError && (
                    <div className='text-danger mb-2'>
                        {aclOptionsError}
                    </div>
                )}
                {!isACLOptionsLoading && !aclOptionsError && (orgUnitOptions.length === 0 || positionOptions.length === 0) && (
                    <div className='text-light mb-2'>
                        <FormattedMessage
                            id='shareBoard.acl.optionsEmpty'
                            defaultMessage='조직관리에서 부서/직위를 먼저 등록해주세요.'
                        />
                    </div>
                )}
                <div className='ShareBoardDialog__acl-list'>
                    <div className='ShareBoardDialog__acl-row ShareBoardDialog__acl-row--header'>
                        <span><FormattedMessage id='shareBoard.acl.column.orgUnit' defaultMessage='부서'/></span>
                        <span><FormattedMessage id='shareBoard.acl.column.position' defaultMessage='직위'/></span>
                        <span><FormattedMessage id='shareBoard.acl.column.permission' defaultMessage='권한'/></span>
                        <span><FormattedMessage id='shareBoard.acl.column.actions' defaultMessage='동작'/></span>
                    </div>

                    {aclEntries.map((entry, index) => {
                        const entryKey = getACLEntryKey(entry, index)
                        const isEditing = editingEntryKey === entryKey
                        const isUserEntry = entry.subjectType === 'user'
                        const userLabel = resolveACLSubjectLabel(entry)
                        const orgLabel = isUserEntry ? intl.formatMessage({id: 'shareBoard.acl.userException', defaultMessage: '사용자 예외'}) : (orgUnitNameById[entry.orgUnitId || ''] || '-')
                        const positionLabel = isUserEntry ? userLabel : (positionNameById[entry.positionCode || ''] || '-')
                        const debugId = isUserEntry ? entry.subjectId : `${entry.orgUnitId || '-'} + ${entry.positionCode || '-'}`

                        return (
                            <div key={entryKey} className='ShareBoardDialog__acl-row'>
                                {isEditing && entryDraft.subjectType === 'org_position' && (
                                    <>
                                        <select
                                            value={entryDraft.orgUnitId}
                                            onChange={(e) => setEntryDraft((prev) => ({...prev, orgUnitId: e.target.value}))}
                                            className='form-control'
                                            disabled={isACLOptionsLoading}
                                        >
                                            <option value=''>부서 선택</option>
                                            {orgUnitOptions.map((option) => (
                                                <option key={option.id} value={option.id}>{option.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={entryDraft.positionCode}
                                            onChange={(e) => setEntryDraft((prev) => ({...prev, positionCode: e.target.value}))}
                                            className='form-control'
                                            disabled={isACLOptionsLoading}
                                        >
                                            <option value=''>직위 선택</option>
                                            {positionOptions.map((option) => (
                                                <option key={option.id} value={option.id}>{option.name}</option>
                                            ))}
                                        </select>
                                    </>
                                )}

                                {isEditing && entryDraft.subjectType === 'user' && (
                                    <>
                                        <span className='text-light'>사용자 예외</span>
                                        <select
                                            value={entryDraft.subjectId}
                                            onChange={(e) => setEntryDraft((prev) => ({...prev, subjectId: e.target.value}))}
                                            className='form-control'
                                        >
                                            <option value=''>사용자 선택</option>
                                            {boardUserOptions.map((option) => (
                                                <option key={option.id} value={option.id}>{option.name}</option>
                                            ))}
                                        </select>
                                    </>
                                )}

                                {!isEditing && (
                                    <>
                                        <span title={showAdvancedUserACL ? debugId : undefined}>{orgLabel}</span>
                                        <span title={showAdvancedUserACL ? debugId : undefined}>{positionLabel}</span>
                                    </>
                                )}

                                <select
                                    value={isEditing ? entryDraft.permission : entry.permission}
                                    onChange={(e) => {
                                        const next = e.target.value as ACLPermission
                                        if (isEditing) {
                                            setEntryDraft((prev) => ({...prev, permission: next}))
                                            return
                                        }
                                        const nextEntries = aclEntries.map((item, itemIndex) => {
                                            if (itemIndex !== index) {
                                                return item
                                            }
                                            return {...item, permission: next}
                                        })
                                        void saveACL(nextEntries)
                                    }}
                                    className='form-control'
                                    disabled={isACLOptionsLoading}
                                >
                                    <option value='view'>view</option>
                                    <option value='edit'>edit</option>
                                    <option value='manage'>manage</option>
                                    <option value='delete'>delete</option>
                                </select>

                                <div className='ShareBoardDialog__acl-actions'>
                                    {!isEditing && (
                                        <Button emphasis='tertiary' size='small' onClick={() => startEditEntry(entry, index)}>
                                            <FormattedMessage id='shareBoard.acl.editEntry' defaultMessage='수정'/>
                                        </Button>
                                    )}
                                    {isEditing && (
                                        <>
                                            <Button emphasis='secondary' size='small' onClick={() => saveEditedEntry(entry, index)} disabled={isACLOptionsLoading}>
                                                <FormattedMessage id='shareBoard.acl.saveEntry' defaultMessage='저장'/>
                                            </Button>
                                            <Button emphasis='tertiary' size='small' onClick={() => setEditingEntryKey('')}>
                                                <FormattedMessage id='shareBoard.acl.cancelEdit' defaultMessage='취소'/>
                                            </Button>
                                        </>
                                    )}
                                    <Button emphasis='tertiary' size='small' onClick={() => removeACLEntry(index)}>
                                        <FormattedMessage id='shareBoard.acl.removeEntry' defaultMessage='삭제'/>
                                    </Button>
                                </div>
                            </div>
                        )
                    })}

                    {creatingEntry && (
                        <div className='ShareBoardDialog__acl-row ShareBoardDialog__acl-row--editing'>
                            {showAdvancedUserACL && (
                                <select
                                    value={createDraft.subjectType}
                                    onChange={(e) => setCreateDraft(buildDefaultDraft(e.target.value as ACLSubjectMode))}
                                    className='form-control'
                                >
                                    <option value='org_position'>부서+직위</option>
                                    <option value='user'>사용자(예외)</option>
                                </select>
                            )}
                            {!showAdvancedUserACL && <span className='text-light'>신규 ACL</span>}

                            {createDraft.subjectType === 'org_position' ? (
                                <>
                                    <select
                                        value={createDraft.orgUnitId}
                                        onChange={(e) => setCreateDraft((prev) => ({...prev, orgUnitId: e.target.value}))}
                                        className='form-control'
                                        disabled={isACLOptionsLoading}
                                    >
                                        <option value=''>부서 선택</option>
                                        {orgUnitOptions.map((option) => (
                                            <option key={option.id} value={option.id}>{option.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={createDraft.positionCode}
                                        onChange={(e) => setCreateDraft((prev) => ({...prev, positionCode: e.target.value}))}
                                        className='form-control'
                                        disabled={isACLOptionsLoading}
                                    >
                                        <option value=''>직위 선택</option>
                                        {positionOptions.map((option) => (
                                            <option key={option.id} value={option.id}>{option.name}</option>
                                        ))}
                                    </select>
                                </>
                            ) : (
                                <>
                                    <span className='text-light'>사용자 예외</span>
                                    <select
                                        value={createDraft.subjectId}
                                        onChange={(e) => setCreateDraft((prev) => ({...prev, subjectId: e.target.value}))}
                                        className='form-control'
                                    >
                                        <option value=''>사용자 선택</option>
                                        {boardUserOptions.map((option) => (
                                            <option key={option.id} value={option.id}>{option.name}</option>
                                        ))}
                                    </select>
                                </>
                            )}

                            <select
                                value={createDraft.permission}
                                onChange={(e) => setCreateDraft((prev) => ({...prev, permission: e.target.value as ACLPermission}))}
                                className='form-control'
                            >
                                <option value='view'>view</option>
                                <option value='edit'>edit</option>
                                <option value='manage'>manage</option>
                                <option value='delete'>delete</option>
                            </select>

                            <div className='ShareBoardDialog__acl-actions'>
                                <Button
                                    emphasis='secondary'
                                    size='small'
                                    onClick={saveNewEntry}
                                    disabled={
                                        isACLOptionsLoading ||
                                        (createDraft.subjectType === 'org_position' && (!createDraft.orgUnitId || !createDraft.positionCode)) ||
                                        (createDraft.subjectType === 'user' && !createDraft.subjectId)
                                    }
                                >
                                    <FormattedMessage id='shareBoard.acl.addEntry' defaultMessage='추가'/>
                                </Button>
                                <Button emphasis='tertiary' size='small' onClick={() => setCreatingEntry(false)}>
                                    <FormattedMessage id='shareBoard.acl.cancelAdd' defaultMessage='취소'/>
                                </Button>
                            </div>
                        </div>
                    )}

                    {aclEntries.length === 0 && !creatingEntry &&
                        <div className='text-light ShareBoardDialog__acl-empty'>
                            <FormattedMessage id='shareBoard.acl.empty' defaultMessage='등록된 ACL이 없습니다.'/>
                        </div>
                    }
                </div>
            </div>
            }

            {canManageACL &&
            <div className='tabs-content'>
                <div className='text-heading2 mb-2'>
                    <FormattedMessage
                        id='shareBoard.managerSection.title'
                        defaultMessage='보드 관리자 섹션'
                    />
                </div>
                <div className='text-light mb-2'>
                    <FormattedMessage
                        id='shareBoard.managerSection.description'
                        defaultMessage='manage 권한 보유자 목록입니다. 보드 생성자는 소유자입니다.'
                    />
                </div>
                <div className='user-items'>
                    {managerMembers.map((member) => {
                        const user = boardUsers.find((u) => u.id === member.userId)
                        return (
                            <div
                                key={`manager-${member.userId}`}
                                className='user-item'
                            >
                                <div className='user-item__content'>
                                    <strong>{user ? Utils.getUserDisplayName(user, me?.props?.teammateNameDisplay || clientConfig.teammateNameDisplay) : member.userId}</strong>
                                    {board.createdBy === member.userId &&
                                        <span className='ml-2 text-light'>
                                            <FormattedMessage
                                                id='shareBoard.managerSection.ownerBadge'
                                                defaultMessage='(소유자)'
                                            />
                                        </span>
                                    }
                                </div>
                            </div>
                        )
                    })}
                    {managerMembers.length === 0 &&
                        <div className='text-light'>
                            <FormattedMessage
                                id='shareBoard.managerSection.empty'
                                defaultMessage='보드 관리자가 없습니다.'
                            />
                        </div>
                    }
                </div>
            </div>
            }

            {canManageACL &&
            <div className='tabs-content'>
                <div className='text-heading2 mb-2'>
                    <FormattedMessage
                        id='shareBoard.permissionPreview.title'
                        defaultMessage='권한 미리보기'
                    />
                </div>
                <div className='d-flex mb-2'>
                    <input
                        value={previewUserId}
                        onChange={(e) => setPreviewUserId(e.target.value)}
                        className='form-control mr-1'
                        placeholder='preview userId'
                    />
                    <Button onClick={runPermissionPreview}>
                        <FormattedMessage
                            id='shareBoard.permissionPreview.run'
                            defaultMessage='미리보기'
                        />
                    </Button>
                </div>
                {previewResult &&
                    <div className='text-light'>
                        <div>{`effectivePermission: ${previewResult.effectivePermission}`}</div>
                        <div>{`derivedFrom: ${previewResult.derivedFrom}`}</div>
                        <div>{`canView: ${String(previewResult.capabilities.canView)}, canCreateCard: ${String(previewResult.capabilities.canCreateCard)}, canEditCard: ${String(previewResult.capabilities.canEditCard)}, canDeleteCard: ${String(previewResult.capabilities.canDeleteCard)}, canManageBoard: ${String(previewResult.capabilities.canManageBoard)}`}</div>
                    </div>
                }
            </div>
            }

            {props.enableSharedBoards && !board.isTemplate && (
                <div className='tabs-container'>
                    <button
                        onClick={() => setPublish(false)}
                        className={`tab-item ${!publish && 'tab-item--active'}`}
                    >
                        <FormattedMessage
                            id='share-board.share'
                            defaultMessage='Share'
                        />
                    </button>
                    <BoardPermissionGate permissions={[Permission.ShareBoard]}>
                        <button
                            onClick={() => setPublish(true)}
                            className={`tab-item ${publish && 'tab-item--active'}`}
                        >
                            <FormattedMessage
                                id='share-board.publish'
                                defaultMessage='Publish'
                            />
                        </button>
                    </BoardPermissionGate>
                </div>
            )}
            {(props.enableSharedBoards && publish && !board.isTemplate) &&
            (<BoardPermissionGate permissions={[Permission.ShareBoard]}>
                <div className='tabs-content'>
                    <div>
                        <div className='d-flex justify-content-between'>
                            <div className='d-flex flex-column'>
                                <div className='text-heading2'>{intl.formatMessage({id: 'ShareBoard.PublishTitle', defaultMessage: 'Publish to the web'})}</div>
                                <div className='text-light'>{intl.formatMessage({id: 'ShareBoard.PublishDescription', defaultMessage: 'Publish and share a read-only link with everyone on the web.'})}</div>
                            </div>
                            <div>
                                <Switch
                                    isOn={isSharing}
                                    size='medium'
                                    onChanged={onShareChanged}
                                />
                            </div>
                        </div>
                    </div>
                    {isSharing &&
                            (<div className='d-flex justify-content-between tabs-inputs'>
                                <div className='d-flex input-container'>
                                    <a
                                        className='shareUrl'
                                        href={shareUrl.toString()}
                                        target='_blank'
                                        rel='noreferrer'
                                    >
                                        {shareUrl.toString()}
                                    </a>
                                    <Tooltip
                                        key={'regenerateToken'}
                                        title={intl.formatMessage({id: 'ShareBoard.regenerate', defaultMessage: 'Regenerate token'})}
                                    >
                                        <IconButton
                                            size='small'
                                            onClick={onRegenerateToken}
                                            icon={
                                                <CompassIcon
                                                    icon='refresh'
                                                />}
                                            title={intl.formatMessage({id: 'ShareBoard.regenerate', defaultMessage: 'Regenerate token'})}
                                        />
                                    </Tooltip>
                                </div>
                                <Button
                                    emphasis='secondary'
                                    size='medium'
                                    title='Copy public link'
                                    icon={
                                        <CompassIcon
                                            icon='content-copy'
                                            className='CompassIcon'
                                        />
                                    }
                                    onClick={() => {
                                        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ShareLinkPublicCopy, {board: boardId})
                                        Utils.copyTextToClipboard(shareUrl.toString())
                                        setWasCopiedPublic(true)
                                        setWasCopiedInternal(false)
                                    }}
                                >
                                    {wasCopiedPublic &&
                                        <FormattedMessage
                                            id='ShareBoard.copiedLink'
                                            defaultMessage='Copied!'
                                        />}
                                    {!wasCopiedPublic &&
                                        <FormattedMessage
                                            id='ShareBoard.copyLink'
                                            defaultMessage='Copy link'
                                        />}
                                </Button>
                            </div>)
                    }
                </div>
            </BoardPermissionGate>
            )}

            {!publish && !board.isTemplate && (
                <div className='tabs-content'>
                    <div>
                        <div className='d-flex justify-content-between'>
                            <div className='d-flex flex-column'>
                                <div className='text-heading2'>{intl.formatMessage({id: 'ShareBoard.ShareInternal', defaultMessage: 'Share internally'})}</div>
                                <div className='text-light'>{intl.formatMessage({id: 'ShareBoard.ShareInternalDescription', defaultMessage: 'Users who have permissions will be able to use this link.'})}</div>
                            </div>
                        </div>
                    </div>
                    <div className='d-flex justify-content-between tabs-inputs'>
                        <div className='d-flex input-container'>
                            <a
                                className='shareUrl'
                                href={boardUrl.toString()}
                                target='_blank'
                                rel='noreferrer'
                            >
                                {boardUrl.toString()}
                            </a>
                        </div>
                        <Button
                            emphasis='secondary'
                            size='medium'
                            title={intl.formatMessage({id: 'ShareBoard.copyLink', defaultMessage: 'Copy link'})}
                            onClick={() => {
                                TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ShareLinkInternalCopy, {board: boardId})
                                Utils.copyTextToClipboard(boardUrl.toString())
                                setWasCopiedPublic(false)
                                setWasCopiedInternal(true)
                            }}
                            icon={
                                <CompassIcon
                                    icon='content-copy'
                                    className='CompassIcon'
                                />
                            }
                        >
                            {wasCopiedInternal &&
                                <FormattedMessage
                                    id='ShareBoard.copiedLink'
                                    defaultMessage='Copied!'
                                />}
                            {!wasCopiedInternal &&
                                <FormattedMessage
                                    id='ShareBoard.copyLink'
                                    defaultMessage='Copy link'
                                />}
                        </Button>
                    </div>
                </div>
            )}
        </Dialog>
    )
}
