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

    // 그룹이 걸려 있을 때의 속성 id. 없으면 그룹 값을 건드리지 않는다.
    groupByPropertyId?: string

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
    const {intent, item, board, activeView, allCards, rows, subCardsByParent, groupByPropertyId, failureMessage} = params

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
            // 1. 그룹. 하위로 들어가면 새 부모의 값을, 같은 레벨에서 옮기면
            //    놓이는 자리 이웃의 값을 따라간다. 그룹이 걸린 표에서 다른
            //    그룹으로 끌면 그룹 값이 바뀌어야 한다 — 칸반이 그렇게 동작하고
            //    표도 같아야 한다 (FR-022).
            //
            //    계층 변경보다 먼저 한다. link/unlink는 스토어를 바꾸므로 그 뒤에
            //    allCards에서 꺼낸 카드 참조는 낡을 수 있다.
            //
            //    자손은 건드리지 않는다. 부모 밑에 렌더되므로 자기 그룹 값이
            //    화면에 드러나지 않고, 쓰기만 서브트리 크기만큼 늘어난다 (FR-023).
            if (groupByPropertyId) {
                const dragged = allCards.find((c) => c.id === item.cardId)
                const newValue = intent.parentCardId
                    ? allCards.find((c) => c.id === intent.parentCardId)?.fields.properties[groupByPropertyId]
                    : anchor.row.groupValue

                if (dragged && newValue !== undefined &&
                    dragged.fields.properties[groupByPropertyId] !== newValue) {
                    await mutator.changePropertyValue(board.id, dragged, groupByPropertyId, newValue, description)
                }
            }

            // 2. 계층. 부모가 바뀔 때만 건드린다 — 순서만 바뀐 이동에 불필요한
            //    왕복과 되돌리기 항목을 만들지 않는다.
            if (!isReorder) {
                // 이미 하위인 카드는 먼저 떼어낸다. 서버가 depth > 0인 카드의
                // link를 "card is already a sub-card"로 거부하기 때문이다
                // (server/app/cards.go의 LinkCardAsSubCard). 부모를 바꾸는 것은
                // 갈아끼우기가 아니라 떼었다 붙이기다.
                if (item.sourceParentId) {
                    await mutator.unlinkSubCard(item.cardId, item.sourceParentId)
                }
                if (intent.parentCardId) {
                    await mutator.linkCardAsSubCard(item.cardId, intent.parentCardId)
                }
            }

            // 3. 순서.
            const cardOrder = moveInCardOrder({
                cardOrder: activeView.fields.cardOrder,
                allCardIds: allCards.map((card) => card.id),
                movingIds,
                destCardId: anchor.row.cardId,
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
): {row: RowMetric, place: 'before' | 'after'} | null {
    const moving = new Set(movingIds)

    // 경계 바로 아래 행 앞에 놓는다. 함께 움직이는 카드와 "+ 새 하위 카드"
    // 줄은 건너뛴다 — 후자는 경계를 표시할 뿐 순서 목록에 없는 행이다.
    const usable = (row: RowMetric) => !moving.has(row.cardId) && !row.isListEnd

    for (let i = intent.boundaryIndex; i < rows.length; i++) {
        if (usable(rows[i])) {
            return {row: rows[i], place: 'before'}
        }
    }

    // 아래에 남는 행이 없으면 위로 거슬러 올라가 그 행 뒤에 놓는다.
    for (let i = intent.boundaryIndex - 1; i >= 0; i--) {
        if (usable(rows[i])) {
            return {row: rows[i], place: 'after'}
        }
    }

    return null
}
