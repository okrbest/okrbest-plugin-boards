// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import {IntlShape} from 'react-intl'
import {batch} from 'react-redux'
import cloneDeep from 'lodash/cloneDeep'

import {BlockIcons} from './blockIcons'
import {Block, BlockPatch, createPatchesFromBlocks} from './blocks/block'
import {Board, BoardMember, BoardsAndBlocks, IPropertyOption, IPropertyTemplate, PropertyTypeEnum, createBoard, createPatchesFromBoards, createPatchesFromBoardsAndBlocks, createCardPropertiesPatches} from './blocks/board'
import {BoardView, ISortOption, createBoardView, KanbanCalculationFields} from './blocks/boardView'
import {Card, createCard} from './blocks/card'
import {CommentBlock} from './blocks/commentBlock'
import {AttachmentBlock} from './blocks/attachmentBlock'
import {FilterGroup} from './blocks/filterGroup'
import octoClient from './octoClient'
import {ORG_COLORS_KEY, pickedOrgColors} from './properties/orgLabels'
import {OKR_BOARD_KEY, OKR_LEVEL_NAMES, OKR_TYPE_PROPERTY_NAME} from './okrBoard'
import {ADMIN_ONLY_CARD_PROPERTIES_KEY} from './cardPropertyLock'
import {sendFlashMessage} from './components/flashMessages'
import undoManager from './undomanager'
import {Utils, IDType} from './utils'
import {UserSettings} from './userSettings'
import TelemetryClient, {TelemetryCategory, TelemetryActions} from './telemetry/telemetryClient'
import {Category} from './store/sidebar'

/* eslint-disable max-lines */
import {IUser, UserConfigPatch, UserPreference} from './user'
import store from './store'
import {updateBoards, updateMembers} from './store/boards'
import {updateView, updateViews} from './store/views'
import {updateCards, markCardModified} from './store/cards'
import {updateAttachments} from './store/attachments'
import {updateComments} from './store/comments'
import {addBoardUsers, removeBoardUsersById} from './store/users'
import {getOrgUnits} from './store/orgMaster'
import {selectedUnitIds, allowedDepartments} from './store/orgScope'

// A member with every scheme flag cleared is treated as a removal by the
// board members reducer.
function removedMember(member: BoardMember): BoardMember {
    return {
        ...member,
        schemeAdmin: false,
        schemeEditor: false,
        schemeCommenter: false,
        schemeViewer: false,
    }
}

function updateAllBoardsAndBlocks(boards: Board[], blocks: Block[]) {
    return batch(() => {
        store.dispatch(updateBoards(boards.filter((b: Board) => b.deleteAt !== 0) as Board[]))
        store.dispatch(updateViews(blocks.filter((b: Block) => b.type === 'view' || b.deleteAt !== 0) as BoardView[]))
        store.dispatch(updateCards(blocks.filter((b: Block) => b.type === 'card' || b.deleteAt !== 0) as Card[]))
        store.dispatch(updateAttachments(blocks.filter((b: Block) => b.type === 'attachment' || b.deleteAt !== 0) as AttachmentBlock[]))
        store.dispatch(updateComments(blocks.filter((b: Block) => b.type === 'comment' || b.deleteAt !== 0) as CommentBlock[]))
    })
}

//
// The Mutator is used to make all changes to server state
// It also ensures that the Undo-manager is called for each action
//
// The server has the final say on card level access, and it used to say no in
// silence: the field snapped back to its old value with nothing to explain why.
//
// This is the net under the screens, not the first line of defence — the edit
// affordances are gated per card so a refused write should be rare. It catches
// the paths that are hard to gate, such as the card body editor and drag
// reordering, and any that get added later.
async function warnIfRefused(response: Response): Promise<Response> {
    // Guarded rather than assumed: several callers hand back whatever the
    // transport gave them, and a missing response must not turn a save into a
    // crash on the way to reporting it.
    if (response?.status === 403) {
        sendFlashMessage({
            content: '이 카드를 편집할 권한이 없습니다.',
            severity: 'high',
        })
    }
    return response
}

class Mutator {
    private undoGroupId?: string
    private undoDisplayId?: string

    private beginUndoGroup(): string | undefined {
        if (this.undoGroupId) {
            Utils.assertFailure('UndoManager does not support nested groups')
            return undefined
        }
        this.undoGroupId = Utils.createGuid(IDType.None)
        return this.undoGroupId
    }

    private endUndoGroup(groupId: string) {
        if (this.undoGroupId !== groupId) {
            Utils.assertFailure('Mismatched groupId. UndoManager does not support nested groups')
            return
        }
        this.undoGroupId = undefined
    }

    async performAsUndoGroup(actions: () => Promise<void>): Promise<void> {
        const groupId = this.beginUndoGroup()
        try {
            await actions()
        } catch (err) {
            Utils.assertFailure(`ERROR: ${err}`)
        }
        if (groupId) {
            this.endUndoGroup(groupId)
        }
    }

    async updateBlock(boardId: string, newBlock: Block, oldBlock: Block, description: string): Promise<void> {
        const [updatePatch, undoPatch] = createPatchesFromBlocks(newBlock, oldBlock)
        await undoManager.perform(
            async () => {
                await warnIfRefused(await octoClient.patchBlock(boardId, newBlock.id, updatePatch))
            },
            async () => {
                await octoClient.patchBlock(boardId, oldBlock.id, undoPatch)
            },
            description,
            this.undoGroupId,
        )
    }

    private async updateBlocks(boardId: string, newBlocks: Block[], oldBlocks: Block[], description: string): Promise<void> {
        if (newBlocks.length !== oldBlocks.length) {
            throw new Error('new and old blocks must have the same length when updating blocks')
        }

        const updatePatches = [] as BlockPatch[]
        const undoPatches = [] as BlockPatch[]

        newBlocks.forEach((newBlock, i) => {
            const [updatePatch, undoPatch] = createPatchesFromBlocks(newBlock, oldBlocks[i])
            updatePatches.push(updatePatch)
            undoPatches.push(undoPatch)
        })

        return undoManager.perform(
            async () => {
                await Promise.all(
                    updatePatches.map((patch, i) => octoClient.patchBlock(boardId, newBlocks[i].id, patch).then(warnIfRefused)),
                )
            },
            async () => {
                await Promise.all(
                    undoPatches.map((patch, i) => octoClient.patchBlock(boardId, newBlocks[i].id, patch)),
                )
            },
            description,
            this.undoGroupId,
        )
    }

    //eslint-disable-next-line no-shadow
    async insertBlock(boardId: string, block: Block, description = 'add', afterRedo?: (block: Block) => Promise<void>, beforeUndo?: (block: Block) => Promise<void>): Promise<Block> {
        return undoManager.perform(
            async () => {
                const res = await warnIfRefused(await octoClient.insertBlock(boardId, block))
                const jsonres = await res.json()
                const newBlock = jsonres[0] as Block
                if (newBlock.type === 'comment') {
                    store.dispatch(updateComments([newBlock as CommentBlock]))
                }
                await afterRedo?.(newBlock)
                if (newBlock.parentId) {
                    store.dispatch(markCardModified(newBlock.parentId))
                }
                return newBlock
            },
            async (newBlock: Block) => {
                await beforeUndo?.(newBlock)
                await octoClient.deleteBlock(boardId, newBlock.id)
            },
            description,
            this.undoGroupId,
        )
    }

    //eslint-disable-next-line no-shadow
    async insertBlocks(boardId: string, blocks: Block[], description = 'add', afterRedo?: (blocks: Block[]) => Promise<void>, beforeUndo?: () => Promise<void>, sourceBoardID?: string) {
        return undoManager.perform(
            async () => {
                const res = await warnIfRefused(await octoClient.insertBlocks(boardId, blocks, sourceBoardID))
                const newBlocks = (await res.json()) as Block[]
                updateAllBoardsAndBlocks([], newBlocks)
                await afterRedo?.(newBlocks)
                return newBlocks
            },
            async (newBlocks: Block[]) => {
                await beforeUndo?.()
                const awaits = []
                for (const block of newBlocks) {
                    awaits.push(octoClient.deleteBlock(boardId, block.id))
                }
                await Promise.all(awaits)
            },
            description,
            this.undoGroupId,
        )
    }

