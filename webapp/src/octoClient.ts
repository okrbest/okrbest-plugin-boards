// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { Client4 } from "mattermost-redux/client"

import {Block, BlockPatch, FileInfo} from './blocks/block'
import {Board, BoardsAndBlocks, BoardsAndBlocksPatch, BoardPatch, BoardMember, BoardPermissionsResponse, BoardACLEntry, ACLSubjectOption} from './blocks/board'
import {ISharing} from './blocks/sharing'
import {OctoUtils} from './octoUtils'
import {IUser, UserConfigPatch, UserPreference} from './user'
import {Utils} from './utils'
import {ClientConfig} from './config/clientConfig'
import {UserSettings} from './userSettings'
import {Category, CategoryBoards} from './store/sidebar'
import {Channel} from './store/channels'
import {Team} from './store/teams'
import {Subscription} from './wsclient'
import {PrepareOnboardingResponse} from './onboardingTour'
import {Constants} from './constants'

import {BoardsCloudLimits} from './boardsCloudLimits'
import {TopBoardResponse} from './insights'
import {BoardSiteStatistics, BlockSuiteMigrationStatus, UnmigratedCardsResponse} from './statistics'

//
// OctoClient is the client interface to the server APIs
//
class OctoClient {
    readonly serverUrl: string | undefined
    private logged = false

    // this need to be a function rather than a const because
    // one of the global variable (`window.baseURL`) is set at runtime
    // after the first instance of OctoClient is created.
    // Avoiding the race condition becomes more complex than making
    // the base URL dynamic though a function
    private getBaseURL(): string {
        const baseURL = (this.serverUrl || Utils.getBaseURL(true)).replace(/\/$/, '')

        // Logging this for debugging.
        // Logging just once to avoid log noise.
        if (!this.logged) {
            Utils.log(`OctoClient baseURL: ${baseURL}`)
            this.logged = true
        }

        return baseURL
    }

    get token(): string {
        return localStorage.getItem('focalboardSessionId') || ''
    }
    set token(value: string) {
        localStorage.setItem('focalboardSessionId', value)
    }

    constructor(serverUrl?: string, public teamId = Constants.globalTeamId, public channelId = Constants.noChannelID) {
        this.serverUrl = serverUrl
    }

    private async getJson<T>(response: Response, defaultValue: T): Promise<T> {
        // The server may return null or malformed json
        try {
            const value = await response.json()
            return value || defaultValue
        } catch {
            return defaultValue
        }
    }

    async login(username: string, password: string): Promise<boolean> {
        const path = '/api/v2/login'
        const body = JSON.stringify({username, password, type: 'normal'})
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
        if (response.status !== 200) {
            return false
        }

        const responseJson = (await this.getJson(response, {})) as {token?: string}
        if (responseJson.token) {
            localStorage.setItem('focalboardSessionId', responseJson.token)
            return true
        }
        return false
    }

