// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import difference from 'lodash/difference'

import {Utils, IDType} from '../utils'

import {Block, BlockPatch, createPatchesFromBlocks} from './block'
import {Card} from './card'

const BoardTypeOpen = 'O'
const BoardTypePrivate = 'P'
const boardTypes = [BoardTypeOpen, BoardTypePrivate]
type BoardTypes = typeof boardTypes[number]

enum MemberRole {
    Viewer = 'viewer',
    Commenter = 'commenter',
    Editor = 'editor',
    Admin = 'admin',
    None = '',
}

type Board = {
    id: string
    teamId: string
    channelId?: string
    createdBy: string
    modifiedBy: string
    type: BoardTypes
    minimumRole: MemberRole

    title: string
    description: string
    icon?: string
    showDescription: boolean
    isTemplate: boolean
    templateVersion: number
    properties: Record<string, string | string[] | PropertyAccessSettings | OrgColors | OkrBoardSettings>
    cardProperties: IPropertyTemplate[]

    createAt: number
    updateAt: number
    deleteAt: number
}

type BoardPatch = {
    type?: BoardTypes
    minimumRole?: MemberRole
    title?: string
    description?: string
    icon?: string
    showDescription?: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatedProperties?: Record<string, any>
    deletedProperties?: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatedCardProperties?: IPropertyTemplate[]
    deletedCardProperties?: string[]
}

type BoardMember = {
    boardId: string
    userId: string
    roles?: string
    minimumRole: MemberRole
    schemeAdmin: boolean
    schemeEditor: boolean
    schemeCommenter: boolean
    schemeViewer: boolean
    synthetic: boolean
}


type BoardCapabilities = {
    canView: boolean
    canCommentCard: boolean
    canCreateCard: boolean
    canEditCard: boolean
    canDeleteCard: boolean
    canManageBoard: boolean
    canDeleteBoard: boolean

    // The only one that is not a permission level in disguise. Hanging a card off
    // another asks whether a rule put this user in that card's tree, which the
    // OKR matrix makes different from any rank: 팀장 and 팀원 only read their
    // division's Key Results and build the Tasks beneath them.
    canAddSubCard: boolean
}

type BoardPermissionsResponse = {
    boardId: string
    effectivePermission: 'none' | 'view' | 'commenter' | 'edit' | 'manage'
    capabilities: BoardCapabilities
    derivedFrom: string

    // What the card access rules allow on individual cards, keyed by card ID.
    // Absent on boards with no active rules, and the board wide capabilities
    // above apply to every card instead.
    cardPermissions?: {[cardId: string]: BoardCapabilities}
}


// Card level access rules stored under board.properties.propertyAccess.
// The card side (propertyId, propertyValueId) picks which cards a row applies
// to; the subject side (divisionId, departmentId, dutyId) picks which users.
// An empty subject field means no constraint on that axis.
type PropertyAccessPermission = 'viewer' | 'commenter' | 'editor'

// How a rule compares the card's organisation to the viewer's, instead of naming
// an organisation outright. Naming one means a rule per organisation, and "본인
// 본부" cannot be written at all.
//
// A union rather than a string: a typo would otherwise reach the server, come
// back rejected, and read as a save failure rather than as a wrong value.
type OrgRelation = '' | 'any' | 'sameDivision' | 'otherDivision' | 'sameDepartment' | 'mine'

type PropertyAccessRule = {
    id: string
    propertyId: string

    // One row can name several values — "Objective 또는 Key Result" is one row.
    // propertyValueId is what an older rule carries; both are read, the list first.
    propertyValueIds?: string[]
    propertyValueId: string

    divisionId: string
    departmentId: string

    // Duty groups the team owns. One row can name several — "팀장 또는 팀원" is
    // one row. dutyId is what an older rule carries; the groups are read first.
    tierIds?: string[]
    dutyId: string

    // relation replaces the two absolute organisation axes when set.
    relation?: OrgRelation

    // Which card property a division or department relation reads. A board can
    // carry two 본부 properties, so the rule says which.
    orgPropertyId?: string

    // Which person property `mine` reads. Empty still works — authorship alone
    // decides.
    assigneePropertyId?: string

    permission: PropertyAccessPermission

    // Marks the rows the matrix editor owns, so saving from the matrix leaves
    // hand-written exceptions alone.
    source?: string
}