    async deleteBlock(block: Block, description?: string, beforeRedo?: () => Promise<void>, afterUndo?: () => Promise<void>) {
        const actualDescription = description || `delete ${block.type}`

        await undoManager.perform(
            async () => {
                await beforeRedo?.()
                await warnIfRefused(await octoClient.deleteBlock(block.boardId, block.id))
                if (block.parentId) {
                    store.dispatch(markCardModified(block.parentId))
                }
            },
            async () => {
                await octoClient.undeleteBlock(block.boardId, block.id)
                await afterUndo?.()
            },
            actualDescription,
            this.undoGroupId,
        )
    }

    async createBoardsAndBlocks(bab: BoardsAndBlocks, description = 'add', afterRedo?: (b: BoardsAndBlocks) => Promise<void>, beforeUndo?: (b: BoardsAndBlocks) => Promise<void>): Promise<BoardsAndBlocks> {
        return undoManager.perform(
            async () => {
                const res = await octoClient.createBoardsAndBlocks(bab)
                const newBab = (await res.json()) as BoardsAndBlocks
                await afterRedo?.(newBab)
                return newBab
            },
            async (newBab: BoardsAndBlocks) => {
                await beforeUndo?.(newBab)

                const boardIds = newBab.boards.map((b) => b.id)
                const blockIds = newBab.blocks.map((b) => b.id)
                await octoClient.deleteBoardsAndBlocks(boardIds, blockIds)
            },
            description,
            this.undoGroupId,
        )
    }

    async updateBoard(newBoard: Board, oldBoard: Board, description: string): Promise<void> {
        const [updatePatch, undoPatch] = createPatchesFromBoards(newBoard, oldBoard)
        await undoManager.perform(
            async () => {
                await octoClient.patchBoard(newBoard.id, updatePatch)
                store.dispatch(updateBoards([newBoard]))
            },
            async () => {
                await octoClient.patchBoard(oldBoard.id, undoPatch)
                store.dispatch(updateBoards([oldBoard]))
            },
            description,
            this.undoGroupId,
        )
    }

    async deleteBoard(board: Board, description?: string, afterRedo?: (b: Board) => Promise<void>, beforeUndo?: (b: Board) => Promise<void>) {
        await undoManager.perform(
            async () => {
                await octoClient.deleteBoard(board.id)
                await afterRedo?.(board)
            },
            async () => {
                await beforeUndo?.(board)
                await octoClient.undeleteBoard(board.id)
            },
            description,
            this.undoGroupId,
        )
    }

    async changeBlockTitle(boardId: string, blockId: string, oldTitle: string, newTitle: string, description = 'change block title') {
        if (oldTitle === newTitle) {
            return
        }
        await undoManager.perform(
            async () => {
                await warnIfRefused(await octoClient.patchBlock(boardId, blockId, {title: newTitle}))
                store.dispatch(markCardModified(blockId))
            },
            async () => {
                await octoClient.patchBlock(boardId, blockId, {title: oldTitle})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeBoardTitle(boardId: string, oldTitle: string, newTitle: string, description = 'change board title') {
        await undoManager.perform(
            async () => {
                await octoClient.patchBoard(boardId, {title: newTitle})
            },
            async () => {
                await octoClient.patchBoard(boardId, {title: oldTitle})
            },
            description,
            this.undoGroupId,
        )
    }

    async setDefaultTemplate(boardId: string, blockId: string, oldTemplateId: string, templateId: string, description = 'set default template') {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, blockId, {updatedFields: {defaultTemplateId: templateId}})
            },
            async () => {
                await octoClient.patchBlock(boardId, blockId, {updatedFields: {defaultTemplateId: oldTemplateId}})
            },
            description,
            this.undoGroupId,
        )
    }

