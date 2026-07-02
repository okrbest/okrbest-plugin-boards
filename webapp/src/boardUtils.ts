// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Card} from './blocks/card'
import {IPropertyTemplate, IPropertyOption, BoardGroup} from './blocks/board'

export function getGroupOptionIDForCard(card: Card, groupByProperty?: IPropertyTemplate): string {
    if (!groupByProperty) {
        return ''
    }

    const propertyValue = card.fields.properties[groupByProperty.id]
    if (groupByProperty.type === 'createdBy') {
        return card.createdBy || ''
    }

    if (groupByProperty.type === 'updatedBy') {
        return card.modifiedBy || ''
    }

    if (groupByProperty.type === 'person') {
        return typeof propertyValue === 'string' ? propertyValue : ''
    }

    if (groupByProperty.type === 'multiPerson' || groupByProperty.type === 'multiSelect') {
        let valueIDs: string[] = []
        if (Array.isArray(propertyValue)) {
            valueIDs = propertyValue.filter((id): id is string => typeof id === 'string' && id !== '')
        } else if (typeof propertyValue === 'string' && propertyValue !== '') {
            valueIDs = propertyValue.split(',').map((id) => id.trim()).filter((id) => id !== '')
        }
        return valueIDs.sort().join(',')
    }

    if (groupByProperty.type === 'card') {
        const linkedBoardId = groupByProperty.options?.[0]?.id || ''
        const linkedCards = parseAllCardPropertyValues(typeof propertyValue === 'string' ? propertyValue : undefined)
        const sortedCards = [...linkedCards].sort((a, b) => a.cardId.localeCompare(b.cardId))
        return JSON.stringify({
            boardId: linkedBoardId,
            cards: sortedCards.map((c) => ({id: c.cardId, title: c.cardTitle})),
        })
    }

    if (typeof propertyValue === 'string') {
        return propertyValue
    }

    return ''
}

function groupCardsByOptions(cards: Card[], optionIds: string[], groupByProperty?: IPropertyTemplate): BoardGroup[] {
    const groups = []
    for (const optionId of optionIds) {
        if (optionId) {
            const option = groupByProperty?.options.find((o) => o.id === optionId)
            if (option) {
                const c = cards.filter((o) => optionId === o.fields?.properties[groupByProperty!.id])
                const group: BoardGroup = {
                    option,
                    cards: c,
                }
                groups.push(group)
            } else {
                // if optionId not found, its an old (deleted) option that can be ignored
            }
        } else {
            // Empty group
            const emptyGroupCards = cards.filter((card) => {
                const groupByOptionId = card.fields.properties[groupByProperty?.id || '']
                return !groupByOptionId || !groupByProperty?.options.find((option) => option.id === groupByOptionId)
            })
            const group: BoardGroup = {
                option: {id: '', value: `No ${groupByProperty?.name}`, color: ''},
                cards: emptyGroupCards,
            }
            groups.push(group)
        }
    }
    return groups
}