// A named set of 직책 — "C-Level" standing for CSO, COO, CFO and CGO.
//
// It belongs to the team, not to a board: which duties count as C-Level is a
// fact about the company. It is not a rank — no order, and a tier holding one
// duty behaves exactly like one holding four.
type DutyTier = {
    id: string
    name: string
    dutyIds: string[]
}

// What the server sends back with the tiers. The flag cannot be worked out in
// the browser — a team admin is not a system role, so it does not appear on the
// user object.
type DutyTiersResponse = {
    tiers: DutyTier[]
    canEdit: boolean

    // How many boards this viewer can see point at each group. Deleting one
    // stops every such rule from matching, so the number is shown first.
    boardCounts?: {[tierId: string]: number}
}

// The relations a rule can pick, in the order the selector offers them.
const orgRelations: OrgRelation[] = ['any', 'sameDivision', 'otherDivision', 'sameDepartment', 'mine']

// The relations that read an organisation property off the card. `mine` reads a
// person property instead, and `any` reads nothing.
const orgRelationsNeedingProperty: OrgRelation[] = ['sameDivision', 'otherDivision', 'sameDepartment']

// The values a rule's card side names, reading the list first and falling back
// to the single value an older rule carries.
function cardValueIds(rule: PropertyAccessRule): string[] {
    if (rule.propertyValueIds && rule.propertyValueIds.length > 0) {
        return rule.propertyValueIds
    }
    return rule.propertyValueId ? [rule.propertyValueId] : []
}

type PropertyAccessSettings = {
    enabled: boolean
    updatedBy: string
    updatedAt: number
    rules: PropertyAccessRule[]
}

// Read-only organisation master entries used by the rule selectors.
type OrgUnit = {
    id: string
    name: string
    type: 'division' | 'department'
    parentId: string
}

// Which organisation unit a user belongs to. Users with no assignment are
// absent from the list rather than present with an empty orgUnitId.
type UserOrgMembership = {
    userId: string
    orgUnitId: string
}

type Duty = {
    id: string
    code: string
    name: string
    rank: number
    fullVisibility: boolean
}

// What the organisation property screens actually read: a card stores IDs and
// every screen has to put a name next to one. Both OrgUnit and Duty satisfy it,
// which is what lets 본부, 부서 and 직책 share one editor and one name resolver.
type NamedEntry = {
    id: string
    name: string
}

// What a board remembers when it is used as an OKR board, stored under
// board.properties.okrBoard.
//
// levels holds option IDs rather than names: a user may rename Tasks to 할 일
// at any time, and the ladder has to survive it. Depth indexes the array and
// anything past the end takes the last entry, so 3단계 and deeper share one
// value without the shape having to know how deep cards can go.
type OkrBoardSettings = {
    propertyId: string
    levels: string[]
}

// Colours a board remembers for organisation values, stored under
// board.properties.orgColors and keyed by organisation unit ID.
//
// Only the picks live here. The colour a value gets without being picked is
// computed from its ID, so an untouched board stores nothing at all — and the
// same 본부 keeps its colour across boards.
//
// Keyed by unit rather than by property: a board with two 본부 properties shows
// the same unit in the same colour in both.
type OrgColors = {[orgUnitId: string]: string}

type BoardsAndBlocks = {
    boards: Board[]
    blocks: Block[]
}

type BoardsAndBlocksPatch = {
    boardIDs: string[]
    boardPatches: BoardPatch[]
    blockIDs: string[]
    blockPatches: BlockPatch[]
}

type PropertyTypeEnum = 'text' | 'number' | 'select' | 'multiSelect' | 'date' | 'person' | 'multiPerson' | 'file' | 'checkbox' | 'url' | 'email' | 'phone' | 'createdTime' | 'createdBy' | 'updatedTime' | 'updatedBy' | 'card' | 'orgDivision' | 'orgDepartment' | 'orgDuty' | 'unknown'

interface IPropertyOption {
    id: string
    value: string
    color: string
}

// A template for card properties attached to a board
interface IPropertyTemplate {
    id: string
    name: string
    type: PropertyTypeEnum
    options: IPropertyOption[]
    index?: number
    required?: boolean
}

