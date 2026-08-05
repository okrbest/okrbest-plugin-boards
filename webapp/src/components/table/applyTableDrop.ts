// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Board} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import mutator from '../../mutator'
import {sendFlashMessage} from '../flashMessages'

import {moveInCardOrder} from './cardOrderMove'
import {collectSubtree} from './subtree'
import {DragItem, DropIntent, RowMetric} from './tableDropTarget'

export type ApplyTableDropParams = {
    intent: DropIntent
    item: DragItem
    board: Board
    activeView: BoardView

    // 보드 전체 카드. 최상위만 넘기면 순서 목록에서 하위 카드가 빠진다.
    allCards: readonly Card[]

    // 화면에 그려진 행. intent.boundaryIndex가 이 배열을 가리킨다.
    rows: readonly RowMetric[]

    subCardsByParent: {[parentCardId: string]: Card[]}

    // 서버가 거부했을 때 사용자에게 알리는 문구
    failureMessage: string
}

/**
 * 판정 결과를 실제 변경으로 옮긴다.
 *
 * 전체를 되돌리기 그룹 하나로 감싼다. 안쪽 mutator 호출을 다시 감싸지 않는다 —
 * 되돌리기 그룹은 중첩할 수 없고, 하위 호출은 열려 있는 그룹에 스스로 참여한다.
 * 그래야 Ctrl+Z 한 번에 전부 되돌아온다 (FR-028).
 */
export async function applyTableDrop(params: ApplyTableDropParams): Promise<void> {
    const {intent, item, board, activeView, allCards, rows, subCardsByParent, failureMessage} = params

    // 순서 이동이면 함께 선택돼 있던 카드도 각자의 서브트리와 함께 옮긴다
    // (FR-031). 계층 이동일 때는 끄는 카드의 서브트리만 옮긴다 — 여러 카드를
    // 한 번에 하위로 넣는 것은 명세 범위 밖이다.
    const isReorder = intent.parentCardId === item.sourceParentId
    const movingIds = isReorder ? movingIdsForReorder(item, subCardsByParent) : item.subtreeIds

    const anchor = anchorFor(intent, rows, movingIds)
    if (!anchor) {
        return
    }

    const description = movingIds.length > 1 ? `drag ${movingIds.length} cards` : 'drag card'

    await mutator.performAsUndoGroup(async () => {
        // try/catch는 반드시 이 콜백 안쪽에 둔다. performAsUndoGroup은 예외를
        // 삼키고 다시 던지지 않으므로, 바깥에 두면 catch에 영원히 닿지 않는다.
        try {
            const cardOrder = moveInCardOrder({
                cardOrder: activeView.fields.cardOrder,
                allCardIds: allCards.map((card) => card.id),
                movingIds,
                destCardId: anchor.cardId,
                place: anchor.place,
            })

            await mutator.changeViewCardOrder(
                board.id,
                activeView.id,
                activeView.fields.cardOrder,
                cardOrder,
                description,
            )
        } catch (error) {
            // 서버 거부는 예외가 아니라 정상 경로다. 동시 편집으로 화면의 판정이
            // 낡을 수 있고, 그때 최종 판정자는 서버다 (FR-029).
            sendFlashMessage({content: failureMessage, severity: 'high'})
            throw error
        }
    })
}

/**
 * 순서 이동에서 함께 움직일 카드들. 선택된 카드마다 자기 서브트리를 끌고 온다.
 */
function movingIdsForReorder(item: DragItem, subCardsByParent: {[parentCardId: string]: Card[]}): string[] {
    const seen = new Set<string>()
    const result: string[] = []

    const push = (ids: readonly string[]) => {
        for (const id of ids) {
            if (!seen.has(id)) {
                seen.add(id)
                result.push(id)
            }
        }
    }

    // 끄는 카드의 서브트리는 드래그 시작 시 계산해 둔 값을 그대로 쓴다.
    // 여기서 다시 유도하면 그 사이 스토어가 바뀌었을 때 둘이 어긋난다.
    push(item.subtreeIds)

    for (const selectedId of item.selectedCardIds) {
        // 이미 다른 서브트리에 딸려 들어온 카드는 건너뛴다.
        if (seen.has(selectedId)) {
            continue
        }
        push(collectSubtree(selectedId, subCardsByParent).subtreeIds)
    }

    return result
}

/**
 * 경계를 "어느 카드의 앞/뒤"로 바꾼다. 순서 목록은 그 형태로만 표현된다.
 *
 * 인디케이터가 이미 경계를 알고 있으므로 방향을 추정하지 않는다. 추정하면
 * 화면에 그려진 선과 실제 놓이는 자리가 어긋날 수 있다.
 */
function anchorFor(
    intent: DropIntent,
    rows: readonly RowMetric[],
    movingIds: readonly string[],
): {cardId: string, place: 'before' | 'after'} | null {
    const moving = new Set(movingIds)

    // 경계 바로 아래 행 앞에 놓는다. 그 행이 함께 움직이는 카드면 더 아래를 본다.
    for (let i = intent.boundaryIndex; i < rows.length; i++) {
        if (!moving.has(rows[i].cardId)) {
            return {cardId: rows[i].cardId, place: 'before'}
        }
    }

    // 아래에 남는 행이 없으면 위로 거슬러 올라가 그 행 뒤에 놓는다.
    for (let i = intent.boundaryIndex - 1; i >= 0; i--) {
        if (!moving.has(rows[i].cardId)) {
            return {cardId: rows[i].cardId, place: 'after'}
        }
    }

    return null
}
