// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useMemo} from 'react'

import {Card} from '../blocks/card'
import {useAppSelector} from '../store/hooks'
import {getCurrentBoardSubCardsByParent} from '../store/cards'

type SubCardInfo = {
    count: number
    subCards: Card[]
    hasSubCards: boolean
}

const useSubCardInfo = (parentCardId: string): SubCardInfo => {
    const subCardsByParent = useAppSelector(getCurrentBoardSubCardsByParent)

    return useMemo(() => {
        const subCards = subCardsByParent[parentCardId] || []
        return {
            count: subCards.length,
            subCards,
            hasSubCards: subCards.length > 0,
        }
    }, [subCardsByParent, parentCardId])
}

export default useSubCardInfo
