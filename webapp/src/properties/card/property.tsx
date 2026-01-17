// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl'

// import {IPropertyTemplate} from '../../blocks/board' // 미사용
// import {Card} from '../../blocks/card' // 미사용
import {PropertyType, PropertyTypeEnum, FilterValueType} from '../types'

import CardPropertyEditor from './card'

export default class CardProperty extends PropertyType {
    Editor = CardPropertyEditor
    name = 'Card'
    type = 'card' as PropertyTypeEnum
    canGroup = true
    canFilter = true
    filterValueType = 'card' as FilterValueType

    displayName = (intl: IntlShape) => intl.formatMessage({id: 'PropertyType.Card', defaultMessage: 'Card'})

    displayValue = (propertyValue: string | string[] | undefined) => {
        if (propertyValue && typeof propertyValue === 'string') {
            // JSON 형식 (새 형식)
            if (propertyValue.startsWith('{')) {
                try {
                    const parsed = JSON.parse(propertyValue)
                    const cards = parsed.cards || []
                    if (cards.length === 0) {
                        return ''
                    }
                    return cards.map((c: {id: string, title: string}) => c.title || 'Untitled').join(', ')
                } catch {
                    return ''
                }
            }
            // 이전 형식 호환: "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..."
            if (propertyValue.includes('|')) {
                const [, cardsStr] = propertyValue.split('|')
                if (!cardsStr) {
                    return ''
                }
                const titles = cardsStr.split(',').map((cardStr) => {
                    const colonIndex = cardStr.indexOf(':')
                    if (colonIndex === -1) {
                        return 'Untitled'
                    }
                    return cardStr.substring(colonIndex + 1) || 'Untitled'
                })
                return titles.join(', ')
            }
            // 이전 형식 호환: "boardId:cardId:cardTitle"
            const parts = propertyValue.split(':')
            if (parts.length >= 3) {
                return parts.slice(2).join(':')
            }
            return ''
        }
        return ''
    }
}

