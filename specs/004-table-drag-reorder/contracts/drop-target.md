# Contract: 드롭 판정 모듈

**Date**: 2026-08-05 | **Plan**: [../plan.md](../plan.md)

이 기능은 외부에 새 HTTP API를 내지 않는다. 대신 **모듈 사이의 계약**이 이 기능의 정확성을 좌우한다. 특히 판정 모듈은 규격의 대부분을 혼자 지므로 계약을 여기 못 박는다.

## 1. `tableDropTarget` — 순수 판정

```ts
computeDropIntent(input: DropTargetInput): DropIntent | null
```

React·Redux·DOM에 의존하지 않는다. 같은 입력이면 언제나 같은 출력이다.

### 입력

| 필드 | 뜻 | 제약 |
|---|---|---|
| `rows` | 화면에 보이는 행 메트릭 배열 | **보이는 순서대로.** 접힌 그룹의 행은 들어오지 않는다 |
| `cursor` | `{x, y}` — `.Table` 콘텐츠 좌표 | |
| `item` | 끌고 있는 것 (`cardId`, `subtreeIds`, `subtreeHeight`, `sourceParentId`, `sourceDepth`) | |
| `titleCellLeft` | 제목 셀이 시작하는 x | 깊이 후보의 기준점 |
| `indentStepPx` | 깊이 **한 단계**의 px | 22. `Constants.tableSubCardIndentPx` |
| `maxDepth` | 최대 깊이 | 5 |

**이름 주의**: 입력 `indentStepPx`(단계 크기)와 출력 `indentOffsetPx`(선의 시작 x)는 다른 값이다. 초안에서 둘 다 `indentPx`로 쓰다가 `indentPx는 깊이 × indentPx`라는 자기참조 문장이 나왔다. 이름을 갈라 둔다.

### 출력

`DropIntent` 또는 `null`. `null`은 **"여기엔 놓을 수 없다"** 하나만 뜻한다. 호출자는 `null`을 받으면 선을 지우고 `no-drop` 커서를 준다.

### 판정 순서

1. **경계 고르기** — `cursor.y`가 어느 행의 어느 절반에 있는지로 `boundaryIndex`를 정한다. 행의 위쪽 절반이면 그 행 앞, 아래쪽 절반이면 그 행 뒤. (FR-006)
2. **금지 경계 걸러내기** — 경계의 위/아래 행이 `item.subtreeIds`에 속하면 `null`. 자기 자신·자기 자손 사이에는 놓을 수 없다. (FR-013)
3. **깊이 후보** — `floor((cursor.x − titleCellLeft) / indentStepPx)`. (FR-010)
4. **클램프** — 아래 범위로 자른다. (FR-011, FR-012)
   - 상한 = `min(경계 바로 위 행의 depth + 1, maxDepth − item.subtreeHeight)`
   - 하한 = `경계 바로 아래 행의 depth`
   - 경계가 목록 맨 위면 상한·하한 모두 0. 맨 아래면 하한 0.
   - **상한 < 하한이면 `null`** — 그 경계엔 어떤 깊이로도 놓을 수 없다.
5. **부모 찾기** — 클램프된 깊이에서 위로 거슬러 올라가 `depth === 목표 − 1`인 가장 가까운 행이 새 부모다. 목표가 0이면 `''`.
6. **좌표** — `anchorTop`은 경계의 y, `indentOffsetPx = depth × indentStepPx`.

### 이 계약이 지키는 것

- 출력이 `null`이 아니면 그 배치는 **화면 기준으로 항상 유효하다.** 호출자는 추가 검증 없이 그대로 적용해도 된다.
- 반대로 서버는 여전히 최종 판정자다. 동시 편집으로 입력이 낡으면 서버가 거부할 수 있고, 그건 정상 경로다(FR-029).

### 반드시 테스트할 것

| 케이스 | 기대 |
|---|---|
| 첫 행 위쪽 절반 | `boundaryIndex = 0`, 깊이 0 |
| 마지막 행 아래쪽 절반 | 마지막 경계, 하한 0 |
| 커서 x를 오른쪽으로 밀기 | 깊이가 상한까지 오르고 더는 안 오른다 |
| 커서 x를 왼쪽으로 당기기 | 깊이가 하한까지 내리고 더는 안 내린다 |
| 자기 자신 앞/뒤 경계 | `null` |
| 자손 사이 경계 | `null` |
| 서브트리 높이 2, 위 행 depth 3 | 상한이 `5 − 2 = 3`으로 잘린다 |
| 아래 행 depth 4, 서브트리 높이 2 | 상한 3 < 하한 4 → `null` |
| `rows`가 비어 있음 | `null` |

## 2. `TableDragContext` — 표 단위 상태