    async clearDefaultTemplate(boardId: string, blockId: string, oldTemplateId: string, description = 'set default template') {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, blockId, {updatedFields: {defaultTemplateId: ''}})
            },
            async () => {
                await octoClient.patchBlock(boardId, blockId, {updatedFields: {defaultTemplateId: oldTemplateId}})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeBoardIcon(boardId: string, oldIcon: string|undefined, icon: string, description = 'change board icon') {
        await undoManager.perform(
            async () => {
                await octoClient.patchBoard(boardId, {icon})
            },
            async () => {
                await octoClient.patchBoard(boardId, {icon: oldIcon})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeBlockIcon(boardId: string, blockId: string, oldIcon: string|undefined, icon: string, description = 'change block icon') {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, blockId, {updatedFields: {icon}})
                store.dispatch(markCardModified(blockId))
            },
            async () => {
                await octoClient.patchBlock(boardId, blockId, {updatedFields: {icon: oldIcon}})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeBoardDescription(boardId: string, blockId: string, oldBlockDescription: string|undefined, blockDescription: string, description = 'change description') {
        await undoManager.perform(
            async () => {
                await octoClient.patchBoard(boardId, {description: blockDescription})
            },
            async () => {
                await octoClient.patchBoard(boardId, {description: oldBlockDescription})
            },
            description,
            this.undoGroupId,
        )
    }

    async showBoardDescription(boardId: string, oldShowDescription: boolean, showDescription = true, description?: string) {
        let actionDescription = description
        if (!actionDescription) {
            actionDescription = showDescription ? 'show description' : 'hide description'
        }

        await undoManager.perform(
            async () => {
                await octoClient.patchBoard(boardId, {showDescription})
            },
            async () => {
                await octoClient.patchBoard(boardId, {showDescription: oldShowDescription})
            },
            actionDescription,
            this.undoGroupId,
        )
    }

    async changeCardContentOrder(boardId: string, cardId: string, oldContentOrder: Array<string | string[]>, contentOrder: Array<string | string[]>, description = 'reorder'): Promise<void> {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, cardId, {updatedFields: {contentOrder}})
                store.dispatch(markCardModified(cardId))
            },
            async () => {
                await octoClient.patchBlock(boardId, cardId, {updatedFields: {contentOrder: oldContentOrder}})
            },
            description,
            this.undoGroupId,
        )
    }

    // Board Members

    // The list of board members is only refreshed by a websocket broadcast, and
    // that broadcast is skipped whenever the server no longer has this client
    // registered as a listener. Applying the server response to the store keeps
    // the dialog correct even when the broadcast never arrives.
    async createBoardMember(member: BoardMember, user?: IUser, description = 'create board member'): Promise<BoardMember|undefined> {
        let createdMember: BoardMember|undefined

        await undoManager.perform(
            async () => {
                createdMember = await octoClient.createBoardMember(member)
                if (!createdMember) {
                    return
                }
                store.dispatch(updateMembers([createdMember]))
                if (user) {
                    store.dispatch(addBoardUsers([user]))
                }
            },
            async () => {
                await octoClient.deleteBoardMember(member)
                store.dispatch(updateMembers([removedMember(member)]))
                store.dispatch(removeBoardUsersById([member.userId]))
            },
            description,
            this.undoGroupId,
        )

        return createdMember
    }

    async updateBoardMember(newMember: BoardMember, oldMember: BoardMember, description = 'update board member'): Promise<void> {
        await undoManager.perform(
            async () => {
                const response = await octoClient.updateBoardMember(newMember)
                if (response.status === 200) {
                    store.dispatch(updateMembers([newMember]))
                }
            },
            async () => {
                const response = await octoClient.updateBoardMember(oldMember)
                if (response.status === 200) {
                    store.dispatch(updateMembers([oldMember]))
                }
            },
            description,
            this.undoGroupId,
        )
    }

    async deleteBoardMember(member: BoardMember, description = 'delete board member'): Promise<void> {
        await undoManager.perform(
            async () => {
                await octoClient.deleteBoardMember(member)
                store.dispatch(updateMembers([removedMember(member)]))
                store.dispatch(removeBoardUsersById([member.userId]))
            },
            async () => {
                const restored = await octoClient.createBoardMember(member)
                if (restored) {
                    store.dispatch(updateMembers([restored]))
                }
                const user = await octoClient.getUser(member.userId)
                if (user) {
                    store.dispatch(addBoardUsers([user]))
                }
            },
            description,
            this.undoGroupId,
        )
    }

    // Property Templates

    async insertPropertyTemplate(board: Board, activeView: BoardView, index = -1, template?: IPropertyTemplate): Promise<string> {
        if (!activeView) {
            Utils.assertFailure('insertPropertyTemplate: no activeView')
            return ''
        }

        const newTemplate = template || {
            id: Utils.createGuid(IDType.BlockID),
            name: 'New Property',
            type: 'text',
            options: [],
        }

        const oldBlocks: Block[] = []
        const oldBoard: Board = board
        const newBoard = createBoard(board)

        const startIndex = (index >= 0) ? index : board.cardProperties.length
        if (index >= 0) {
            newBoard.cardProperties.splice(startIndex, 0, newTemplate)
        } else {
            newBoard.cardProperties.push(newTemplate)
        }

        if (activeView.fields.viewType === 'table') {
            const changedBlocks: Block[] = []
            const changedBlockIDs: string[] = []

            oldBlocks.push(activeView)

            const newActiveView = createBoardView(activeView)

            // insert in proper location in activeview.fields.visiblePropetyIds
            const viewIndex = index > 0 ? index : activeView.fields.visiblePropertyIds.length
            newActiveView.fields.visiblePropertyIds.splice(viewIndex, 0, newTemplate.id)
            changedBlocks.push(newActiveView)
            changedBlockIDs.push(activeView.id)

            const [updatePatch, undoPatch] = createPatchesFromBoardsAndBlocks(newBoard, oldBoard, changedBlockIDs, changedBlocks, oldBlocks)
            await undoManager.perform(
                async () => {
                    await octoClient.patchBoardsAndBlocks(updatePatch)
                },
                async () => {
                    await octoClient.patchBoardsAndBlocks(undoPatch)
                },
                'add column',
                this.undoGroupId,
            )
        } else {
            this.updateBoard(newBoard, oldBoard, 'add property')
        }

        return newTemplate.id
    }

    async duplicatePropertyTemplate(board: Board, activeView: BoardView, propertyId: string) {
        if (!activeView) {
            Utils.assertFailure('duplicatePropertyTemplate: no activeView')
        }

        const oldBlocks: Block[] = []
        const oldBoard: Board = board

        const newBoard = createBoard(board)
        const changedBlocks: Block[] = []
        const changedBlockIDs: string[] = []
        const index = newBoard.cardProperties.findIndex((o: IPropertyTemplate) => o.id === propertyId)
        if (index === -1) {
            Utils.assertFailure(`Cannot find template with id: ${propertyId}`)
            return
        }
        const srcTemplate = newBoard.cardProperties[index]
        const newTemplate: IPropertyTemplate = {
            id: Utils.createGuid(IDType.BlockID),
            name: `${srcTemplate.name} copy`,
            type: srcTemplate.type,
            options: srcTemplate.options.slice(),
            required: srcTemplate.required,
        }
        newBoard.cardProperties.splice(index + 1, 0, newTemplate)

        let description = 'duplicate property'
        if (activeView.fields.viewType === 'table') {
            oldBlocks.push(activeView)

            const newActiveView = createBoardView(activeView)
            newActiveView.fields.visiblePropertyIds.push(newTemplate.id)
            changedBlocks.push(newActiveView)
            changedBlockIDs.push(newActiveView.id)

            description = 'duplicate column'
            const [updatePatch, undoPatch] = createPatchesFromBoardsAndBlocks(newBoard, oldBoard, changedBlockIDs, changedBlocks, oldBlocks)
            await undoManager.perform(
                async () => {
                    await octoClient.patchBoardsAndBlocks(updatePatch)
                },
                async () => {
                    await octoClient.patchBoardsAndBlocks(undoPatch)
                },
                description,
                this.undoGroupId,
            )
        } else {
            this.updateBoard(newBoard, oldBoard, description)
        }
    }

    async changePropertyTemplateOrder(board: Board, template: IPropertyTemplate, destIndex: number) {
        const templates = board.cardProperties
        const newValue = templates.slice()

        const srcIndex = templates.indexOf(template)
        Utils.log(`srcIndex: ${srcIndex}, destIndex: ${destIndex}`)
        newValue.splice(destIndex, 0, newValue.splice(srcIndex, 1)[0])

        const newBoard = createBoard(board)
        newBoard.cardProperties = newValue

        await this.updateBoard(newBoard, board, 'reorder properties')
    }

    async updatePropertyTemplateDefaultBoardId(board: Board, propertyTemplateId: string, defaultBoardId: string): Promise<Board> {
        const oldBoard: Board = board
        const newBoard = createBoard(board)
        const template = newBoard.cardProperties.find((o: IPropertyTemplate) => o.id === propertyTemplateId)
        if (!template || template.type !== 'card') {
            return board
        }
        // card 타입 속성의 경우 options[0]에 보드 ID 저장
        if (!template.options || template.options.length === 0) {
            template.options = [{id: defaultBoardId, value: defaultBoardId, color: ''}]
        } else {
            template.options[0] = {id: defaultBoardId, value: defaultBoardId, color: ''}
        }
        await this.updateBoard(newBoard, oldBoard, 'update property template default board id')
        return newBoard
    }

    async deleteProperty(board: Board, views: BoardView[], cards: Card[], propertyId: string) {
        const newBoard = createBoard(board)
        newBoard.cardProperties = board.cardProperties.filter((o: IPropertyTemplate) => o.id !== propertyId)

        const oldBlocks: Block[] = []
        const changedBlocks: Block[] = []
        const changedBlockIDs: string[] = []

        views.forEach((view) => {
            const hasVisibleProperty = view.fields.visiblePropertyIds.includes(propertyId)
            const hasSortOption = view.fields.sortOptions?.some((o) => o.propertyId === propertyId)
            const hasFilter = view.fields.filter?.filters?.some((f) => f.propertyId === propertyId)
            const hasGroupBy = view.fields.groupById === propertyId

            if (hasVisibleProperty || hasSortOption || hasFilter || hasGroupBy) {
                oldBlocks.push(view)

                const newView = createBoardView(view)
                if (hasVisibleProperty) {
                    newView.fields.visiblePropertyIds = view.fields.visiblePropertyIds.filter((o: string) => o !== propertyId)
                }
                if (hasSortOption) {
                    newView.fields.sortOptions = view.fields.sortOptions.filter((o) => o.propertyId !== propertyId)
                }
                if (hasFilter) {
                    newView.fields.filter = {
                        ...view.fields.filter,
                        filters: view.fields.filter.filters.filter((f) => f.propertyId !== propertyId),
                    }
                }
                if (hasGroupBy) {
                    newView.fields.groupById = ''
                }
                changedBlocks.push(newView)
                changedBlockIDs.push(newView.id)
            }
        })
        cards.forEach((card) => {
            if (card.fields.properties[propertyId]) {
                oldBlocks.push(card)

                const newCard = createCard(card)
                delete newCard.fields.properties[propertyId]
                changedBlocks.push(newCard)
                changedBlockIDs.push(newCard.id)
            }
        })

        const [updatePatch, undoPatch] = createPatchesFromBoardsAndBlocks(newBoard, board, changedBlockIDs, changedBlocks, oldBlocks)
        await undoManager.perform(
            async () => {
                await octoClient.patchBoardsAndBlocks(updatePatch)
            },
            async () => {
                await octoClient.patchBoardsAndBlocks(undoPatch)
            },
            'delete property',
            this.undoGroupId,
        )
    }

    async changePropertyRequired(board: Board, template: IPropertyTemplate, required: boolean) {
        const newBoard = createBoard(board)
        const newTemplate = newBoard.cardProperties.find((o: IPropertyTemplate) => o.id === template.id)
        if (!newTemplate) {
            Utils.assertFailure(`changePropertyRequired: template not found: ${template.id}`)
            return
        }
        newTemplate.required = required

        await this.updateBoard(newBoard, board, required ? 'set property required' : 'set property optional')
    }

    // Properties

    async updateBoardCardProperties(boardId: string, oldProperties: IPropertyTemplate[], newProperties: IPropertyTemplate[], description = 'update card properties') {
        const [updatePatch, undoPatch] = createCardPropertiesPatches(newProperties, oldProperties)
        await undoManager.perform(
            async () => {
                await octoClient.patchBoard(boardId, updatePatch)
            },
            async () => {
                await octoClient.patchBoard(boardId, undoPatch)
            },
            description,
            this.undoGroupId,
        )
    }

    async insertPropertyOption(boardId: string, oldCardProperties: IPropertyTemplate[], template: IPropertyTemplate, option: IPropertyOption, description = 'add option') {
        Utils.assert(oldCardProperties.includes(template))

        const newCardProperties: IPropertyTemplate[] = cloneDeep(oldCardProperties)
        const newTemplate = newCardProperties.find((o: IPropertyTemplate) => o.id === template.id)!
        newTemplate.options.push(option)

        await this.updateBoardCardProperties(boardId, oldCardProperties, newCardProperties, description)
    }

    async deletePropertyOption(boardId: string, oldCardProperties: IPropertyTemplate[], template: IPropertyTemplate, option: IPropertyOption) {
        const newCardProperties: IPropertyTemplate[] = cloneDeep(oldCardProperties)
        const newTemplate = newCardProperties.find((o: IPropertyTemplate) => o.id === template.id)!
        newTemplate.options = newTemplate.options.filter((o) => o.id !== option.id)

        await this.updateBoardCardProperties(boardId, oldCardProperties, newCardProperties, 'delete option')
    }

    async changePropertyOptionOrder(boardId: string, oldCardProperties: IPropertyTemplate[], template: IPropertyTemplate, option: IPropertyOption, destIndex: number) {
        const srcIndex = template.options.findIndex((o) => o.id === option.id)
        Utils.log(`srcIndex: ${srcIndex}, destIndex: ${destIndex}`)
        if (srcIndex === -1) {
            Utils.log('Option not found in template.options')
            return
        }

        const newCardProperties: IPropertyTemplate[] = cloneDeep(oldCardProperties)
        const newTemplate = newCardProperties.find((o: IPropertyTemplate) => o.id === template.id)!
        newTemplate.options.splice(destIndex, 0, newTemplate.options.splice(srcIndex, 1)[0])

        // Optimistic update: immediately update Redux store for instant UI feedback
        const currentBoard = store.getState().boards.boards[boardId]
        if (currentBoard) {
            const updatedBoard = {...currentBoard, cardProperties: newCardProperties}
            store.dispatch(updateBoards([updatedBoard as Board]))
        }

        await this.updateBoardCardProperties(boardId, oldCardProperties, newCardProperties, 'reorder option')
    }

    async changePropertyOptionValue(boardId: string, oldCardProperties: IPropertyTemplate[], propertyTemplate: IPropertyTemplate, option: IPropertyOption, value: string) {
        const newCardProperties: IPropertyTemplate[] = cloneDeep(oldCardProperties)
        const newTemplate = newCardProperties.find((o: IPropertyTemplate) => o.id === propertyTemplate.id)!
        const newOption = newTemplate.options.find((o) => o.id === option.id)!
        newOption.value = value

        await this.updateBoardCardProperties(boardId, oldCardProperties, newCardProperties, 'rename option')

        return newCardProperties
    }

    async changePropertyOptionColor(boardId: string, oldCardProperties: IPropertyTemplate[], template: IPropertyTemplate, option: IPropertyOption, color: string) {
        const newCardProperties: IPropertyTemplate[] = cloneDeep(oldCardProperties)
        const newTemplate = newCardProperties.find((o: IPropertyTemplate) => o.id === template.id)!
        const newOption = newTemplate.options.find((o) => o.id === option.id)!
        newOption.color = color
        await this.updateBoardCardProperties(boardId, oldCardProperties, newCardProperties, 'rename option')
    }

    // Turning a board into an OKR board.
    //
    // One write, not five. The property, its values and the settings all go in a
    // single board update so undo is one step and no intermediate state — a
    // board carrying the property but no settings — is ever stored (008 R2).
    //
    // A 유형 select the board already has is reused rather than duplicated, and a
    // value whose name differs is renamed in place: cards store the option ID, so
    // replacing the option would empty every card that used it (FR-004).
    async enableOkrBoard(board: Board) {
        const newBoard = createBoard(board)

        let template = newBoard.cardProperties.find((property) => property.name === OKR_TYPE_PROPERTY_NAME && property.type === 'select')
        if (!template) {
            template = {
                id: Utils.createGuid(IDType.BlockID),
                name: OKR_TYPE_PROPERTY_NAME,
                type: 'select',
                options: [],
            }
            newBoard.cardProperties.push(template)
        }

        const levels = OKR_LEVEL_NAMES.map((name, index) => {
            const existing = template!.options[index]
            if (existing) {
                // Renamed in place. The ID is what cards hold.
                existing.value = name
                return existing.id
            }

            const option: IPropertyOption = {
                id: Utils.createGuid(IDType.BlockID),
                value: name,
                color: 'propColorDefault',
            }
            template!.options.push(option)
            return option.id
        })

        newBoard.properties = {
            ...board.properties,
            [OKR_BOARD_KEY]: {propertyId: template.id, levels},
        }

        await this.updateBoard(newBoard, board, 'use as OKR board')
    }

    // Turning it off stops the filling and nothing else. The property and every
    // value a card carries stay exactly where they are (FR-011).
    async disableOkrBoard(board: Board) {
        const newBoard = createBoard(board)
        const properties = {...board.properties}
        delete properties[OKR_BOARD_KEY]
        newBoard.properties = properties

        await this.updateBoard(newBoard, board, 'stop using as OKR board')
    }

    // Whether this board keeps its property editor to board admins.
    //
    // The same board update path the OKR switch and the access rules take — undo
    // and the websocket update come from there. Turning it off writes false
    // rather than dropping the key, so the audit trail keeps the decision.
    async setCardPropertiesAdminOnly(board: Board, adminOnly: boolean) {
        const newBoard = createBoard(board)
        newBoard.properties = {
            ...board.properties,
            [ADMIN_ONLY_CARD_PROPERTIES_KEY]: adminOnly,
        }

        await this.updateBoard(newBoard, board, adminOnly ? 'lock card properties' : 'unlock card properties')
    }

    // Colour for one organisation value, remembered by this board.
    //
    // It goes next to the access rules under board.properties rather than into
    // the property's options array. An organisation property's options being
    // empty is what keeps it out of the card access rules, so filling them with
    // colours would put 본부, 부서 and 직책 into the rule editor (007 research R1).
    //
    // updateBoard is the same path the access rules take, which is where undo
    // and the websocket update come from.
    async changeOrgUnitColor(board: Board, orgUnitId: string, color: string) {
        const newBoard = createBoard(board)
        newBoard.properties = {
            ...board.properties,
            [ORG_COLORS_KEY]: {...pickedOrgColors(board.properties), [orgUnitId]: color},
        }
        await this.updateBoard(newBoard, board, 'change organisation colour')
    }

    // Drops the pick so the value goes back to the colour derived from its ID.
    // The key is removed rather than set to a neutral colour — an absent pick is
    // what "automatic" means (007 data-model 2절).
    async clearOrgUnitColor(board: Board, orgUnitId: string) {
        const picks = pickedOrgColors(board.properties)
        delete picks[orgUnitId]

        const newBoard = createBoard(board)
        newBoard.properties = {...board.properties, [ORG_COLORS_KEY]: picks}
        await this.updateBoard(newBoard, board, 'clear organisation colour')
    }

    // When 본부 changes, the 부서 values it no longer contains stop making sense.
    //
    // Done on the card being written rather than as a follow-up write, so the
    // whole move is one patch: two writes would briefly persist a card naming a
    // 부서 outside its 본부, and would make undo a two step affair (FR-017).
    //
    // Only 부서 is touched. The assignee is a separate decision and a
    // reorganisation does not mean someone stopped doing the work (FR-018).
    private dropOutOfRangeDepartments(boardId: string, newCard: Card, changedPropertyId: string) {
        const board = store.getState().boards.boards[boardId]
        if (!board) {
            return
        }

        const changed = board.cardProperties?.find((template) => template.id === changedPropertyId)
        if (changed?.type !== 'orgDivision') {
            return
        }

        const divisionIds = selectedUnitIds(newCard, board, 'orgDivision')

        // No 본부 at all means "not narrowed", so nothing is out of range.
        if (divisionIds.size === 0) {
            return
        }

        const units = getOrgUnits(board.teamId)(store.getState())

        // Without the master this cannot tell an out of range value from one it
        // simply cannot see, and guessing would delete the user's data. Leaving
        // the values alone is the recoverable choice.
        if (units.length === 0) {
            return
        }

        const allowed = new Set(allowedDepartments(divisionIds, units).map((unit) => unit.id))

        board.cardProperties.forEach((template) => {
            if (template.type !== 'orgDepartment') {
                return
            }
            const current = newCard.fields.properties[template.id]
            if (!Array.isArray(current)) {
                return
            }
            const kept = current.filter((id) => allowed.has(id))
            if (kept.length !== current.length) {
                newCard.fields.properties[template.id] = kept
            }
        })
    }

    async changePropertyValue(boardId: string, card: Card, propertyId: string, value?: string | string[], description = 'change property') {
        const oldValue = card.fields.properties[propertyId]

        // dont save anything if property value was not changed.
        if (oldValue === value) {
            return
        }

        const newCard = createCard(card)
        if (value) {
            newCard.fields.properties[propertyId] = value
        } else {
            delete newCard.fields.properties[propertyId]
        }

        this.dropOutOfRangeDepartments(boardId, newCard, propertyId)

        await this.updateBlock(boardId, newCard, card, description)

        // Redux store 즉시 업데이트 (UI 반영을 위해)
        store.dispatch(updateCards([newCard]))

        store.dispatch(markCardModified(card.id))
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.EditCardProperty, {board: card.boardId, card: card.id})
    }

    async changePropertyTypeAndName(board: Board, cards: Card[], propertyTemplate: IPropertyTemplate, newType: PropertyTypeEnum, newName: string) {
        if (propertyTemplate.type === newType && propertyTemplate.name === newName) {
            return
        }

        const oldBoard: Board = board
        const newBoard = createBoard(board)
        const newTemplate = newBoard.cardProperties.find((o: IPropertyTemplate) => o.id === propertyTemplate.id)!

        if (propertyTemplate.type !== newType) {
            newTemplate.options = []
        } else if (propertyTemplate.type === 'card' && propertyTemplate.options && propertyTemplate.options.length > 0) {
            // card 타입이고 타입이 변경되지 않으면 options 보존 (보드 ID 저장용)
            newTemplate.options = propertyTemplate.options.map((option) => ({...option}))
        }

        newTemplate.type = newType
        newTemplate.name = newName

        const oldBlocks: Block[] = []
        const newBlocks: Block[] = []
        const newBlockIDs: string[] = []

        if (propertyTemplate.type !== newType) {
            // These stay explicit type names rather than propsRegistry lookups.
            // card/card.tsx imports this module, so importing the registry here
            // closes a cycle (registry -> card property -> card -> mutator) and
            // the registry reads as undefined at module init. Conversion never
            // reaches these branches for types outside the lists anyway.
            const isNewTypeSelectOrMulti = newType === 'select' || newType === 'multiSelect'
            const isNewTypePersonOrMulti = newType === 'person' || newType === 'multiPerson'

            const isOldTypeSelectOrMulti = propertyTemplate.type === 'select' || propertyTemplate.type === 'multiSelect'
            const isOldTypePersonOrMulti = propertyTemplate.type === 'person' || propertyTemplate.type === 'multiPerson'

            // If the old type was either select/multiselect or person/multiperson
            if (isOldTypeSelectOrMulti || isOldTypePersonOrMulti) {
                for (const card of cards) {
                    // if array get first value, if exists
                    const oldValue = Array.isArray(card.fields.properties[propertyTemplate.id]) ? (card.fields.properties[propertyTemplate.id].length > 0 && card.fields.properties[propertyTemplate.id][0] as string) : card.fields.properties[propertyTemplate.id] as string
                    if (oldValue) {
                        let newValue: string | undefined
                        if (isOldTypePersonOrMulti) {
                            if (isNewTypePersonOrMulti) {
                                newValue = oldValue
                            }
                        } else if (isNewTypeSelectOrMulti) {
                            if (isOldTypeSelectOrMulti) {
                                newValue = propertyTemplate.options.find((o) => o.id === oldValue)?.id
                            } else {
                                newValue = propertyTemplate.options.find((o) => o.id === oldValue)?.value
                            }
                        }
                        const newCard = createCard(card)
                        if (newValue) {
                            if (newType === 'multiSelect' || newType === 'multiPerson') {
                                newCard.fields.properties[propertyTemplate.id] = [newValue]
                            } else {
                                newCard.fields.properties[propertyTemplate.id] = newValue
                            }
                        } else {
                            // This was an invalid select option or old person id, so delete it
                            delete newCard.fields.properties[propertyTemplate.id]
                        }

                        newBlocks.push(newCard)
                        newBlockIDs.push(newCard.id)
                        oldBlocks.push(card)
                    }

                    if (isNewTypeSelectOrMulti) {
                        newTemplate.options = propertyTemplate.options
                    }
                }
            } else if (isNewTypeSelectOrMulti) { // if the new type is either select or multiselect - old type is other
                // Map values to new template option IDs
                for (const card of cards) {
                    const oldValue = card.fields.properties[propertyTemplate.id] as string
                    if (oldValue) {
                        let option = newTemplate.options.find((o: IPropertyOption) => o.value === oldValue)
                        if (!option) {
                            option = {
                                id: Utils.createGuid(IDType.None),
                                value: oldValue,
                                color: 'propColorDefault',
                            }
                            newTemplate.options.push(option)
                        }

                        const newCard = createCard(card)
                        newCard.fields.properties[propertyTemplate.id] = newType === 'multiSelect' ? [option.id] : option.id

                        newBlocks.push(newCard)
                        newBlockIDs.push(newCard.id)
                        oldBlocks.push(card)
                    }
                }
            } else if (isNewTypePersonOrMulti) { // if the new type is either person or multiperson - old type is other
                // Clear old values
                for (const card of cards) {
                    const oldValue = card.fields.properties[propertyTemplate.id] as string
                    if (oldValue) {
                        const newCard = createCard(card)
                        delete newCard.fields.properties[propertyTemplate.id]
                        newBlocks.push(newCard)
                        newBlockIDs.push(newCard.id)
                        oldBlocks.push(card)
                    }
                }
            }
        }

        if (newBlockIDs.length > 0) {
            const [updatePatch, undoPatch] = createPatchesFromBoardsAndBlocks(newBoard, board, newBlockIDs, newBlocks, oldBlocks)
            await undoManager.perform(
                async () => {
                    await octoClient.patchBoardsAndBlocks(updatePatch)
                },
                async () => {
                    await octoClient.patchBoardsAndBlocks(undoPatch)
                },
                'change property type and name',
                this.undoGroupId,
            )
        } else {
            this.updateBoard(newBoard, oldBoard, 'change property name')
        }
    }

    // Views

    async changeViewSortOptions(boardId: string, viewId: string, oldSortOptions: ISortOption[], sortOptions: ISortOption[]): Promise<void> {
        const previousView = store.getState().views.views[viewId]
        const optimisticView = previousView ? createBoardView(previousView) : undefined
        if (optimisticView) {
            optimisticView.fields.sortOptions = sortOptions
        }

        try {
            await undoManager.perform(
                async () => {
                    if (optimisticView) {
                        store.dispatch(updateView(optimisticView))
                    }
                    await octoClient.patchBlock(boardId, viewId, {updatedFields: {sortOptions}})
                },
                async () => {
                    if (previousView) {
                        store.dispatch(updateView(previousView))
                    }
                    await octoClient.patchBlock(boardId, viewId, {updatedFields: {sortOptions: oldSortOptions}})
                },
                'sort',
                this.undoGroupId,
            )
        } catch (err) {
            if (previousView) {
                store.dispatch(updateView(previousView))
            }
            throw err
        }
    }

    async changeViewFilter(boardId: string, viewId: string, oldFilter: FilterGroup, filter: FilterGroup): Promise<void> {
        const previousView = store.getState().views.views[viewId]
        const optimisticView = previousView ? createBoardView(previousView) : undefined
        if (optimisticView) {
            optimisticView.fields.filter = filter
        }

        try {
            await undoManager.perform(
                async () => {
                    if (optimisticView) {
                        store.dispatch(updateView(optimisticView))
                    }
                    await octoClient.patchBlock(boardId, viewId, {updatedFields: {filter}})
                },
                async () => {
                    if (previousView) {
                        store.dispatch(updateView(previousView))
                    }
                    await octoClient.patchBlock(boardId, viewId, {updatedFields: {filter: oldFilter}})
                },
                'filter',
                this.undoGroupId,
            )
        } catch (err) {
            if (previousView) {
                store.dispatch(updateView(previousView))
            }
            throw err
        }
    }

    async changeViewGroupById(boardId: string, viewId: string, oldGroupById: string|undefined, groupById: string): Promise<void> {
        const previousView = store.getState().views.views[viewId]
        const oldVisibleOptionIds = previousView?.fields.visibleOptionIds || []
        const oldHiddenOptionIds = previousView?.fields.hiddenOptionIds || []
        const oldCollapsedOptionIds = previousView?.fields.collapsedOptionIds || []
        const oldKanbanCalculations = previousView?.fields.kanbanCalculations || {}
        const resetFields = {
            groupById,
            visibleOptionIds: [],
            hiddenOptionIds: [],
            collapsedOptionIds: [],
            kanbanCalculations: {},
        }
        const optimisticView = previousView ? createBoardView(previousView) : undefined
        if (optimisticView) {
            optimisticView.fields.groupById = groupById
            optimisticView.fields.visibleOptionIds = []
            optimisticView.fields.hiddenOptionIds = []
            optimisticView.fields.collapsedOptionIds = []
            optimisticView.fields.kanbanCalculations = {}
        }

        try {
            await undoManager.perform(
                async () => {
                    if (optimisticView) {
                        store.dispatch(updateView(optimisticView))
                    }
                    await octoClient.patchBlock(boardId, viewId, {updatedFields: resetFields})
                },
                async () => {
                    if (previousView) {
                        store.dispatch(updateView(previousView))
                    }
                    await octoClient.patchBlock(boardId, viewId, {updatedFields: {
                        groupById: oldGroupById,
                        visibleOptionIds: oldVisibleOptionIds,
                        hiddenOptionIds: oldHiddenOptionIds,
                        collapsedOptionIds: oldCollapsedOptionIds,
                        kanbanCalculations: oldKanbanCalculations,
                    }})
                },
                'group by',
                this.undoGroupId,
            )
        } catch (err) {
            if (previousView) {
                store.dispatch(updateView(previousView))
            }
            throw err
        }
    }

    async changeViewDateDisplayPropertyId(boardId: string, viewId: string, oldDateDisplayPropertyId: string|undefined, dateDisplayPropertyId: string): Promise<void> {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {dateDisplayPropertyId}})
            },
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {dateDisplayPropertyId: oldDateDisplayPropertyId}})
            },
            'display by',
            this.undoDisplayId,
        )
    }

    async changeViewVisiblePropertiesOrder(boardId: string, view: BoardView, template: IPropertyTemplate, destIndex: number, description = 'change property order'): Promise<void> {
        const oldVisiblePropertyIds = view.fields.visiblePropertyIds
        const newOrder = oldVisiblePropertyIds.slice()

        const srcIndex = oldVisiblePropertyIds.indexOf(template.id)
        Utils.log(`srcIndex: ${srcIndex}, destIndex: ${destIndex}`)

        newOrder.splice(destIndex, 0, newOrder.splice(srcIndex, 1)[0])

        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, view.id, {updatedFields: {visiblePropertyIds: newOrder}})
            },
            async () => {
                await octoClient.patchBlock(boardId, view.id, {updatedFields: {visiblePropertyIds: oldVisiblePropertyIds}})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeViewVisibleProperties(boardId: string, viewId: string, oldVisiblePropertyIds: string[], visiblePropertyIds: string[], description = 'show / hide property'): Promise<void> {
        const previousView = store.getState().views.views[viewId]
        const optimisticView = previousView ? createBoardView(previousView) : undefined
        if (optimisticView) {
            optimisticView.fields.visiblePropertyIds = visiblePropertyIds
        }

        try {
            await undoManager.perform(
                async () => {
                    if (optimisticView) {
                        store.dispatch(updateView(optimisticView))
                    }
                    await octoClient.patchBlock(boardId, viewId, {updatedFields: {visiblePropertyIds}})
                },
                async () => {
                    if (previousView) {
                        store.dispatch(updateView(previousView))
                    }
                    await octoClient.patchBlock(boardId, viewId, {updatedFields: {visiblePropertyIds: oldVisiblePropertyIds}})
                },
                description,
                this.undoGroupId,
            )
        } catch (err) {
            if (previousView) {
                store.dispatch(updateView(previousView))
            }
            throw err
        }
    }

    async changeViewVisibleOptionIds(boardId: string, viewId: string, oldVisibleOptionIds: string[], visibleOptionIds: string[], description = 'reorder'): Promise<void> {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {visibleOptionIds}})
            },
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {visibleOptionIds: oldVisibleOptionIds}})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeViewHiddenOptionIds(boardId: string, viewId: string, oldHiddenOptionIds: string[], hiddenOptionIds: string[], description = 'reorder'): Promise<void> {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {hiddenOptionIds}})
            },
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {hiddenOptionIds: oldHiddenOptionIds}})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeViewKanbanCalculations(boardId: string, viewId: string, oldCalculations: Record<string, KanbanCalculationFields>, calculations: Record<string, KanbanCalculationFields>, description = 'updated kanban calculations'): Promise<void> {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {kanbanCalculations: calculations}})
            },
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {kanbanCalculations: oldCalculations}})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeViewColumnCalculations(boardId: string, viewId: string, oldCalculations: Record<string, string>, calculations: Record<string, string>, description = 'updated kanban calculations'): Promise<void> {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {columnCalculations: calculations}})
            },
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {columnCalculations: oldCalculations}})
            },
            description,
            this.undoGroupId,
        )
    }

    async changeViewCardOrder(boardId: string, viewId: string, oldCardOrder: string[], cardOrder: string[], description = 'reorder'): Promise<void> {
        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {cardOrder}})
            },
            async () => {
                await octoClient.patchBlock(boardId, viewId, {updatedFields: {cardOrder: oldCardOrder}})
            },
            description,
            this.undoGroupId,
        )
    }

    async hideViewColumns(boardId: string, view: BoardView, columnOptionIds: string[]): Promise<void> {
        if (columnOptionIds.every((o) => view.fields.hiddenOptionIds.includes(o))) {
            return
        }

        const oldVisibleOptionIds = view.fields.visibleOptionIds
        const oldHiddenOptionIds = view.fields.hiddenOptionIds
        const newVisibleOptionIds = oldVisibleOptionIds.filter((o) => !columnOptionIds.includes(o))
        const newHiddenOptionIds = [...oldHiddenOptionIds, ...columnOptionIds]

        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, view.id, {
                    updatedFields: {visibleOptionIds: newVisibleOptionIds, hiddenOptionIds: newHiddenOptionIds},
                })
            },
            async () => {
                await octoClient.patchBlock(boardId, view.id, {
                    updatedFields: {visibleOptionIds: oldVisibleOptionIds, hiddenOptionIds: oldHiddenOptionIds},
                })
            },
            'hide column',
            this.undoGroupId,
        )
    }

    async hideViewColumn(boardId: string, view: BoardView, columnOptionId: string): Promise<void> {
        return this.hideViewColumns(boardId, view, [columnOptionId])
    }

    async unhideViewColumns(boardId: string, view: BoardView, columnOptionIds: string[]): Promise<void> {
        if (columnOptionIds.every((o) => view.fields.visibleOptionIds.includes(o))) {
            return
        }

        const oldVisibleOptionIds = view.fields.visibleOptionIds
        const oldHiddenOptionIds = view.fields.hiddenOptionIds
        const newHiddenOptionIds = oldHiddenOptionIds.filter((o) => !columnOptionIds.includes(o))

        // Put the columns at the end of the visible list
        const newVisibleOptionIds = oldVisibleOptionIds.filter((o) => !columnOptionIds.includes(o)).concat(columnOptionIds)

        await undoManager.perform(
            async () => {
                await octoClient.patchBlock(boardId, view.id, {
                    updatedFields: {visibleOptionIds: newVisibleOptionIds, hiddenOptionIds: newHiddenOptionIds},
                })
            },
            async () => {
                await octoClient.patchBlock(boardId, view.id, {
                    updatedFields: {visibleOptionIds: oldVisibleOptionIds, hiddenOptionIds: oldHiddenOptionIds},
                })
            },
            'show column',
            this.undoGroupId,
        )
    }

    async unhideViewColumn(boardId: string, view: BoardView, columnOptionId: string): Promise<void> {
        return this.unhideViewColumns(boardId, view, [columnOptionId])
    }

    async createCategory(category: Category): Promise<void> {
        await octoClient.createSidebarCategory(category)
    }

    async deleteCategory(teamID: string, categoryID: string): Promise<void> {
        await octoClient.deleteSidebarCategory(teamID, categoryID)
    }

    async updateCategory(category: Category): Promise<void> {
        await octoClient.updateSidebarCategory(category)
    }

    async moveBoardToCategory(teamID: string, blockID: string, toCategoryID: string, fromCategoryID: string): Promise<void> {
        await octoClient.moveBoardToCategory(teamID, blockID, toCategoryID, fromCategoryID)
    }

    async followBlock(blockId: string, blockType: string, userId: string) {
        await undoManager.perform(
            async () => {
                await octoClient.followBlock(blockId, blockType, userId)
            },
            async () => {
                await octoClient.unfollowBlock(blockId, blockType, userId)
            },
            'follow block',
            this.undoGroupId,
        )
    }

    async unfollowBlock(blockId: string, blockType: string, userId: string) {
        await undoManager.perform(
            async () => {
                await octoClient.unfollowBlock(blockId, blockType, userId)
            },
            async () => {
                await octoClient.followBlock(blockId, blockType, userId)
            },
            'follow block',
            this.undoGroupId,
        )
    }

    async patchUserConfig(userID: string, patch: UserConfigPatch): Promise<UserPreference[] | undefined> {
        return octoClient.patchUserConfig(userID, patch)
    }

    // Duplicate

    async duplicateCard(
        cardId: string,
        boardId: string,
        fromTemplate = false,
        description = 'duplicate card',
        asTemplate = false,
        propertyOverrides?: Record<string, string | string[]>,
        afterRedo?: (newCardId: string) => Promise<void>,
        beforeUndo?: () => Promise<void>,
    ): Promise<[Block[], string]> {
        return undoManager.perform(
            async () => {
                const blocks = await octoClient.duplicateBlock(boardId, cardId, asTemplate)
                const newRootBlock = blocks && blocks[0]
                if (!newRootBlock) {
                    Utils.log('Unable to duplicate card')
                    return [[], '']
                }
                if (asTemplate === fromTemplate) {
                    // Copy template
                    newRootBlock.title = `${newRootBlock.title} copy`
                } else if (asTemplate) {
                    // Template from card
                    newRootBlock.title = 'New card template'
                } else {
                    // Card from template
                    newRootBlock.title = ''

                    // If the template doesn't specify an icon, initialize it to a random one
                    if (!newRootBlock.fields.icon && UserSettings.prefillRandomIcons) {
                        newRootBlock.fields.icon = BlockIcons.shared.randomIcon()
                    }
                }
                const patch = {
                    updatedFields: {
                        icon: newRootBlock.fields.icon,
                        properties: {...newRootBlock.fields.properties, ...propertyOverrides},
                    },
                    title: newRootBlock.title,
                }
                await octoClient.patchBlock(newRootBlock.boardId, newRootBlock.id, patch)
                if (blocks) {
                    updateAllBoardsAndBlocks([], blocks)
                    await afterRedo?.(newRootBlock.id)
                }
                return [blocks, newRootBlock.id]
            },
            async (result: [Block[], string]) => {
                await beforeUndo?.()
                const [newBlocks] = result
                const newRootBlock = newBlocks && newBlocks[0]
                if (newRootBlock) {
                    await octoClient.deleteBlock(newRootBlock.boardId, newRootBlock.id)
                }
            },
            description,
            this.undoGroupId,
        )
    }

    async duplicateBoard(
        boardId: string,
        description = 'duplicate board',
        asTemplate = false,
        afterRedo?: (newBoardId: string) => Promise<void>,
        beforeUndo?: () => Promise<void>,
        toTeam?: string,
    ): Promise<BoardsAndBlocks> {
        return undoManager.perform(
            async () => {
                const boardsAndBlocks = await octoClient.duplicateBoard(boardId, asTemplate, toTeam)
                if (boardsAndBlocks) {
                    updateAllBoardsAndBlocks(boardsAndBlocks.boards, boardsAndBlocks.blocks)
                    await afterRedo?.(boardsAndBlocks.boards[0]?.id)
                }
                return boardsAndBlocks
            },
            async (boardsAndBlocks: BoardsAndBlocks) => {
                await beforeUndo?.()
                const awaits = []
                for (const block of boardsAndBlocks.blocks) {
                    awaits.push(octoClient.deleteBlock(block.boardId, block.id))
                }
                for (const board of boardsAndBlocks.boards) {
                    awaits.push(octoClient.deleteBoard(board.id))
                }
                await Promise.all(awaits)
            },
            description,
            this.undoGroupId,
        )
    }

    async addBoardFromTemplate(
        teamId: string,
        intl: IntlShape,
        afterRedo: (id: string) => Promise<void>,
        beforeUndo: () => Promise<void>,
        boardTemplateId: string,
        toTeam?: string,
    ): Promise<BoardsAndBlocks> {
        const asTemplate = false
        const actionDescription = intl.formatMessage({id: 'Mutator.new-board-from-template', defaultMessage: 'new board from template'})
        return mutator.duplicateBoard(boardTemplateId, actionDescription, asTemplate, afterRedo, beforeUndo, toTeam)
    }

    async addEmptyBoard(
        teamId: string,
        intl: IntlShape,
        afterRedo?: (id: string) => Promise<void>,
        beforeUndo?: () => Promise<void>,
    ): Promise<BoardsAndBlocks> {
        const board = createBoard()
        board.teamId = teamId

        const view = createBoardView()
        view.fields.viewType = 'board'
        view.parentId = board.id
        view.boardId = board.id
        view.title = intl.formatMessage({id: 'View.NewBoardTitle', defaultMessage: 'Board view'})

        return mutator.createBoardsAndBlocks(
            {boards: [board], blocks: [view]},
            'add board',
            async (bab: BoardsAndBlocks) => {
                const newBoard = bab.boards[0]
                TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.CreateBoard, {board: newBoard?.id})
                afterRedo && await afterRedo(newBoard?.id || '')
            },
            beforeUndo,
        )
    }

    async addEmptyBoardTemplate(
        teamId: string,
        intl: IntlShape,
        afterRedo: (id: string) => Promise<void>,
        beforeUndo: () => Promise<void>,
    ): Promise<BoardsAndBlocks> {
        const boardTemplate = createBoard()
        boardTemplate.isTemplate = true
        boardTemplate.teamId = teamId
        boardTemplate.title = intl.formatMessage({id: 'View.NewTemplateDefaultTitle', defaultMessage: 'Untitled Template'})

        const view = createBoardView()
        view.fields.viewType = 'board'
        view.parentId = boardTemplate.id
        view.boardId = boardTemplate.id
        view.title = intl.formatMessage({id: 'View.NewBoardTitle', defaultMessage: 'Board view'})

        return mutator.createBoardsAndBlocks(
            {boards: [boardTemplate], blocks: [view]},
            'add board template',
            async (bab: BoardsAndBlocks) => {
                const newBoard = bab.boards[0]
                TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.CreateBoardTemplate, {board: newBoard?.id})
                afterRedo(newBoard?.id || '')
            },
            beforeUndo,
        )
    }

    // Other methods

    // Not a mutator, but convenient to put here since Mutator wraps OctoClient
    async exportBoardArchive(boardID: string): Promise<Response> {
        return octoClient.exportBoardArchive(boardID)
    }

    // Not a mutator, but convenient to put here since Mutator wraps OctoClient
    async exportFullArchive(teamID: string): Promise<Response> {
        return octoClient.exportFullArchive(teamID)
    }

    // Not a mutator, but convenient to put here since Mutator wraps OctoClient
    async importFullArchive(file: File): Promise<Response> {
        return octoClient.importFullArchive(file)
    }

    get canUndo(): boolean {
        return undoManager.canUndo
    }

    get canRedo(): boolean {
        return undoManager.canRedo
    }

    get undoDescription(): string | undefined {
        return undoManager.undoDescription
    }

    get redoDescription(): string | undefined {
        return undoManager.redoDescription
    }

    async undo() {
        await undoManager.undo()
    }

    async redo() {
        await undoManager.redo()
    }

    // ========================================
    // Scheduled Comments
    // ========================================

    /**
     * Create a scheduled comment
     * Note: Scheduled comments are not undoable since they're time-sensitive
     */
    async createScheduledComment(
        boardId: string,
        cardId: string,
        title: string,
        scheduledAt: number,
    ): Promise<Block | undefined> {
        const comment = await octoClient.createScheduledComment(boardId, cardId, title, scheduledAt)
        if (comment) {
            store.dispatch(updateComments([comment as CommentBlock]))
        }
        return comment
    }

    /**
     * Cancel a scheduled comment
     */
    async cancelScheduledComment(boardId: string, blockId: string): Promise<Block | undefined> {
        const comment = await octoClient.cancelScheduledComment(boardId, blockId)
        if (comment) {
            store.dispatch(updateComments([comment as CommentBlock]))
        }
        return comment
    }

    /**
     * Send a scheduled comment immediately
     */
    async sendScheduledCommentNow(boardId: string, blockId: string): Promise<Block | undefined> {
        const comment = await octoClient.sendScheduledCommentNow(boardId, blockId)
        if (comment) {
            store.dispatch(updateComments([comment as CommentBlock]))
        }
        return comment
    }

    /**
     * Update a scheduled comment's content or scheduled time
     */
    async updateScheduledComment(
        boardId: string,
        blockId: string,
        title?: string,
        scheduledAt?: number,
    ): Promise<Block | undefined> {
        const comment = await octoClient.updateScheduledComment(boardId, blockId, title, scheduledAt)
        if (comment) {
            store.dispatch(updateComments([comment as CommentBlock]))
        }
        return comment
    }

    /**
     * Fetch scheduled comments for a card
     */
    async fetchScheduledCommentsForCard(boardId: string, cardId: string): Promise<Block[]> {
        const comments = await octoClient.getScheduledCommentsForCard(boardId, cardId)
        if (comments.length > 0) {
            store.dispatch(updateComments(comments as CommentBlock[]))
        }
        return comments
    }

    /**
     * Fetch all scheduled comments for the current user
     */
    async fetchMyScheduledComments(): Promise<Block[]> {
        return octoClient.getMyScheduledComments()
    }

    async createSubCard(
        boardId: string,
        parentCardId: string,
        title = '',
        afterRedo?: (card: Card) => Promise<void>,
        beforeUndo?: (card: Card) => Promise<void>,
    ): Promise<Card | undefined> {
        const card = createCard()
        card.boardId = boardId
        card.title = title

        return undoManager.perform(
            async () => {
                const apiCard = await octoClient.createSubCard(boardId, parentCardId, card)
                if (apiCard) {
                    const newCard = this.apiCardToCard(apiCard)
                    await afterRedo?.(newCard)
                    return newCard
                }
                return undefined
            },
            async (newCard: Card) => {
                await beforeUndo?.(newCard)
                await octoClient.deleteBlock(boardId, newCard.id)
            },
            'add sub-card',
            this.undoGroupId,
        )
    }

    async fetchSubCards(parentCardId: string): Promise<Card[]> {
        const apiCards = await octoClient.getSubCards(parentCardId)
        return apiCards.map((apiCard: any) => this.apiCardToCard(apiCard))
    }

    private apiCardToCard(apiCard: any): Card {
        return {
            id: apiCard.id || '',
            parentId: apiCard.parentCardId || apiCard.boardId || '',
            boardId: apiCard.boardId || '',
            createdBy: apiCard.createdBy || '',
            modifiedBy: apiCard.modifiedBy || '',
            schema: 1,
            type: 'card',
            title: apiCard.title || '',
            createAt: apiCard.createAt || 0,
            updateAt: apiCard.updateAt || 0,
            deleteAt: apiCard.deleteAt || 0,
            fields: {
                icon: apiCard.icon || '',
                properties: apiCard.properties || {},
                contentOrder: apiCard.contentOrder || [],
                isTemplate: apiCard.isTemplate || false,
                parentCardId: apiCard.parentCardId || '',
                depth: apiCard.depth || 0,
            },
            limited: false,
        }
    }

    async fetchSubCardCount(parentCardId: string): Promise<number> {
        return octoClient.getSubCardCount(parentCardId)
    }

    async linkCardAsSubCard(
        cardId: string,
        parentCardId: string,
        afterRedo?: (card: Card) => Promise<void>,
    ): Promise<Card | undefined> {
        return undoManager.perform(
            async () => {
                const apiCard = await octoClient.linkCardAsSubCard(cardId, parentCardId)
                if (apiCard) {
                    const linkedCard = this.apiCardToCard(apiCard)
                    await afterRedo?.(linkedCard)
                    return linkedCard
                }
                return undefined
            },
            async () => {
                await octoClient.unlinkSubCard(cardId)
            },
            'link card as sub-card',
            this.undoGroupId,
        )
    }

    async unlinkSubCard(
        cardId: string,
        originalParentCardId: string,
        afterRedo?: (card: Card) => Promise<void>,
    ): Promise<Card | undefined> {
        return undoManager.perform(
            async () => {
                const apiCard = await octoClient.unlinkSubCard(cardId)
                if (apiCard) {
                    const unlinkedCard = this.apiCardToCard(apiCard)
                    await afterRedo?.(unlinkedCard)
                    return unlinkedCard
                }
                return undefined
            },
            async () => {
                if (originalParentCardId) {
                    await octoClient.linkCardAsSubCard(cardId, originalParentCardId)
                }
            },
            'unlink sub-card',
            this.undoGroupId,
        )
    }
}

const mutator = new Mutator()
export default mutator

export {mutator}