function getOptionGroups(cards: Card[], visibleOptionIds: string[], hiddenOptionIds: string[], groupByProperty?: IPropertyTemplate): {visible: BoardGroup[], hidden: BoardGroup[]} {
    let unassignedOptionIds: string[] = []
    if (groupByProperty) {
        unassignedOptionIds = groupByProperty.options.
            filter((o: IPropertyOption) => !visibleOptionIds.includes(o.id) && !hiddenOptionIds.includes(o.id)).
            map((o: IPropertyOption) => o.id)
    }
    const allVisibleOptionIds = [...visibleOptionIds, ...unassignedOptionIds]

    // If the empty group positon is not explicitly specified, make it the first visible column
    if (!allVisibleOptionIds.includes('') && !hiddenOptionIds.includes('')) {
        allVisibleOptionIds.unshift('')
    }

    const visibleGroups = groupCardsByOptions(cards, allVisibleOptionIds, groupByProperty)
    const hiddenGroups = groupCardsByOptions(cards, hiddenOptionIds, groupByProperty)
    return {visible: visibleGroups, hidden: hiddenGroups}
}
export function getVisibleAndHiddenGroups(cards: Card[], visibleOptionIds: string[], hiddenOptionIds: string[], groupByProperty?: IPropertyTemplate): {visible: BoardGroup[], hidden: BoardGroup[]} {
    if (groupByProperty?.type === 'createdBy' || groupByProperty?.type === 'updatedBy' || groupByProperty?.type === 'person') {
        return getPersonGroups(cards, groupByProperty, hiddenOptionIds, visibleOptionIds)
    }

    if (groupByProperty?.type === 'multiPerson') {
        return getMultiPersonGroups(cards, groupByProperty, hiddenOptionIds, visibleOptionIds)
    }

    if (groupByProperty?.type === 'card') {
        return getCardGroups(cards, groupByProperty, hiddenOptionIds, visibleOptionIds)
    }

    if (groupByProperty?.type === 'multiSelect') {
        return getMultiSelectGroups(cards, groupByProperty, hiddenOptionIds, visibleOptionIds)
    }

    return getOptionGroups(cards, visibleOptionIds, hiddenOptionIds, groupByProperty)
}

function orderGroupKeys(groupOrder: string[], visibleOptionIds: string[], hiddenOptionIds: string[]): {visible: string[], hidden: string[]} {
    const hiddenSet = new Set(hiddenOptionIds)
    const groupSet = new Set(groupOrder)
    const visibleOrdered = visibleOptionIds.filter((id) => groupSet.has(id) && !hiddenSet.has(id))
    const visibleSet = new Set(visibleOrdered)
    const visible: string[] = [...visibleOrdered]
    const hidden: string[] = hiddenOptionIds.filter((id) => groupSet.has(id))

    groupOrder.forEach((id) => {
        if (!hiddenSet.has(id) && !visibleSet.has(id)) {
            visible.push(id)
        }
    })

    return {visible, hidden}
}

function getPersonGroups(cards: Card[], groupByProperty: IPropertyTemplate, hiddenOptionIds: string[], visibleOptionIds: string[]): {visible: BoardGroup[], hidden: BoardGroup[]} {
    const groups: {[key: string]: Card[]} = {}
    const order: string[] = []

    cards.forEach((item) => {
        const key = getGroupOptionIDForCard(item, groupByProperty)

        if (!groups[key]) {
            groups[key] = []
            order.push(key)
        }
        groups[key].push(item)
    })

    const hiddenGroups: BoardGroup[] = []
    const visibleGroups: BoardGroup[] = []
    const orderedKeys = orderGroupKeys(order, visibleOptionIds, hiddenOptionIds)
    orderedKeys.visible.forEach((key) => {
        const value = groups[key]
        const propertyOption = {id: key, value: key, color: ''} as IPropertyOption
        visibleGroups.push({option: propertyOption, cards: value})
    })
    orderedKeys.hidden.forEach((key) => {
        const value = groups[key]
        const propertyOption = {id: key, value: key, color: ''} as IPropertyOption
        hiddenGroups.push({option: propertyOption, cards: value})
    })

    return {visible: visibleGroups, hidden: hiddenGroups}
}

