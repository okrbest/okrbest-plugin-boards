// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {OrgRelation, PropertyAccessPermission, PropertyAccessRule, cardValueIds} from '../../blocks/board'
import {Utils} from '../../utils'

// The matrix and the rule list are the same thing shown two ways.
//
// The table gives the two axes a rule would otherwise have to state — which card
// type, which duty group — so a cell only has to answer the remaining two: how
// the viewer's organisation compares to the card's, and what that earns them.
//
// Folding cells back into rules is where the row count comes from. A group of
// cells sharing a relation and a permission collapses into one rule when it
// forms a full rectangle of types × groups; otherwise it splits per group. The
// standard matrix is six rectangles, which is why it stores as six rows (SC-002).

// SourceMatrix marks the rows this editor owns. Rows without it were written by
// hand and are never touched — the table only replaces what it produced.
export const SourceMatrix = 'matrix'

// One entry of a cell: a relation and what it grants.
export type MatrixEntry = {
    relation: OrgRelation
    permission: PropertyAccessPermission
}

// The matrix, keyed by card value and duty group.
export type MatrixCells = {[key: string]: MatrixEntry[]}

// What the conversion needs to know about the board it belongs to.
export type MatrixContext = {
    typeProperty: string
    levels: string[]

    // Which card properties the relations read. Division and department are kept
    // apart on purpose: a department relation pointed at the 본부 property
    // compares the wrong thing and quietly admits everyone in the division.
    orgProperty: string
    departmentProperty: string
    personProperty: string
}

export function cellKey(valueId: string, tierId: string): string {
    return `${valueId}:${tierId}`
}

// Which card property a relation reads. Division relations read the 본부
// property, the department relation reads 부서, and the rest read none.
const orgPropertyFor = (relation: OrgRelation, context: MatrixContext): string => {
    switch (relation) {
    case 'sameDivision':
    case 'otherDivision':
        return context.orgProperty

    // mine도 부서를 읽는다. "내 것"은 누구 카드인가와 어디 놓였는가를 함께 묻기
    // 때문이다 — 조직을 빼면 만드는 순간 작성자라는 사실만으로 어느 팀 Task든
    // 만들 수 있다.
    case 'sameDepartment':
    case 'mine':
        return context.departmentProperty
    default:
        return ''
    }
}

// rulesToMatrix spreads the rows this editor owns back across the cells.
//
// Rows it does not own are skipped rather than approximated. Showing a hand
// written exception as a cell would let the next save quietly rewrite it.
export function rulesToMatrix(rules: PropertyAccessRule[], context: MatrixContext): MatrixCells {
    const cells: MatrixCells = {}

    for (const rule of rules) {
        if (rule.source !== SourceMatrix || rule.propertyId !== context.typeProperty) {
            continue
        }

        const entry: MatrixEntry = {relation: rule.relation || '', permission: rule.permission}

        for (const valueId of cardValueIds(rule)) {
            for (const tierId of rule.tierIds || []) {
                const key = cellKey(valueId, tierId)
                cells[key] = [...(cells[key] || []), entry]
            }
        }
    }

    return cells
}

// matrixToRules folds the cells into rows, keeping every row the table does not
// own exactly as it was (FR-021).
export function matrixToRules(
    cells: MatrixCells,
    context: MatrixContext,
    existing: PropertyAccessRule[],
): PropertyAccessRule[] {
    const kept = existing.filter((rule) => rule.source !== SourceMatrix)

    // Group the filled cells by what they grant. Cells that grant the same thing
    // are the ones that can share a row.
    const groups = new Map<string, {entry: MatrixEntry, byTier: Map<string, string[]>}>()

    for (const valueId of context.levels) {
        for (const [key, entries] of Object.entries(cells)) {
            if (!key.startsWith(`${valueId}:`)) {
                continue
            }
            const tierId = key.slice(valueId.length + 1)

            for (const entry of entries) {
                const groupKey = `${entry.relation}|${entry.permission}`
                let group = groups.get(groupKey)
                if (!group) {
                    group = {entry, byTier: new Map()}
                    groups.set(groupKey, group)
                }
                group.byTier.set(tierId, [...(group.byTier.get(tierId) || []), valueId])
            }
        }
    }

    const generated: PropertyAccessRule[] = []

    for (const {entry, byTier} of groups.values()) {
        // A rectangle — every group in this batch covering the same card values —
        // becomes one row naming them all. Anything else splits per group,
        // because merging would hand a group values it was never given.
        const tierIds = [...byTier.keys()]
        const first = byTier.get(tierIds[0])!
        const isRectangle = tierIds.every((tierId) => {
            const values = byTier.get(tierId)!
            return values.length === first.length && values.every((value, index) => value === first[index])
        })

        if (isRectangle) {
            generated.push(buildRule(entry, first, tierIds, context))
            continue
        }

        for (const tierId of tierIds) {
            generated.push(buildRule(entry, byTier.get(tierId)!, [tierId], context))
        }
    }

    return [...kept, ...generated]
}

function buildRule(
    entry: MatrixEntry,
    valueIds: string[],
    tierIds: string[],
    context: MatrixContext,
): PropertyAccessRule {
    return {
        id: Utils.createGuid(Utils.blockTypeToIDType('block')),
        propertyId: context.typeProperty,
        propertyValueIds: valueIds,
        propertyValueId: '',
        divisionId: '',
        departmentId: '',
        dutyId: '',
        tierIds,
        relation: entry.relation,
        orgPropertyId: orgPropertyFor(entry.relation, context),
        assigneePropertyId: entry.relation === 'mine' ? context.personProperty : '',
        permission: entry.permission,
        source: SourceMatrix,
    }
}

// The duty groups the standard matrix expects, by the part they play.
export type StandardTiers = {
    ceo: string
    cLevel: string
    lead: string
    member: string
}

// standardMatrix is the company standard the requirement image describes.
//
// Twelve cells: three card types by four duty groups. The C-Level cells carry
// two entries because that column is split in the image — editing inside their
// own division, commenting outside it.
export function standardMatrix(levels: string[], tiers: StandardTiers): MatrixCells {
    const [objective, keyResult, task] = levels
    const cells: MatrixCells = {}

    for (const valueId of levels) {
        // 대표 — every division, every type.
        cells[cellKey(valueId, tiers.ceo)] = [{relation: 'any', permission: 'editor'}]

        // C-Level — their own division outright, other divisions to comment on.
        cells[cellKey(valueId, tiers.cLevel)] = [
            {relation: 'sameDivision', permission: 'editor'},
            {relation: 'otherDivision', permission: 'commenter'},
        ]
    }

    // 팀장·팀원 read their own division's objectives and key results.
    for (const valueId of [objective, keyResult]) {
        cells[cellKey(valueId, tiers.lead)] = [{relation: 'sameDivision', permission: 'viewer'}]
        cells[cellKey(valueId, tiers.member)] = [{relation: 'sameDivision', permission: 'viewer'}]
    }

    // Tasks are where the two part: a 팀장 runs their department's, a 팀원 their own.
    cells[cellKey(task, tiers.lead)] = [{relation: 'sameDepartment', permission: 'editor'}]
    cells[cellKey(task, tiers.member)] = [{relation: 'mine', permission: 'editor'}]

    return cells
}