function createBoard(board?: Board): Board {
    const now = Date.now()
    let cardProperties: IPropertyTemplate[] = []
    const selectProperties = cardProperties.find((o) => o.type === 'select')
    if (!selectProperties) {
        const property: IPropertyTemplate = {
            id: Utils.createGuid(IDType.BlockID),
            name: 'Status',
            type: 'select',
            options: [],
        }
        cardProperties.push(property)
    }

    if (board?.cardProperties) {
        // Deep clone of card properties and their options
        cardProperties = board?.cardProperties.map((o: IPropertyTemplate) => {
            return {
                id: o.id,
                name: o.name,
                type: o.type,
                options: o.options ? o.options.map((option) => ({...option})) : [],
                required: o.required,
            }
        })
    }

    return {
        id: board?.id || Utils.createGuid(IDType.Board),
        teamId: board?.teamId || '',
        channelId: board?.channelId || '',
        createdBy: board?.createdBy || '',
        modifiedBy: board?.modifiedBy || '',
        type: board?.type || BoardTypePrivate,
        minimumRole: board?.minimumRole || MemberRole.None,
        title: board?.title || '',
        description: board?.description || '',
        icon: board?.icon || '',
        showDescription: board?.showDescription || false,
        isTemplate: board?.isTemplate || false,
        templateVersion: board?.templateVersion || 0,
        properties: board?.properties || {},
        cardProperties,
        createAt: board?.createAt || now,
        updateAt: board?.updateAt || now,
        deleteAt: board?.deleteAt || 0,
    }
}

type BoardGroup = {
    option: IPropertyOption
    cards: Card[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// isPropertyEqual checks that both the contents of the property and
// its options are equal
function isPropertyEqual(propA: IPropertyTemplate, propB: IPropertyTemplate): boolean {
    for (const val of Object.keys(propA)) {
        if (val !== 'options' && (propA as any)[val] !== (propB as any)[val]) {
            return false
        }
    }

    if (propA.options.length !== propB.options.length) {
        return false
    }

    for (let i = 0; i < propA.options.length; i++) {
        const optA = propA.options[i]
        const optB = propB.options[i]

        if (optA.id !== optB.id) {
            return false
        }

        for (const val of Object.keys(optA)) {
            if ((optA as any)[val] !== (optB as any)[val]) {
                return false
            }
        }
    }

    return true
}

// createCardPropertiesPatches creates two BoardPatch instances, one that
// contains the delta to update the board cardProperties and another one for
// the undo action, in case it happens
function createCardPropertiesPatches(newCardProperties: IPropertyTemplate[], oldCardProperties: IPropertyTemplate[]): BoardPatch[] {
    const newIds = newCardProperties.map((prop) => prop.id)
    const oldIds = oldCardProperties.map((prop) => prop.id)

    const arraysEqual = (a: string[], b: string[]): boolean => {
        if (a.length !== b.length) {
            return false
        }
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
                return false
            }
        }
        return true
    }

    const withIndex = (props: IPropertyTemplate[]): IPropertyTemplate[] => props.map((prop, index) => ({
        ...prop,
        index,
    }))

    const newIdsSet = new Set<string>(newIds)
    const oldIdsSet = new Set<string>(oldIds)

    const deletedInNew = oldCardProperties.filter((prop) => !newIdsSet.has(prop.id)).map((prop) => prop.id)
    const deletedInOld = newCardProperties.filter((prop) => !oldIdsSet.has(prop.id)).map((prop) => prop.id)

    const orderChanged = !arraysEqual(newIds, oldIds)

    if (orderChanged) {
        return [
            {
                updatedCardProperties: withIndex(newCardProperties),
                deletedCardProperties: deletedInNew,
            },
            {
                updatedCardProperties: withIndex(oldCardProperties),
                deletedCardProperties: deletedInOld,
            },
        ]
    }

    const newDeletedCardProperties = deletedInNew
    const oldDeletedCardProperties = deletedInOld
    const newUpdatedCardProperties: IPropertyTemplate[] = []
    newCardProperties.forEach((val) => {
        const oldCardProperty = oldCardProperties.find((o) => o.id === val.id)
        if (!oldCardProperty || !isPropertyEqual(val, oldCardProperty)) {
            newUpdatedCardProperties.push(val)
        }
    })
    const oldUpdatedCardProperties: IPropertyTemplate[] = []
    oldCardProperties.forEach((val) => {
        const newCardProperty = newCardProperties.find((o) => o.id === val.id)
        if (!newCardProperty || !isPropertyEqual(val, newCardProperty)) {
            oldUpdatedCardProperties.push(val)
        }
    })

    return [
        {
            updatedCardProperties: newUpdatedCardProperties,
            deletedCardProperties: oldDeletedCardProperties,
        },
        {
            updatedCardProperties: oldUpdatedCardProperties,
            deletedCardProperties: newDeletedCardProperties,
        },
    ]
}

