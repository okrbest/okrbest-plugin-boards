// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


export interface BoardSiteStatistics {
    board_count: number
    card_count: number
}

export interface BlockSuiteMigrationStatus {
    totalCards: number
    migratedCards: number
    cardsWithContentBlocks: number
    cardsWithContentBlocksNotMigrated: number
    legacyContentBlockCount: number
    migrationPercentage: number
    isMigrationComplete: boolean
}

export interface UnmigratedCard {
    card: {
        id: string
        boardId: string
        parentId: string
        title: string
        type: string
        fields: Record<string, unknown>
        createAt: number
        updateAt: number
    }
    contentBlocks: Array<{
        id: string
        boardId: string
        parentId: string
        title: string
        type: string
        fields: Record<string, unknown>
        createAt: number
        updateAt: number
    }>
}

export interface UnmigratedCardsResponse {
    cards: UnmigratedCard[]
    totalCount: number
    hasMore: boolean
}