    async logout(): Promise<boolean> {
        const path = '/api/v2/logout'
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
        }))
        localStorage.removeItem('focalboardSessionId')

        if (response.status !== 200) {
            return false
        }
        return true
    }

    async getClientConfig(): Promise<ClientConfig | null> {
        const path = '/api/v2/clientConfig'
        const response = await fetch(this.getBaseURL() + path, {
            method: 'GET',
            headers: this.headers(),
        })
        if (response.status !== 200) {
            return null
        }

        const json = (await this.getJson(response, {})) as ClientConfig
        return json
    }

    async register(email: string, username: string, password: string, token?: string): Promise<{code: number, json: {error?: string}}> {
        const path = '/api/v2/register'
        const body = JSON.stringify({email, username, password, token})
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
        const json = (await this.getJson(response, {})) as {error?: string}
        return {code: response.status, json}
    }

    async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<{code: number, json: {error?: string}}> {
        const path = `/api/v2/users/${encodeURIComponent(userId)}/changepassword`
        const body = JSON.stringify({oldPassword, newPassword})
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
        const json = (await this.getJson(response, {})) as {error?: string}
        return {code: response.status, json}
    }

    private headers() {
        return {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: this.token ? 'Bearer ' + this.token : '',
            'X-Requested-With': 'XMLHttpRequest',
        }
    }

    private teamPath(teamId?: string): string {
        let teamIdToUse = teamId
        if (!teamId) {
            teamIdToUse = this.teamId === Constants.globalTeamId ? UserSettings.lastTeamId || this.teamId : this.teamId
        }

        return `/api/v2/teams/${teamIdToUse}`
    }

    private teamsPath(): string {
        return '/api/v2/teams'
    }

    async getMe(): Promise<IUser | undefined> {
        let path = '/api/v2/users/me'
        let parameters = ''
        if (this.teamId !== Constants.globalTeamId) {
            parameters = `teamID=${this.teamId}`
        }
        if (this.channelId !== Constants.noChannelID) {
            const channelClause = `channelID=${this.channelId}`
            if (parameters) {
                parameters += '&' + channelClause
            } else {
                parameters = channelClause
            }
        }
        if (parameters) {
            path += '?' + parameters
        }
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }
        const user = (await this.getJson(response, {})) as IUser
        return user
    }

    async getMyBoardMemberships(): Promise<BoardMember[]> {
        const path = '/api/v2/users/me/memberships'
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        const members = (await this.getJson(response, [])) as BoardMember[]
        return members
    }

    async getUser(userId: string): Promise<IUser | undefined> {
        const path = `/api/v2/users/${encodeURIComponent(userId)}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }
        const user = (await this.getJson(response, {})) as IUser
        return user
    }

    async getUsersList(userIds: string[]): Promise<IUser[] | []> {
        const path = '/api/v2/users'
        const body = JSON.stringify(userIds)
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            headers: this.headers(),
            method: 'POST',
            body,
        }))

        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as IUser[]
    }

    async getMyConfig(): Promise<UserPreference[] | undefined> {
        const path = '/api/v2/users/me/config'
        const response = await fetch(this.getBaseURL() + path, {
            headers: this.headers(),
            method: 'GET',
        })

        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, [])) as UserPreference[]
    }

    async patchUserConfig(userID: string, patch: UserConfigPatch): Promise<UserPreference[] | undefined> {
        const path = `/api/v2/users/${encodeURIComponent(userID)}/config`
        const body = JSON.stringify(patch)
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            headers: this.headers(),
            method: 'PUT',
            body,
        }))

        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, {})) as UserPreference[]
    }

    async exportBoardArchive(boardID: string): Promise<Response> {
        const path = `/api/v2/boards/${boardID}/archive/export`
        return fetch(this.getBaseURL() + path, {headers: this.headers()})
    }

    async exportFullArchive(teamID: string): Promise<Response> {
        const path = `/api/v2/teams/${teamID}/archive/export`
        return fetch(this.getBaseURL() + path, {headers: this.headers()})
    }

    async importFullArchive(file: File): Promise<Response> {
        const formData = new FormData()
        formData.append('file', file)

        const headers = this.headers() as Record<string, string>

        // TIPTIP: Leave out Content-Type here, it will be automatically set by the browser
        delete headers['Content-Type']

        return fetch(this.getBaseURL() + this.teamPath() + '/archive/import', Client4.getOptions({
            method: 'POST',
            headers,
            body: formData,
        }))
    }

    async getBlocksWithParent(parentId: string, type?: string): Promise<Block[]> {
        let path: string
        if (type) {
            path = this.teamPath() + `/blocks?parent_id=${encodeURIComponent(parentId)}&type=${encodeURIComponent(type)}`
        } else {
            path = this.teamPath() + `/blocks?parent_id=${encodeURIComponent(parentId)}`
        }
        return this.getBlocksWithPath(path)
    }

    async getBlocksWithType(type: string): Promise<Block[]> {
        const path = this.teamPath() + `/blocks?type=${encodeURIComponent(type)}`
        return this.getBlocksWithPath(path)
    }

    async getBlocksWithBlockID(blockID: string, boardID: string, optionalReadToken?: string): Promise<Block[]> {
        let path = `/api/v2/boards/${boardID}/blocks?block_id=${blockID}`
        const readToken = optionalReadToken || Utils.getReadToken()
        if (readToken) {
            path += `&read_token=${readToken}`
        }
        return this.getBlocksWithPath(path)
    }

    async getAllBlocks(boardID: string): Promise<Block[]> {
        let path = `/api/v2/boards/${boardID}/blocks?all=true`
        const readToken = Utils.getReadToken()
        if (readToken) {
            path += `&read_token=${readToken}`
        }
        return this.getBlocksWithPath(path)
    }

    async getCardsByIDs(boardID: string, cardIDs: string[]): Promise<Block[]> {
        if (cardIDs.length === 0) {
            return []
        }

        const path = `/api/v2/boards/${boardID}/cards/by-ids`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ids: cardIDs}),
        }))
        if (response.status !== 200) {
            return []
        }
        const cards = await this.getJson<unknown[]>(response, [])
        const normalizedCards = this.normalizeCardLikeBlocks(cards)
        return this.fixBlocks(normalizedCards)
    }

    private async getBlocksWithPath(path: string): Promise<Block[]> {
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            return []
        }
        const blocks = (await this.getJson(response, [])) as Block[]
        return this.fixBlocks(blocks)
    }

    private async getBoardsWithPath(path: string): Promise<Board[]> {
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        this.logBoardsDebugHeaders(path, response)
        if (response.status !== 200) {
            return []
        }
        const boards = (await this.getJson(response, [])) as Board[]
        return boards
    }

    private logBoardsDebugHeaders(path: string, response: Response) {
        const teamAccess = response.headers.get('X-Boards-Debug-TeamAccess')
        if (!teamAccess) {
            return
        }

        console.debug('[Boards Debug Headers]', {
            path,
            status: response.status,
            teamAccess,
            orgContextSource: response.headers.get('X-Boards-Debug-OrgContextSource'),
            isGuest: response.headers.get('X-Boards-Debug-IsGuest'),
            isCEO: response.headers.get('X-Boards-Debug-IsCEO'),
            boardsCount: response.headers.get('X-Boards-Debug-BoardsCount'),
            orgUnitIds: response.headers.get('X-Boards-Debug-OrgUnitIds'),
            positionCodes: response.headers.get('X-Boards-Debug-PositionCodes'),
            fullVisibilityPositionIds: response.headers.get('X-Boards-Debug-FullVisibilityPositionIds'),
            isCEOFromProps: response.headers.get('X-Boards-Debug-IsCEO-FromProps'),
            isCEOFromFallback: response.headers.get('X-Boards-Debug-IsCEO-FromFallback'),
        })
    }

    private async getBoardMembersWithPath(path: string): Promise<BoardMember[]> {
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            return []
        }
        const boardMembers = (await this.getJson(response, [])) as BoardMember[]
        return boardMembers
    }

    fixBlocks(blocks: Block[]): Block[] {
        if (!blocks) {
            return []
        }

        // Hydrate is important, as it ensures that each block is complete to the current model
        const fixedBlocks = OctoUtils.hydrateBlocks(blocks)

        return fixedBlocks
    }

    private normalizeCardLikeBlocks(rawCards: unknown[]): Block[] {
        if (!Array.isArray(rawCards)) {
            return []
        }

        return rawCards.reduce<Block[]>((acc, rawCard) => {
            if (!rawCard || typeof rawCard !== 'object') {
                return acc
            }

            const candidate = rawCard as Partial<Block> & {
                contentOrder?: unknown
                icon?: unknown
                isTemplate?: unknown
                properties?: unknown
                parentCardId?: unknown
                depth?: unknown
            }

            if (typeof candidate.type === 'string') {
                acc.push(candidate as Block)
                return acc
            }

            if (typeof candidate.id !== 'string' || candidate.id === '') {
                return acc
            }

            const boardId = typeof candidate.boardId === 'string' ? candidate.boardId : ''
            const parentCardId = typeof candidate.parentCardId === 'string' ? candidate.parentCardId : ''
            const contentOrder = Array.isArray(candidate.contentOrder) ? candidate.contentOrder.filter((id): id is string => typeof id === 'string') : []
            const properties = candidate.properties && typeof candidate.properties === 'object' && !Array.isArray(candidate.properties) ? candidate.properties : {}
            const now = Date.now()

            acc.push({
                id: candidate.id,
                boardId,
                parentId: parentCardId || boardId || '',
                createdBy: typeof candidate.createdBy === 'string' ? candidate.createdBy : '',
                modifiedBy: typeof candidate.modifiedBy === 'string' ? candidate.modifiedBy : '',
                schema: typeof candidate.schema === 'number' ? candidate.schema : 1,
                type: 'card',
                title: typeof candidate.title === 'string' ? candidate.title : '',
                fields: {
                    icon: typeof candidate.icon === 'string' ? candidate.icon : '',
                    isTemplate: typeof candidate.isTemplate === 'boolean' ? candidate.isTemplate : false,
                    properties,
                    contentOrder,
                    parentCardId,
                    depth: typeof candidate.depth === 'number' ? candidate.depth : 0,
                },
                createAt: typeof candidate.createAt === 'number' ? candidate.createAt : now,
                updateAt: typeof candidate.updateAt === 'number' ? candidate.updateAt : now,
                deleteAt: typeof candidate.deleteAt === 'number' ? candidate.deleteAt : 0,
                limited: Boolean(candidate.limited),
            })

            return acc
        }, [])
    }

    async patchBlock(boardId: string, blockId: string, blockPatch: BlockPatch): Promise<Response> {
        Utils.log(`patchBlock: ${blockId} block`)
        const body = JSON.stringify(blockPatch)
        return fetch(`${this.getBaseURL()}/api/v2/boards/${boardId}/blocks/${blockId}`, Client4.getOptions({
            method: 'PATCH',
            headers: this.headers(),
            body,
        }))
    }

    async patchBlocks(blocks: Block[], blockPatches: BlockPatch[]): Promise<Response> {
        Utils.log(`patchBlocks: ${blocks.length} blocks`)
        const blockIds = blocks.map((block) => block.id)
        const body = JSON.stringify({block_ids: blockIds, block_patches: blockPatches})

        const path = this.getBaseURL() + this.teamPath() + '/blocks'
        const response = fetch(path, Client4.getOptions({
            method: 'PATCH',
            headers: this.headers(),
            body,
        }))
        return response
    }

    async deleteBlock(boardId: string, blockId: string): Promise<Response> {
        Utils.log(`deleteBlock: ${blockId} on board ${boardId}`)
        return fetch(`${this.getBaseURL()}/api/v2/boards/${boardId}/blocks/${encodeURIComponent(blockId)}`, Client4.getOptions({
            method: 'DELETE',
            headers: this.headers(),
        }))
    }

    async undeleteBlock(boardId: string, blockId: string): Promise<Response> {
        Utils.log(`undeleteBlock: ${blockId}`)
        return fetch(`${this.getBaseURL()}/api/v2/boards/${encodeURIComponent(boardId)}/blocks/${encodeURIComponent(blockId)}/undelete`, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
        }))
    }

    async undeleteBoard(boardId: string): Promise<Response> {
        Utils.log(`undeleteBoard: ${boardId}`)
        return fetch(`${this.getBaseURL()}/api/v2/boards/${boardId}/undelete`, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
        }))
    }

    async followBlock(blockId: string, blockType: string, userId: string): Promise<Response> {
        const body: Subscription = {
            blockType,
            blockId,
            subscriberType: 'user',
            subscriberId: userId,
        }

        return fetch(this.getBaseURL() + '/api/v2/subscriptions', Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
        }))
    }

    async unfollowBlock(blockId: string, blockType: string, userId: string): Promise<Response> {
        return fetch(this.getBaseURL() + `/api/v2/subscriptions/${blockId}/${userId}`, Client4.getOptions({
            method: 'DELETE',
            headers: this.headers(),
        }))
    }

    async insertBlock(boardId: string, block: Block): Promise<Response> {
        return this.insertBlocks(boardId, [block])
    }

    async insertBlocks(boardId: string, blocks: Block[], sourceBoardID?: string): Promise<Response> {
        Utils.log(`insertBlocks: ${blocks.length} blocks(s) on board ${boardId}`)
        blocks.forEach((block) => {
            Utils.log(`\t ${block.type}, ${block.id}, ${block.title?.substr(0, 50) || ''}`)
        })
        const body = JSON.stringify(blocks)
        return fetch(`${this.getBaseURL()}/api/v2/boards/${boardId}/blocks` + (sourceBoardID ? `?sourceBoardID=${encodeURIComponent(sourceBoardID)}` : ''), Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
    }

    async createBoardsAndBlocks(bab: BoardsAndBlocks): Promise<Response> {
        Utils.log(`createBoardsAndBlocks: ${bab.boards.length} board(s) ${bab.blocks.length} block(s)`)
        bab.boards.forEach((board: Board) => {
            Utils.log(`\t Board ${board.id}, ${board.type}, ${board.title?.substr(0, 50) || ''}`)
        })
        bab.blocks.forEach((block: Block) => {
            Utils.log(`\t Block ${block.id}, ${block.type}, ${block.title?.substr(0, 50) || ''}`)
        })

        const body = JSON.stringify(bab)
        return fetch(this.getBaseURL() + '/api/v2/boards-and-blocks', Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
    }

    async deleteBoardsAndBlocks(boardIds: string[], blockIds: string[]): Promise<Response> {
        Utils.log(`deleteBoardsAndBlocks: ${boardIds.length} board(s) ${blockIds.length} block(s)`)
        Utils.log(`\t Boards ${boardIds.join(', ')}`)
        Utils.log(`\t Blocks ${blockIds.join(', ')}`)

        const body = JSON.stringify({boards: boardIds, blocks: blockIds})
        return fetch(this.getBaseURL() + '/api/v2/boards-and-blocks', Client4.getOptions({
            method: 'DELETE',
            headers: this.headers(),
            body,
        }))
    }

    // BoardMember
    async createBoardMember(member: Partial<BoardMember>): Promise<BoardMember|undefined> {
        Utils.log(`createBoardMember: user ${member.userId} and board ${member.boardId}`)

        const body = JSON.stringify(member)
        const response = await fetch(this.getBaseURL() + `/api/v2/boards/${member.boardId}/members`, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<BoardMember>(response, {} as BoardMember)
    }

    async joinBoard(boardId: string, allowAdmin: boolean): Promise<BoardMember|undefined> {
        Utils.log(`joinBoard: board ${boardId}`)
        let path = `/api/v2/boards/${boardId}/join`
        if (allowAdmin) {
            path += '?allow_admin'
        }
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            headers: this.headers(),
            method: 'POST',
        }))

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<BoardMember>(response, {} as BoardMember)
    }

    async updateBoardMember(member: BoardMember): Promise<Response> {
        Utils.log(`udpateBoardMember: user ${member.userId} and board ${member.boardId}`)

        const body = JSON.stringify(member)
        return fetch(this.getBaseURL() + `/api/v2/boards/${member.boardId}/members/${member.userId}`, Client4.getOptions({
            method: 'PUT',
            headers: this.headers(),
            body,
        }))
    }

    async deleteBoardMember(member: BoardMember): Promise<Response> {
        Utils.log(`deleteBoardMember: user ${member.userId} and board ${member.boardId}`)

        return fetch(this.getBaseURL() + `/api/v2/boards/${member.boardId}/members/${member.userId}`, Client4.getOptions({
            method: 'DELETE',
            headers: this.headers(),
        }))
    }

    async patchBoardsAndBlocks(babp: BoardsAndBlocksPatch): Promise<Response> {
        Utils.log(`patchBoardsAndBlocks: ${babp.boardIDs.length} board(s) ${babp.blockIDs.length} block(s)`)
        Utils.log(`\t Board ${babp.boardIDs.join(', ')}`)
        Utils.log(`\t Blocks ${babp.blockIDs.join(', ')}`)

        const body = JSON.stringify(babp)
        return fetch(this.getBaseURL() + '/api/v2/boards-and-blocks', Client4.getOptions({
            method: 'PATCH',
            headers: this.headers(),
            body,
        }))
    }

    // Sharing
    async getSharing(boardID: string): Promise<ISharing | undefined> {
        const path = `/api/v2/boards/${boardID}/sharing`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }
        return this.getJson(response, undefined)
    }

    async setSharing(boardID: string, sharing: ISharing): Promise<boolean> {
        const path = `/api/v2/boards/${boardID}/sharing`
        const body = JSON.stringify(sharing)
        const response = await fetch(
            this.getBaseURL() + path,
            Client4.getOptions({
                method: 'POST',
                headers: this.headers(),
                body,
            }),
        )
        if (response.status !== 200) {
            return false
        }

        return true
    }

    async regenerateTeamSignupToken(): Promise<void> {
        const path = this.teamPath() + '/regenerate_signup_token'
        await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
        }))
    }

    // Files

    // Returns fileId of uploaded file, or undefined on failure
    async uploadFile(rootID: string, file: File): Promise<string | undefined> {
        // IMPORTANT: We need to post the image as a form. The browser will convert this to a application/x-www-form-urlencoded POST
        const formData = new FormData()
        formData.append('file', file)

        try {
            const headers = this.headers() as Record<string, string>

            // TIPTIP: Leave out Content-Type here, it will be automatically set by the browser
            delete headers['Content-Type']

            const response = await fetch(this.getBaseURL() + this.teamPath() + '/' + rootID + '/files', Client4.getOptions({
                method: 'POST',
                headers,
                body: formData,
            }))
            if (response.status !== 200) {
                return undefined
            }

            try {
                const text = await response.text()
                Utils.log(`uploadFile response: ${text}`)
                const json = JSON.parse(text)

                return json.fileId
            } catch (e) {
                Utils.logError(`uploadFile json ERROR: ${e}`)
            }
        } catch (e) {
            Utils.logError(`uploadFile ERROR: ${e}`)
        }

        return undefined
    }

    async uploadAttachment(rootID: string, file: File): Promise<XMLHttpRequest | undefined> {
        const formData = new FormData()
        formData.append('file', file)

        const xhr = new XMLHttpRequest()

        xhr.open('POST', this.getBaseURL() + this.teamPath() + '/' + rootID + '/files', true)
        const options = Client4.getOptions({method: 'POST', headers: this.headers()})
        const headers = options.headers as Record<string, string>
        delete headers['Content-Type']

        for (const headerName in headers) {
            xhr.setRequestHeader(headerName, headers[headerName])
        }
        
        xhr.setRequestHeader('Authorization', this.token ? 'Bearer ' + this.token : '')

        if (xhr.upload) {
            xhr.upload.onprogress = () => {}
        }
        xhr.send(formData)
        return xhr
    }

    async getFileInfo(boardId: string, fileId: string): Promise<FileInfo> {
        let path = '/api/v2/files/teams/' + this.teamId + '/' + boardId + '/' + fileId + '/info'
        const readToken = Utils.getReadToken()
        if (readToken) {
            path += `?read_token=${readToken}`
        }
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        let fileInfo: FileInfo = {}

        if (response.status === 200) {
            fileInfo = this.getJson(response, {}) as FileInfo
        } else if (response.status === 400) {
            fileInfo = await this.getJson(response, {}) as FileInfo
        } else {
            Utils.logWarn(`getFileInfo failed: status=${response.status} boardId=${boardId} fileId=${fileId}`)
        }

        return fileInfo
    }

    async getFileAsDataUrl(boardId: string, fileId: string, teamId?: string): Promise<FileInfo> {
        // Use provided teamId, or fall back to teamPath logic (handles globalTeamId -> lastTeamId)
        let effectiveTeamId = teamId
        if (!effectiveTeamId) {
            effectiveTeamId = this.teamId === Constants.globalTeamId ? UserSettings.lastTeamId || this.teamId : this.teamId
        }
        let path = '/api/v2/files/teams/' + effectiveTeamId + '/' + boardId + '/' + fileId
        const readToken = Utils.getReadToken()
        if (readToken) {
            path += `?read_token=${readToken}`
        }
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        let fileInfo: FileInfo = {}

        if (response.status === 200) {
            const blob = await response.blob()
            if (!blob || blob.size === 0) {
                Utils.logWarn(`getFileAsDataUrl empty blob: boardId=${boardId} fileId=${fileId}`)
                return fileInfo
            }
            fileInfo.url = URL.createObjectURL(blob)
        } else if (response.status === 400) {
            fileInfo = await this.getJson(response, {}) as FileInfo
        } else {
            Utils.logWarn(`getFileAsDataUrl failed: status=${response.status} boardId=${boardId} fileId=${fileId}`)
        }

        return fileInfo
    }

    /**
     * 파일을 Blob으로 직접 가져오기 (BlockSuite BlobEngine용)
     */
    async getFileAsBlob(boardId: string, fileId: string): Promise<Blob | null> {
        let path = '/api/v2/files/teams/' + this.teamId + '/' + boardId + '/' + fileId
        const readToken = Utils.getReadToken()
        if (readToken) {
            path += `?read_token=${readToken}`
        }
        // Client4.getOptions()를 사용하여 credentials: 'include'가 포함되도록 함
        // 이것이 있어야 브라우저가 세션 쿠키를 보내고 Mattermost가 Mattermost-User-Id 헤더를 추가함
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))

        if (response.status === 200) {
            return response.blob()
        }
        
        Utils.logWarn(`getFileAsBlob failed: ${response.status} ${response.statusText}`)
        return null
    }

    async getTeam(): Promise<Team | null> {
        const path = this.teamPath()
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return null
        }

        return this.getJson(response, null)
    }

    async getTeams(): Promise<Team[]> {
        const path = this.teamsPath()
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }

        return this.getJson<Team[]>(response, [])
    }

    async getTeamUsers(excludeBots?: boolean): Promise<IUser[]> {
        let path = this.teamPath() + '/users'
        if (excludeBots) {
            path += '?exclude_bots=true'
        }
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        return (await this.getJson(response, [])) as IUser[]
    }

    async getTeamUsersList(userIds: string[], teamId: string): Promise<IUser[] | []> {
        const path = this.teamPath(teamId) + '/users'
        const body = JSON.stringify(userIds)
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            headers: this.headers(),
            method: 'POST',
            body,
        }))

        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as IUser[]
    }

    async searchTeamUsers(searchQuery: string, excludeBots?: boolean): Promise<IUser[]> {
        let path = this.teamPath() + `/users?search=${searchQuery}`
        if (excludeBots) {
            path += '&exclude_bots=true'
        }
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        return (await this.getJson(response, [])) as IUser[]
    }

    async getTeamTemplates(teamId?: string): Promise<Board[]> {
        const path = this.teamPath(teamId) + '/templates'
        return this.getBoardsWithPath(path)
    }

    async getBoards(): Promise<Board[]> {
        const path = this.teamPath() + '/boards'
        return this.getBoardsWithPath(path)
    }

    async getBoard(boardID: string): Promise<Board | undefined> {
        let path = `/api/v2/boards/${boardID}`
        const readToken = Utils.getReadToken()
        if (readToken) {
            path += `?read_token=${readToken}`
        }
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<Board>(response, {} as Board)
    }

    async getBoardPermissionsMe(boardID: string): Promise<BoardPermissionsResponse | undefined> {
        const path = `/api/v2/boards/${boardID}/permissions/me`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<BoardPermissionsResponse>(response, {} as BoardPermissionsResponse)
    }

    async getBoardPermissionsPreview(boardID: string, userID: string): Promise<BoardPermissionsResponse | undefined> {
        const path = `/api/v2/boards/${boardID}/permissions/preview?userID=${encodeURIComponent(userID)}`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<BoardPermissionsResponse>(response, {} as BoardPermissionsResponse)
    }

    async getBoardACL(boardID: string): Promise<BoardACLEntry[]> {
        const path = `/api/v2/boards/${boardID}/acl`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))

        if (response.status !== 200) {
            return []
        }

        return this.getJson<BoardACLEntry[]>(response, [])
    }

    async putBoardACL(boardID: string, entries: BoardACLEntry[]): Promise<BoardACLEntry[]> {
        const path = `/api/v2/boards/${boardID}/acl`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PUT',
            headers: this.headers(),
            body: JSON.stringify({entries}),
        }))

        if (response.status !== 200) {
            return []
        }

        return this.getJson<BoardACLEntry[]>(response, [])
    }

    async transferBoardOwnership(boardID: string, ownerUserId: string): Promise<boolean> {
        const path = `/api/v2/boards/${boardID}/owner`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PUT',
            headers: this.headers(),
            body: JSON.stringify({ownerUserId}),
        }))
        return response.status === 200
    }

    async getOrgUnits(teamID: string): Promise<ACLSubjectOption[]> {
        if (!teamID) {
            return []
        }
        const path = `/api/v2/org/units?teamID=${encodeURIComponent(teamID)}`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            throw new Error('failed_to_load_org_units')
        }
        const units = await this.getJson<Array<{id: string, name: string}>>(response, [])
        return units.filter((unit) => unit?.id && unit?.name)
    }

    async getPositions(teamID: string): Promise<ACLSubjectOption[]> {
        if (!teamID) {
            return []
        }
        const path = `/api/v2/org/positions?teamID=${encodeURIComponent(teamID)}`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            throw new Error('failed_to_load_positions')
        }
        const positions = await this.getJson<Array<{id: string, name: string}>>(response, [])
        return positions.filter((position) => position?.id && position?.name)
    }

    async duplicateBoard(boardID: string, asTemplate: boolean, toTeam?: string): Promise<BoardsAndBlocks | undefined> {
        let query = '?asTemplate=false'
        if (asTemplate) {
            query = '?asTemplate=true'
        }
        if (toTeam) {
            query += `&toTeam=${encodeURIComponent(toTeam)}`
        }

        const path = `/api/v2/boards/${boardID}/duplicate${query}`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
        }))

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<BoardsAndBlocks>(response, {} as BoardsAndBlocks)
    }

    async duplicateBlock(boardID: string, blockID: string, asTemplate: boolean): Promise<Block[] | undefined> {
        let query = '?asTemplate=false'
        if (asTemplate) {
            query = '?asTemplate=true'
        }
        const path = `/api/v2/boards/${boardID}/blocks/${blockID}/duplicate${query}`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
        }))

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<Block[]>(response, [] as Block[])
    }

    async getBlocksForBoard(teamId: string, boardId: string): Promise<Board[]> {
        const path = this.teamPath(teamId) + `/boards/${boardId}`
        return this.getBoardsWithPath(path)
    }

    async getBoardMembers(teamId: string, boardId: string): Promise<BoardMember[]> {
        const path = `/api/v2/boards/${boardId}/members`
        return this.getBoardMembersWithPath(path)
    }

    async createBoard(board: Board): Promise<Response> {
        Utils.log(`createBoard: ${board.title} [${board.type}]`)
        return fetch(this.getBaseURL() + this.teamPath(board.teamId) + '/boards', Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(board),
        }))
    }

    async patchBoard(boardId: string, boardPatch: BoardPatch): Promise<Response> {
        Utils.log(`patchBoard: ${boardId} board`)
        const body = JSON.stringify(boardPatch)
        const response = await fetch(`${this.getBaseURL()}/api/v2/boards/${boardId}`, Client4.getOptions({
            method: 'PATCH',
            headers: this.headers(),
            body,
        }))
        
        if (response.status !== 200) {
            const json = await this.getJson(response, {})
            Utils.logError(`patchBoard failed with status ${response.status}: ${JSON.stringify(json)}`)
            throw new Error(`patchBoard failed with status ${response.status}`)
        }
        
        return response
    }

    async deleteBoard(boardId: string): Promise<Response> {
        Utils.log(`deleteBoard: ${boardId}`)
        return fetch(`${this.getBaseURL()}/api/v2/boards/${boardId}`, Client4.getOptions({
            method: 'DELETE',
            headers: this.headers(),
        }))
    }

    async getSidebarCategories(teamID: string): Promise<CategoryBoards[]> {
        const path = `/api/v2/teams/${teamID}/categories`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as CategoryBoards[]
    }

    async createSidebarCategory(category: Category): Promise<Response> {
        const path = `/api/v2/teams/${category.teamID}/categories`
        const body = JSON.stringify(category)
        return fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
    }

    async deleteSidebarCategory(teamID: string, categoryID: string): Promise<Response> {
        const url = `/api/v2/teams/${teamID}/categories/${categoryID}`
        return fetch(this.getBaseURL() + url, Client4.getOptions({
            method: 'DELETE',
            headers: this.headers(),
        }))
    }

    async updateSidebarCategory(category: Category): Promise<Response> {
        const path = `/api/v2/teams/${category.teamID}/categories/${category.id}`
        const body = JSON.stringify(category)
        return fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PUT',
            headers: this.headers(),
            body,
        }))
    }

    async reorderSidebarCategories(teamID: string, newCategoryOrder: string[]): Promise<string[]> {
        const path = `/api/v2/teams/${teamID}/categories/reorder`
        const body = JSON.stringify(newCategoryOrder)
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PUT',
            headers: this.headers(),
            body,
        }))

        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as string[]
    }

    async reorderSidebarCategoryBoards(teamID: string, categoryID: string, newBoardsOrder: string[]): Promise<string[]> {
        const path = `/api/v2/teams/${teamID}/categories/${categoryID}/boards/reorder`
        const body = JSON.stringify(newBoardsOrder)
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PUT',
            headers: this.headers(),
            body,
        }))

        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as string[]
    }

    async moveBoardToCategory(teamID: string, boardID: string, toCategoryID: string, fromCategoryID: string): Promise<Response> {
        const url = `/api/v2/teams/${teamID}/categories/${toCategoryID || '0'}/boards/${boardID}`
        const payload = {
            fromCategoryID,
        }
        const body = JSON.stringify(payload)

        return fetch(this.getBaseURL() + url, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
    }

    async search(teamID: string, query: string): Promise<Board[]> {
        const url = `${this.teamPath(teamID)}/boards/search?q=${encodeURIComponent(query)}`
        const response = await fetch(this.getBaseURL() + url, {
            method: 'GET',
            headers: this.headers(),
        })
        this.logBoardsDebugHeaders(url, response)

        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as Board[]
    }

    async searchLinkableBoards(teamID: string, query: string): Promise<Board[]> {
        const url = `${this.teamPath(teamID)}/boards/search/linkable?q=${encodeURIComponent(query)}`
        const response = await fetch(this.getBaseURL() + url, {
            method: 'GET',
            headers: this.headers(),
        })
        this.logBoardsDebugHeaders(url, response)

        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as Board[]
    }

    async searchAll(query: string): Promise<Board[]> {
        const url = `/api/v2/boards/search?q=${encodeURIComponent(query)}`
        const response = await fetch(this.getBaseURL() + url, {
            method: 'GET',
            headers: this.headers(),
        })
        this.logBoardsDebugHeaders(url, response)

        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as Board[]
    }

    async getUserBlockSubscriptions(userId: string): Promise<Subscription[]> {
        const path = `/api/v2/subscriptions/${userId}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as Subscription[]
    }

    async searchUserChannels(teamId: string, searchQuery: string): Promise<Channel[] | undefined> {
        const path = `/api/v2/teams/${teamId}/channels?search=${searchQuery}`
        const response = await fetch(this.getBaseURL() + path, {
            headers: this.headers(),
            method: 'GET',
        })
        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, [])) as Channel[]
    }

    async getChannel(teamId: string, channelId: string): Promise<Channel | undefined> {
        const path = `/api/v2/teams/${teamId}/channels/${channelId}`
        const response = await fetch(this.getBaseURL() + path, {
            headers: this.headers(),
            method: 'GET',
        })
        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, {})) as Channel
    }

    // onboarding
    async prepareOnboarding(teamId: string): Promise<PrepareOnboardingResponse | undefined> {
        const path = `/api/v2/teams/${teamId}/onboard`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            headers: this.headers(),
            method: 'POST',
        }))
        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, {})) as PrepareOnboardingResponse
    }

    async notifyAdminUpgrade(): Promise<void> {
        const path = `${this.teamPath()}/notifyadminupgrade`
        await fetch(this.getBaseURL() + path, Client4.getOptions({
            headers: this.headers(),
            method: 'POST',
        }))
    }

    async getBoardsCloudLimits(): Promise<BoardsCloudLimits | undefined> {
        const path = '/api/v2/limits'
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }

        const limits = (await this.getJson(response, {})) as BoardsCloudLimits
        Utils.log(`Cloud limits: cards=${limits.cards}   views=${limits.views}`)
        return limits
    }

    async getSiteStatistics(): Promise<BoardSiteStatistics | undefined> {
        const path = '/api/v2/statistics'
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }

        const stats = (await this.getJson(response, {})) as BoardSiteStatistics
        Utils.log(`Site Statistics: cards=${stats.card_count}   boards=${stats.board_count}`)
        return stats
    }

    async getMigrationStatus(): Promise<BlockSuiteMigrationStatus | undefined> {
        const path = '/api/v2/statistics/migration'
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }
        return (await this.getJson(response, {})) as BlockSuiteMigrationStatus
    }

    async getUnmigratedCards(limit = 50, offset = 0): Promise<UnmigratedCardsResponse | undefined> {
        const path = `/api/v2/migration/unmigrated-cards?limit=${limit}&offset=${offset}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }
        return (await this.getJson(response, {cards: [], totalCount: 0, hasMore: false})) as UnmigratedCardsResponse
    }

    // insights
    async getMyTopBoards(timeRange: string, page: number, perPage: number, teamId: string): Promise<TopBoardResponse | undefined> {
        const path = `/api/v2/users/me/boards/insights?time_range=${timeRange}&page=${page}&per_page=${perPage}&team_id=${teamId}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, {})) as TopBoardResponse
    }

    async getTeamTopBoards(timeRange: string, page: number, perPage: number, teamId: string): Promise<TopBoardResponse | undefined> {
        const path = `/api/v2/teams/${teamId}/boards/insights?time_range=${timeRange}&page=${page}&per_page=${perPage}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, {})) as TopBoardResponse
    }

    async hideBoard(categoryID: string, boardID: string): Promise<Response> {
        const path = `${this.teamPath()}/categories/${categoryID}/boards/${boardID}/hide`
        return fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PUT',
            headers: this.headers(),
        }))
    }

    async unhideBoard(categoryID: string, boardID: string): Promise<Response> {
        const path = `${this.teamPath()}/categories/${categoryID}/boards/${boardID}/unhide`
        return fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PUT',
            headers: this.headers(),
        }))
    }

    // Auto-notify endpoint: used when card changes are submitted on close.
    async sendBoardNotification(boardID: string, cardID: string): Promise<Response> {
        const path = `/api/v2/boards/${boardID}/notify`
        const body = JSON.stringify({cardID})
        return fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
    }

    // Explicit share endpoint: used when user clicks "share to channel".
    async sendBoardShareNotification(boardID: string, cardID: string): Promise<Response> {
        const path = `/api/v2/boards/${boardID}/notify/share`
        const body = JSON.stringify({cardID})
        return fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
    }

    // BlockSuite Methods
    async getBlockSuiteInfo(cardId: string): Promise<any | null> {
        const path = `/api/v2/cards/${cardId}/blocksuite/info`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status === 404) {
            return null
        }
        if (response.status !== 200) {
            throw new Error(`getBlockSuiteInfo failed with status ${response.status}`)
        }
        return this.getJson(response, {})
    }

    async getBlockSuiteContent(cardId: string): Promise<any> {
        const path = `/api/v2/cards/${cardId}/blocksuite/content`
        console.log('[API] getBlockSuiteContent called for card:', cardId)
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        console.log('[API] Response status:', response.status)

        if (response.status !== 200) {
            throw new Error(`getBlockSuiteContent failed with status ${response.status}`)
        }

        // Content-Type 확인
        const contentType = response.headers.get('Content-Type') || ''
        console.log('[API] Content-Type:', contentType)

        // 응답 본문 크기 확인
        const contentLength = response.headers.get('Content-Length')
        console.log('[API] Content-Length:', contentLength)

        // 응답을 복제해서 여러 방식으로 읽어보기
        const clonedResponse1 = response.clone()
        const clonedResponse2 = response.clone()

        // 방법 1: JSON으로 시도
        try {
            const json = await clonedResponse1.json()
            console.log('[API] ✅ Successfully parsed as JSON:', json)
            console.log('[API] JSON keys:', Object.keys(json))
            return json
        } catch (jsonError) {
            console.log('[API] ❌ Failed to parse as JSON:', jsonError)
        }

        // 방법 2: 텍스트로 시도
        try {
            const text = await clonedResponse2.text()
            console.log('[API] Raw text:', text)
            console.log('[API] Text length:', text.length)

            // 빈 응답 체크
            if (!text || text.trim() === '' || text === '[object Object]') {
                console.log('[API] ⚠️ Response is empty or invalid, returning null')
                return null
            }

            // JSON 파싱 재시도
            try {
                const json = JSON.parse(text)
                console.log('[API] ✅ Parsed text as JSON:', json)
                return json
            } catch (e) {
                console.log('[API] Text is not valid JSON')
            }

            // 그냥 텍스트 반환
            return text
        } catch (textError) {
            console.log('[API] ❌ Failed to parse as text:', textError)
        }

        // 방법 3: ArrayBuffer로 시도 (최후의 수단)
        try {
            const buffer = await response.arrayBuffer()
            console.log('[API] ArrayBuffer size:', buffer.byteLength, 'bytes')

            if (buffer.byteLength === 0) {
                console.log('[API] ⚠️ Empty ArrayBuffer')
                return null
            }

            return buffer
        } catch (bufferError) {
            console.error('[API] ❌ Failed to parse as ArrayBuffer:', bufferError)
            return null
        }
    }

    async saveBlockSuiteContent(cardId: string, content: Uint8Array | any): Promise<void> {
        const path = `/api/v2/cards/${cardId}/blocksuite/content`
        console.log('[API] saveBlockSuiteContent called for card:', cardId)
        console.log('[API] Content type:', typeof content)
        console.log('[API] Content is Uint8Array?', content instanceof Uint8Array)

        const headers = this.headers() as Record<string, string>
        headers['Content-Type'] = 'application/octet-stream'

        // content를 Uint8Array로 변환
        let bodyData: Uint8Array
        if (content instanceof Uint8Array) {
            bodyData = content
        } else if (typeof content === 'object') {
            // JSON 객체를 Uint8Array로 변환
            const jsonStr = JSON.stringify(content)
            const encoder = new TextEncoder()
            bodyData = encoder.encode(jsonStr)
            console.log('[API] Converted JSON to Uint8Array, size:', bodyData.length, 'bytes')
        } else {
            throw new Error('Invalid content type for saveBlockSuiteContent')
        }

        console.log('[API] Sending PUT request to:', this.getBaseURL() + path)
        console.log('[API] Body size:', bodyData.length, 'bytes')

        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PUT',
            headers,
            body: bodyData,
        }))

        console.log('[API] Save response status:', response.status)

        if (response.status !== 200) {
            const errorText = await response.text()
            console.error('[API] ❌ Save failed with status:', response.status)
            console.error('[API] Error response:', errorText)
            throw new Error(`saveBlockSuiteContent failed with status ${response.status}: ${errorText}`)
        }

        console.log('[API] ✅ Save successful')
    }

    // ========================================
    // Scheduled Comments API
    // ========================================

    /**
     * Get all scheduled comments for the current user
     */
    async getMyScheduledComments(): Promise<Block[]> {
        const path = '/api/v2/me/scheduled-comments'
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            return []
        }
        return (await this.getJson(response, [])) as Block[]
    }

    /**
     * Create a scheduled comment
     */
    async createScheduledComment(
        boardId: string,
        cardId: string,
        title: string,
        scheduledAt: number,
    ): Promise<Block | undefined> {
        const path = `/api/v2/boards/${boardId}/scheduled-comments`
        const body = JSON.stringify({
            cardId,
            title,
            scheduledAt,
        })
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
        if (response.status !== 200) {
            return undefined
        }
        return (await this.getJson(response, undefined)) as Block | undefined
    }

    /**
     * Get scheduled comments for a specific card
     */
    async getScheduledCommentsForCard(boardId: string, cardId: string): Promise<Block[]> {
        const path = `/api/v2/boards/${boardId}/cards/${cardId}/scheduled-comments`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'GET',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            return []
        }
        return (await this.getJson(response, [])) as Block[]
    }

    /**
     * Update a scheduled comment
     */
    async updateScheduledComment(
        boardId: string,
        blockId: string,
        title?: string,
        scheduledAt?: number,
    ): Promise<Block | undefined> {
        const path = `/api/v2/boards/${boardId}/scheduled-comments/${blockId}`
        const body: Record<string, any> = {}
        if (title !== undefined) {
            body.title = title
        }
        if (scheduledAt !== undefined) {
            body.scheduledAt = scheduledAt
        }
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'PATCH',
            headers: this.headers(),
            body: JSON.stringify(body),
        }))
        if (response.status !== 200) {
            return undefined
        }
        return (await this.getJson(response, undefined)) as Block | undefined
    }

    /**
     * Cancel a scheduled comment
     */
    async cancelScheduledComment(boardId: string, blockId: string): Promise<Block | undefined> {
        const path = `/api/v2/boards/${boardId}/scheduled-comments/${blockId}/cancel`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            return undefined
        }
        return (await this.getJson(response, undefined)) as Block | undefined
    }

    /**
     * Immediately send a scheduled comment
     */
    async sendScheduledCommentNow(boardId: string, blockId: string): Promise<Block | undefined> {
        const path = `/api/v2/boards/${boardId}/scheduled-comments/${blockId}/send-now`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            return undefined
        }
        return (await this.getJson(response, undefined)) as Block | undefined
    }

    // ========================================
    // Sub-Cards API
    // ========================================

    async createSubCard(boardId: string, parentCardId: string, card: Partial<Block>, disableNotify = false): Promise<Block | undefined> {
        const path = `/api/v2/boards/${boardId}/cards/${parentCardId}/subcards${disableNotify ? '?disable_notify=true' : ''}`
        const body = JSON.stringify(card)
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
        if (response.status !== 200) {
            return undefined
        }
        return (await this.getJson(response, undefined)) as Block | undefined
    }

    async getSubCards(parentCardId: string, page = 0, perPage = 100): Promise<Block[]> {
        const path = `/api/v2/cards/${parentCardId}/subcards?page=${page}&per_page=${perPage}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        return (await this.getJson(response, [])) as Block[]
    }

    async getSubCardCount(parentCardId: string): Promise<number> {
        const path = `/api/v2/cards/${parentCardId}/subcards/count`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return 0
        }
        const result = (await this.getJson(response, {count: 0})) as {count: number}
        return result.count
    }

    async linkCardAsSubCard(cardId: string, parentCardId: string): Promise<Block | undefined> {
        const path = `/api/v2/cards/${cardId}/link`
        const body = JSON.stringify({parentCardId})
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'POST',
            headers: this.headers(),
            body,
        }))
        if (response.status !== 200) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `Failed to link card (status: ${response.status})`)
        }
        return (await this.getJson(response, undefined)) as Block | undefined
    }

    async unlinkSubCard(cardId: string): Promise<Block | undefined> {
        const path = `/api/v2/cards/${cardId}/link`
        const response = await fetch(this.getBaseURL() + path, Client4.getOptions({
            method: 'DELETE',
            headers: this.headers(),
        }))
        if (response.status !== 200) {
            return undefined
        }
        return (await this.getJson(response, undefined)) as Block | undefined
    }
}

const octoClient = new OctoClient()

export {OctoClient}
export default octoClient