```ts
registerRow(metric: RowMetric): void      // 마운트 시. 접힌 행은 호출하지 않는다
unregisterRow(cardId: string): void       // 언마운트 시
reportCursor(point: {x, y}): void         // hover마다. ref에 적기만 하고 rAF에서 판정
readonly intent: DropIntent | null        // 인디케이터가 읽는다
readonly draggingSubtree: Set<string>     // 반투명 처리할 카드들 (FR-019)
```

**계약 — 접힌 행은 등록하지 않는다 (지키지 않으면 좌표가 무너진다).** 접힌 그룹의 행은 언마운트되지 않고 `.hidden` 클래스로 `display: none`이 된다(`tableRow.tsx:119-121` → `table.scss:240-242`). `display: none` 요소의 `getBoundingClientRect()`는 **전부 0**이므로, 그대로 등록하면 경계 계산이 좌표 0 근처로 무너진다. 증상은 "가끔 선이 엉뚱한 데 뜬다"로 나타나 원인 추적이 오래 걸린다.

행은 등록 전에 자신이 보이는지 확인한다. 이 한 가지가 FR-024(접힌 그룹 안으로는 놓을 수 없다)를 **별도 분기 없이** 만족시킨다 — 보이는 행만 넘기면 접힌 그룹에는 경계 자체가 생기지 않는다.

**계약**: `reportCursor`는 리렌더를 유발하지 않는다. 판정과 상태 갱신은 `requestAnimationFrame` 안에서 프레임당 한 번만 일어난다 (research R5).

**계약**: 드래그가 끝나면 `intent`는 반드시 `null`, `draggingSubtree`는 반드시 빈 집합으로 돌아간다. 드롭 성공·실패·취소 모두 마찬가지다.

## 3. `applyTableDrop` — 적용

```ts
applyTableDrop(params: {
    intent: DropIntent
    item: DragItem
    board: Board
    activeView: BoardView
    allCards: Card[]      // 보드 전체 (최상위만이 아니다 — design.md B1)
    groupByProperty?: IPropertyTemplate
}): Promise<void>
```

**계약 — 되돌리기**: 전체를 `mutator.performAsUndoGroup` **한 번**으로 감싼다. 안에서 `linkCardAsSubCard` 등을 호출할 때 다시 감싸지 않는다. 그 호출들은 열려 있는 그룹에 스스로 참여한다 (research R1).

**계약 — 실패 알림**: `try/catch`를 `performAsUndoGroup`에 넘기는 **콜백 안쪽**에 둔다. 바깥에 두면 도달하지 않는다 — `performAsUndoGroup`이 예외를 삼키기 때문이다 (research R2).

**계약 — 생략**: `intent.parentCardId === item.sourceParentId`이면 계층 API를 호출하지 않는다. 순서만 바뀐 이동에 불필요한 왕복과 되돌리기 항목을 만들지 않는다.

### 반드시 테스트할 것

| 케이스 | 기대 |
|---|---|
| 같은 부모 안에서 순서만 이동 | `link`/`unlink` 미호출, `changeViewCardOrder`만 호출 |
| 최상위 → 하위 | `linkCardAsSubCard(cardId, 새 부모)` 호출 |
| 하위 → 최상위 | `unlinkSubCard(cardId, 원래 부모)` 호출 |
| 다른 그룹의 하위로 | 끄는 카드에만 `changePropertyValue`. 자손에는 미호출 |
| 서브트리 이동 | `cardOrder`에서 서브트리가 연속 구간으로 목표 경계에 들어간다 |
| **다중 선택 + 순서 이동** | `selectedCardIds`의 카드가 **각자의 서브트리와 함께** 전부 이동한다 (FR-031) |
| **다중 선택 + 계층 이동** | 끄는 카드의 서브트리만 이동한다. 나머지 선택은 무시된다 (명세 범위 밖) |
| 모든 케이스 | `performAsUndoGroup` 호출 1회 |
| 서버 거부 | `sendFlashMessage`가 `severity: 'high'`로 호출된다 |

## 4. 소비하는 기존 서버 API (변경 없음)

| 엔드포인트 | 언제 | 서버가 검증하는 것 |
|---|---|---|
| `POST /cards/{cardID}/link` | 하위로 넣을 때 | 순환 참조, 깊이 초과(`newDepth + maxSubDepth > 5`), 같은 보드, 권한 |
| `DELETE /cards/{cardID}/link` | 최상위로 뺄 때 | 권한 |
| 블록 패치 (그룹 속성값, `cardOrder`) | 순서·그룹 변경 | 권한 |

이 엔드포인트들의 요청·응답 형식은 바뀌지 않는다. **서버 코드는 이번 기능에서 한 줄도 고치지 않는다.**
