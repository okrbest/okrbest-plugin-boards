// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Board} from '../../blocks/board'
import {CategoryBoardMetadata, CategoryBoards} from '../../store/sidebar'

// 서버가 시스템 카테고리를 이 이름으로 만든다.
export const DefaultCategoryName = 'Boards'

/**
 * 어느 카테고리에도 속하지 않은 보드를 기본 카테고리('Boards') 끝에 덧붙인다.
 *
 * 서버는 명시적으로 멤버인 보드만 카테고리에 넣는다. 공개 보드처럼 암묵적으로
 * 볼 수 있는 보드는 스토어의 카테고리 목록에 없고, 이 함수가 만든 목록에만 있다.
 * 사이드바 렌더링과 드래그 앤 드롭은 반드시 이 결과를 같이 써야 인덱스가 맞는다.
 */
export function withRecoveredBoards(category: CategoryBoards, allCategories: CategoryBoards[], boards: Board[]): CategoryBoards {
    if (category.name !== DefaultCategoryName) {
        return category
    }

    const mappedBoardIDs = new Set(allCategories.flatMap((c) => c.boardMetadata.map((m) => m.boardID)))
    const missing: CategoryBoardMetadata[] = boards.
        filter((board) => !mappedBoardIDs.has(board.id)).
        map((board) => ({boardID: board.id, hidden: false}))

    if (missing.length === 0) {
        return category
    }

    return {
        ...category,
        boardMetadata: [...category.boardMetadata, ...missing],
    }
}

/** 카테고리 메타데이터 순서대로, 스토어에 있는 보드만 고른다. */
export function getSortedCategoryBoards(category: CategoryBoards, boards: Board[]): Board[] {
    const boardsByID = new Map(boards.map((board) => [board.id, board]))
    const sorted: Board[] = []
    category.boardMetadata.forEach((metadata) => {
        const board = boardsByID.get(metadata.boardID)
        if (board) {
            sorted.push(board)
        }
    })
    return sorted
}

/** 화면에 실제로 그려지는 보드. 숨긴 보드와 템플릿은 뺀다. 드롭 인덱스는 이 목록 기준이다. */
export function getVisibleCategoryBoards(category: CategoryBoards, boards: Board[]): Board[] {
    const hiddenBoardIDs = new Set(category.boardMetadata.filter((m) => m.hidden).map((m) => m.boardID))
    return getSortedCategoryBoards(category, boards).filter((board) => !hiddenBoardIDs.has(board.id) && !board.isTemplate)
}

// 보이는 보드의 메타데이터를 화면 순서대로 돌려준다. 메타데이터 순서가 곧 화면 순서다.
function getVisibleMetadata(category: CategoryBoards, boards: Board[]): CategoryBoardMetadata[] {
    const visibleBoardIDs = new Set(getVisibleCategoryBoards(category, boards).map((board) => board.id))
    return category.boardMetadata.filter((m) => visibleBoardIDs.has(m.boardID))
}

// 보이는 목록을 새 순서로 두고, 안 보이는 항목(숨김·템플릿·스토어에 없는 보드)은 뒤에 그대로 붙인다.
function rebuildMetadata(category: CategoryBoards, visibleOrder: CategoryBoardMetadata[]): CategoryBoardMetadata[] {
    const visibleBoardIDs = new Set(visibleOrder.map((m) => m.boardID))
    return [...visibleOrder, ...category.boardMetadata.filter((m) => !visibleBoardIDs.has(m.boardID))]
}

/**
 * 보이는 목록 안에서 boardID를 destinationIndex 자리로 옮긴 전체 메타데이터를 만든다.
 * 보드가 이 카테고리에서 보이지 않으면 null.
 */
export function moveVisibleBoard(category: CategoryBoards, boards: Board[], boardID: string, destinationIndex: number): CategoryBoardMetadata[] | null {
    const visible = getVisibleMetadata(category, boards)
    const fromIndex = visible.findIndex((m) => m.boardID === boardID)
    if (fromIndex < 0) {
        return null
    }

    const [moved] = visible.splice(fromIndex, 1)
    visible.splice(destinationIndex, 0, moved)
    return rebuildMetadata(category, visible)
}

/** 다른 카테고리에서 온 보드를 보이는 목록의 destinationIndex 자리에 끼운 전체 메타데이터를 만든다. */
export function insertVisibleBoard(category: CategoryBoards, boards: Board[], metadata: CategoryBoardMetadata, destinationIndex: number): CategoryBoardMetadata[] {
    const visible = getVisibleMetadata(category, boards).filter((m) => m.boardID !== metadata.boardID)
    visible.splice(destinationIndex, 0, metadata)
    return rebuildMetadata(category, visible)
}