// createPatchesFromBoards creates two BoardPatch instances, one that
// contains the delta to update the board and another one for the undo
// action, in case it happens
function createPatchesFromBoards(newBoard: Board, oldBoard: Board): BoardPatch[] {
    const newDeletedProperties = difference(Object.keys(newBoard.properties || {}), Object.keys(oldBoard.properties || {}))

    const newUpdatedProperties: Record<string, any> = {}
    Object.keys(newBoard.properties || {}).forEach((val) => {
        if (oldBoard.properties[val] !== newBoard.properties[val]) {
            newUpdatedProperties[val] = newBoard.properties[val]
        }
    })

    const newData: Record<string, any> = {}
    Object.keys(newBoard).forEach((val) => {
        if (val !== 'properties' &&
            val !== 'cardProperties' &&
            (oldBoard as any)[val] !== (newBoard as any)[val]) {
            newData[val] = (newBoard as any)[val]
        }
    })

    const oldDeletedProperties = difference(Object.keys(oldBoard.properties || {}), Object.keys(newBoard.properties || {}))

    const oldUpdatedProperties: Record<string, any> = {}
    Object.keys(oldBoard.properties || {}).forEach((val) => {
        if (newBoard.properties[val] !== oldBoard.properties[val]) {
            oldUpdatedProperties[val] = oldBoard.properties[val]
        }
    })

    const oldData: Record<string, any> = {}
    Object.keys(oldBoard).forEach((val) => {
        if (val !== 'properties' &&
            val !== 'cardProperties' &&
            (newBoard as any)[val] !== (oldBoard as any)[val]) {
            oldData[val] = (oldBoard as any)[val]
        }
    })

    const [cardPropertiesPatch, cardPropertiesUndoPatch] = createCardPropertiesPatches(newBoard.cardProperties, oldBoard.cardProperties)

    return [
        {
            ...newData,
            ...cardPropertiesPatch,
            updatedProperties: newUpdatedProperties,
            deletedProperties: oldDeletedProperties,
        },
        {
            ...oldData,
            ...cardPropertiesUndoPatch,
            updatedProperties: oldUpdatedProperties,
            deletedProperties: newDeletedProperties,
        },
    ]
}

function createPatchesFromBoardsAndBlocks(updatedBoard: Board, oldBoard: Board, updatedBlockIDs: string[], updatedBlocks: Block[], oldBlocks: Block[]): BoardsAndBlocksPatch[] {
    const blockUpdatePatches = [] as BlockPatch[]
    const blockUndoPatches = [] as BlockPatch[]
    updatedBlocks.forEach((newBlock, i) => {
        const [updatePatch, undoPatch] = createPatchesFromBlocks(newBlock, oldBlocks[i])
        blockUpdatePatches.push(updatePatch)
        blockUndoPatches.push(undoPatch)
    })

    const [boardUpdatePatch, boardUndoPatch] = createPatchesFromBoards(updatedBoard, oldBoard)

    const updatePatch: BoardsAndBlocksPatch = {
        blockIDs: updatedBlockIDs,
        blockPatches: blockUpdatePatches,
        boardIDs: [updatedBoard.id],
        boardPatches: [boardUpdatePatch],
    }

    const undoPatch: BoardsAndBlocksPatch = {
        blockIDs: updatedBlockIDs,
        blockPatches: blockUndoPatches,
        boardIDs: [updatedBoard.id],
        boardPatches: [boardUndoPatch],
    }

    return [updatePatch, undoPatch]
}

export {
    Board,
    BoardPatch,
    BoardMember,
    BoardCapabilities,
    BoardPermissionsResponse,
    PropertyAccessPermission,
    PropertyAccessRule,
    PropertyAccessSettings,
    OrgRelation,
    DutyTier,
    DutyTiersResponse,
    orgRelations,
    orgRelationsNeedingProperty,
    cardValueIds,
    OrgUnit,
    UserOrgMembership,
    Duty,
    NamedEntry,
    OrgColors,
    OkrBoardSettings,
    BoardsAndBlocks,
    BoardsAndBlocksPatch,
    PropertyTypeEnum,
    IPropertyOption,
    IPropertyTemplate,
    BoardGroup,
    createBoard,
    BoardTypes,
    BoardTypeOpen,
    BoardTypePrivate,
    MemberRole,
    createPatchesFromBoards,
    createPatchesFromBoardsAndBlocks,
    createCardPropertiesPatches,
}
/* eslint-enable @typescript-eslint/no-explicit-any */