// MultiPerson 프로퍼티로 그룹화 (선택된 모든 사람이 동일한 경우 같은 그룹)
function getMultiPersonGroups(cards: Card[], groupByProperty: IPropertyTemplate, hiddenOptionIds: string[], visibleOptionIds: string[]): {visible: BoardGroup[], hidden: BoardGroup[]} {
    const groups: {[key: string]: {cards: Card[], personIds: string[]}} = {}
    const order: string[] = []

    cards.forEach((card) => {
        const key = getGroupOptionIDForCard(card, groupByProperty)
        const personIds = key === '' ? [] : key.split(',').filter((id) => id)

        if (!groups[key]) {
            groups[key] = {cards: [], personIds}
            order.push(key)
        }
        groups[key].cards.push(card)
    })

    const hiddenGroups: BoardGroup[] = []
    const visibleGroups: BoardGroup[] = []

    const orderedKeys = orderGroupKeys(order, visibleOptionIds, hiddenOptionIds)
    orderedKeys.visible.forEach((key) => {
        const {cards: groupCards, personIds} = groups[key]
        // 표시 값은 personIds를 쉼표로 구분 (빈 경우 "No {프로퍼티명}")
        const displayValue = personIds.length > 0 ? personIds.join(', ') : `No ${groupByProperty.name}`
        const propertyOption = {id: key, value: displayValue, color: ''} as IPropertyOption
        visibleGroups.push({option: propertyOption, cards: groupCards})
    })
    orderedKeys.hidden.forEach((key) => {
        const {cards: groupCards, personIds} = groups[key]
        const displayValue = personIds.length > 0 ? personIds.join(', ') : `No ${groupByProperty.name}`
        const propertyOption = {id: key, value: displayValue, color: ''} as IPropertyOption
        hiddenGroups.push({option: propertyOption, cards: groupCards})
    })

    return {visible: visibleGroups, hidden: hiddenGroups}
}

// MultiSelect 프로퍼티로 그룹화 (선택된 모든 옵션이 동일한 경우 같은 그룹)
function getMultiSelectGroups(cards: Card[], groupByProperty: IPropertyTemplate, hiddenOptionIds: string[], visibleOptionIds: string[]): {visible: BoardGroup[], hidden: BoardGroup[]} {
    const groups: {[key: string]: {cards: Card[], optionIds: string[]}} = {}
    const order: string[] = []

    cards.forEach((card) => {
        const key = getGroupOptionIDForCard(card, groupByProperty)
        const optionIds = key === '' ? [] : key.split(',').filter((id) => id)

        if (!groups[key]) {
            groups[key] = {cards: [], optionIds}
            order.push(key)
        }
        groups[key].cards.push(card)
    })

    const hiddenGroups: BoardGroup[] = []
    const visibleGroups: BoardGroup[] = []

    const orderedKeys = orderGroupKeys(order, visibleOptionIds, hiddenOptionIds)
    orderedKeys.visible.forEach((key) => {
        const {cards: groupCards, optionIds} = groups[key]
        // 옵션 ID를 옵션 이름으로 변환
        const optionNames = optionIds.map((optionId) => {
            const option = groupByProperty.options.find((o) => o.id === optionId)
            return option?.value || optionId
        })
        const displayValue = optionNames.length > 0 ? optionNames.join(', ') : `No ${groupByProperty.name}`

        // 첫 번째 옵션의 색상 사용 (여러 옵션인 경우)
        const firstOption = optionIds.length > 0 ? groupByProperty.options.find((o) => o.id === optionIds[0]) : undefined
        const color = firstOption?.color || ''

        const propertyOption = {id: key, value: displayValue, color} as IPropertyOption
        visibleGroups.push({option: propertyOption, cards: groupCards})
    })
    orderedKeys.hidden.forEach((key) => {
        const {cards: groupCards, optionIds} = groups[key]
        const optionNames = optionIds.map((optionId) => {
            const option = groupByProperty.options.find((o) => o.id === optionId)
            return option?.value || optionId
        })
        const displayValue = optionNames.length > 0 ? optionNames.join(', ') : `No ${groupByProperty.name}`
        const firstOption = optionIds.length > 0 ? groupByProperty.options.find((o) => o.id === optionIds[0]) : undefined
        const color = firstOption?.color || ''
        const propertyOption = {id: key, value: displayValue, color} as IPropertyOption
        hiddenGroups.push({option: propertyOption, cards: groupCards})
    })

    return {visible: visibleGroups, hidden: hiddenGroups}
}

