// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PropertyAccessRule} from '../../blocks/board'

import {cellKey, matrixToRules, rulesToMatrix, standardMatrix} from './accessMatrix'

// 009 US3 — 표와 규칙은 같은 것을 두 가지로 보여준다. 표의 칸이 규칙 줄로 접히고,
// 규칙 줄이 다시 칸으로 펼쳐진다.

const levels = ['opt-objective', 'opt-key-result', 'opt-task']
const typeProperty = 'prop-type'

const orgProperty = 'prop-division'
const personProperty = 'prop-assignee'

const context = {typeProperty, levels, orgProperty, personProperty}

describe('src/components/shareBoard/accessMatrix', () => {
    describe('matrixToRules', () => {
        test('한 칸이 규칙 한 줄이 된다', () => {
            const cells = {
                [cellKey('opt-task', 'tier-member')]: [{relation: 'mine' as const, permission: 'editor' as const}],
            }

            const rules = matrixToRules(cells, context, [])

            expect(rules).toHaveLength(1)
            expect(rules[0]).toMatchObject({
                propertyId: typeProperty,
                propertyValueIds: ['opt-task'],
                tierIds: ['tier-member'],
                relation: 'mine',
                permission: 'editor',
                source: 'matrix',
            })
        })

        test('같은 묶음의 여러 단계가 한 줄로 접힌다', () => {
            const cells = {
                [cellKey('opt-objective', 'tier-ceo')]: [{relation: 'any' as const, permission: 'editor' as const}],
                [cellKey('opt-key-result', 'tier-ceo')]: [{relation: 'any' as const, permission: 'editor' as const}],
                [cellKey('opt-task', 'tier-ceo')]: [{relation: 'any' as const, permission: 'editor' as const}],
            }

            const rules = matrixToRules(cells, context, [])

            expect(rules).toHaveLength(1)
            expect(rules[0].propertyValueIds).toEqual(levels)
        })

        test('같은 단계의 여러 묶음이 한 줄로 접힌다', () => {
            const cells = {
                [cellKey('opt-objective', 'tier-lead')]: [{relation: 'sameDivision' as const, permission: 'viewer' as const}],
                [cellKey('opt-objective', 'tier-member')]: [{relation: 'sameDivision' as const, permission: 'viewer' as const}],
            }

            const rules = matrixToRules(cells, context, [])

            expect(rules).toHaveLength(1)
            expect(rules[0].tierIds).toEqual(['tier-lead', 'tier-member'])
        })

        test('직사각형이 아니면 묶음별로 나눈다', () => {
            // 팀장은 Objective와 Task, 팀원은 Objective만. 한 줄로 접으면 팀원이
            // Task까지 얻는다 — 접을 수 없는 모양이다.
            const cells = {
                [cellKey('opt-objective', 'tier-lead')]: [{relation: 'sameDivision' as const, permission: 'viewer' as const}],
                [cellKey('opt-task', 'tier-lead')]: [{relation: 'sameDivision' as const, permission: 'viewer' as const}],
                [cellKey('opt-objective', 'tier-member')]: [{relation: 'sameDivision' as const, permission: 'viewer' as const}],
            }

            const rules = matrixToRules(cells, context, [])

            expect(rules).toHaveLength(2)
            const byTier = Object.fromEntries(rules.map((rule) => [rule.tierIds![0], rule.propertyValueIds]))
            expect(byTier['tier-lead']).toEqual(['opt-objective', 'opt-task'])
            expect(byTier['tier-member']).toEqual(['opt-objective'])
        })

        test('한 칸이 관계 둘을 담으면 줄도 둘이다', () => {
            const cells = {
                [cellKey('opt-objective', 'tier-clevel')]: [
                    {relation: 'sameDivision' as const, permission: 'editor' as const},
                    {relation: 'otherDivision' as const, permission: 'commenter' as const},
                ],
            }

            const rules = matrixToRules(cells, context, [])

            expect(rules).toHaveLength(2)
        })

        test('본부 관계는 조직 속성을, 본인은 담당자 속성을 싣는다', () => {
            const cells = {
                [cellKey('opt-objective', 'tier-clevel')]: [{relation: 'sameDivision' as const, permission: 'editor' as const}],
                [cellKey('opt-task', 'tier-member')]: [{relation: 'mine' as const, permission: 'editor' as const}],
            }

            const rules = matrixToRules(cells, context, [])

            const division = rules.find((rule) => rule.relation === 'sameDivision')!
            const mine = rules.find((rule) => rule.relation === 'mine')!

            expect(division.orgPropertyId).toBe(orgProperty)
            expect(mine.assigneePropertyId).toBe(personProperty)
        })

        test('손으로 만든 줄은 그대로 남는다', () => {
            const handWritten: PropertyAccessRule = {
                id: 'hand-1',
                propertyId: typeProperty,
                propertyValueId: 'opt-task',
                divisionId: 'div-strategy',
                departmentId: '',
                dutyId: 'duty-lead',
                permission: 'editor',
            }

            const rules = matrixToRules({
                [cellKey('opt-task', 'tier-member')]: [{relation: 'mine' as const, permission: 'editor' as const}],
            }, context, [handWritten])

            expect(rules.some((rule) => rule.id === 'hand-1')).toBe(true)
            expect(rules).toHaveLength(2)
        })

        test('표가 만든 옛 줄만 갈아 끼운다', () => {
            const previous: PropertyAccessRule = {
                id: 'matrix-old',
                propertyId: typeProperty,
                propertyValueId: 'opt-objective',
                divisionId: '',
                departmentId: '',
                dutyId: '',
                tierIds: ['tier-ceo'],
                relation: 'any',
                permission: 'viewer',
                source: 'matrix',
            }

            const rules = matrixToRules({
                [cellKey('opt-task', 'tier-member')]: [{relation: 'mine' as const, permission: 'editor' as const}],
            }, context, [previous])

            expect(rules.some((rule) => rule.id === 'matrix-old')).toBe(false)
            expect(rules).toHaveLength(1)
        })
    })

    describe('rulesToMatrix', () => {
        test('규칙 줄이 칸으로 펼쳐진다', () => {
            const rules: PropertyAccessRule[] = [{
                id: 'r1',
                propertyId: typeProperty,
                propertyValueIds: ['opt-objective', 'opt-key-result'],
                propertyValueId: '',
                divisionId: '',
                departmentId: '',
                dutyId: '',
                tierIds: ['tier-lead', 'tier-member'],
                relation: 'sameDivision',
                orgPropertyId: orgProperty,
                permission: 'viewer',
                source: 'matrix',
            }]

            const cells = rulesToMatrix(rules, context)

            expect(cells[cellKey('opt-objective', 'tier-lead')]).toEqual([{relation: 'sameDivision', permission: 'viewer'}])
            expect(cells[cellKey('opt-key-result', 'tier-member')]).toEqual([{relation: 'sameDivision', permission: 'viewer'}])
            expect(cells[cellKey('opt-task', 'tier-lead')]).toBeUndefined()
        })

        test('표 밖의 줄은 칸으로 안 온다', () => {
            const rules: PropertyAccessRule[] = [{
                id: 'hand-1',
                propertyId: typeProperty,
                propertyValueId: 'opt-task',
                divisionId: 'div-strategy',
                departmentId: '',
                dutyId: 'duty-lead',
                permission: 'editor',
            }]

            expect(rulesToMatrix(rules, context)).toEqual({})
        })

        test('왕복해도 같다', () => {
            const cells = standardMatrix(levels, {
                ceo: 'tier-ceo',
                cLevel: 'tier-clevel',
                lead: 'tier-lead',
                member: 'tier-member',
            })

            const rules = matrixToRules(cells, context, [])

            expect(rulesToMatrix(rules, context)).toEqual(cells)
        })
    })

    describe('standardMatrix', () => {
        test('요구사항 이미지의 12칸을 채운다', () => {
            const cells = standardMatrix(levels, {
                ceo: 'tier-ceo',
                cLevel: 'tier-clevel',
                lead: 'tier-lead',
                member: 'tier-member',
            })

            expect(Object.keys(cells)).toHaveLength(12)
        })

        test('규칙 여섯 줄로 접힌다', () => {
            const cells = standardMatrix(levels, {
                ceo: 'tier-ceo',
                cLevel: 'tier-clevel',
                lead: 'tier-lead',
                member: 'tier-member',
            })

            // SC-002 — 매트릭스 전체가 여섯 줄이다.
            expect(matrixToRules(cells, context, [])).toHaveLength(6)
        })

        test('C-Level 칸은 본인 본부와 타 본부를 함께 담는다', () => {
            const cells = standardMatrix(levels, {
                ceo: 'tier-ceo',
                cLevel: 'tier-clevel',
                lead: 'tier-lead',
                member: 'tier-member',
            })

            expect(cells[cellKey('opt-objective', 'tier-clevel')]).toEqual([
                {relation: 'sameDivision', permission: 'editor'},
                {relation: 'otherDivision', permission: 'commenter'},
            ])
        })

        test('팀원의 Task는 본인 것만이다', () => {
            const cells = standardMatrix(levels, {
                ceo: 'tier-ceo',
                cLevel: 'tier-clevel',
                lead: 'tier-lead',
                member: 'tier-member',
            })

            expect(cells[cellKey('opt-task', 'tier-member')]).toEqual([
                {relation: 'mine', permission: 'editor'},
            ])
        })

        test('팀장의 Task는 같은 부서다', () => {
            const cells = standardMatrix(levels, {
                ceo: 'tier-ceo',
                cLevel: 'tier-clevel',
                lead: 'tier-lead',
                member: 'tier-member',
            })

            expect(cells[cellKey('opt-task', 'tier-lead')]).toEqual([
                {relation: 'sameDepartment', permission: 'editor'},
            ])
        })
    })
})