// Card 프로퍼티 값에서 모든 연결된 카드 정보를 추출
// JSON 형식: {"boardId":"...","cards":[{"id":"...","title":"..."}]}
// 이전 형식 호환: "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..." 또는 "boardId:cardId:cardTitle"
function parseAllCardPropertyValues(propertyValue: string | undefined): {cardId: string, cardTitle: string}[] {
    if (!propertyValue || typeof propertyValue !== 'string') {
        return []
    }

    // JSON 형식 (새 형식)
    if (propertyValue.startsWith('{')) {
        try {
            const parsed = JSON.parse(propertyValue)
            const cards = parsed.cards || []
            return cards.map((c: {id: string, title: string}) => ({
                cardId: c.id,
                cardTitle: c.title || 'Untitled',
            })).filter((c: {cardId: string}) => c.cardId)
        } catch {
            return []
        }
    }

    // 이전 형식 호환: "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..."
    if (propertyValue.includes('|')) {
        const [, cardsStr] = propertyValue.split('|')
        if (!cardsStr) {
            return []
        }
        return cardsStr.split(',').map((cardStr) => {
            const colonIndex = cardStr.indexOf(':')
            if (colonIndex === -1) {
                return {cardId: cardStr, cardTitle: 'Untitled'}
            }
            return {
                cardId: cardStr.substring(0, colonIndex),
                cardTitle: cardStr.substring(colonIndex + 1) || 'Untitled',
            }
        }).filter((c) => c.cardId)
    }

    // 이전 형식 호환: "boardId:cardId:cardTitle"
    const parts = propertyValue.split(':')
    if (parts.length >= 3) {
        return [{
            cardId: parts[1],
            cardTitle: parts.slice(2).join(':') || 'Untitled',
        }]
    }

    return []
}

// Card 프로퍼티로 그룹화 (연결된 모든 카드가 동일한 경우 같은 그룹)
function getCardGroups(cards: Card[], groupByProperty: IPropertyTemplate, hiddenOptionIds: string[], visibleOptionIds: string[]): {visible: BoardGroup[], hidden: BoardGroup[]} {
    const groups: {[key: string]: {cards: Card[], linkedCards: {cardId: string, cardTitle: string}[]}} = {}
    const order: string[] = []

    cards.forEach((card) => {
        const key = getGroupOptionIDForCard(card, groupByProperty)
        const propertyValue = card.fields.properties[groupByProperty.id] as string
        const linkedCards = parseAllCardPropertyValues(propertyValue)

        if (!groups[key]) {
            groups[key] = {cards: [], linkedCards}
            order.push(key)
        }
        groups[key].cards.push(card)
    })

    const hiddenGroups: BoardGroup[] = []
    const visibleGroups: BoardGroup[] = []

    const orderedKeys = orderGroupKeys(order, visibleOptionIds, hiddenOptionIds)
    orderedKeys.visible.forEach((key) => {
        const {cards: groupCards, linkedCards} = groups[key]
        // 표시 값은 연결된 카드 타이틀들 (없으면 "No {프로퍼티명}")
        const displayValue = linkedCards.length > 0
            ? linkedCards.map((c) => c.cardTitle).join(', ')
            : `No ${groupByProperty.name}`
        const propertyOption = {id: key, value: displayValue, color: ''} as IPropertyOption
        visibleGroups.push({option: propertyOption, cards: groupCards})
    })
    orderedKeys.hidden.forEach((key) => {
        const {cards: groupCards, linkedCards} = groups[key]
        const displayValue = linkedCards.length > 0
            ? linkedCards.map((c) => c.cardTitle).join(', ')
            : `No ${groupByProperty.name}`
        const propertyOption = {id: key, value: displayValue, color: ''} as IPropertyOption
        hiddenGroups.push({option: propertyOption, cards: groupCards})
    })

    return {visible: visibleGroups, hidden: hiddenGroups}
}
