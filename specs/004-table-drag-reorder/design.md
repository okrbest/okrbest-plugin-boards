# 설계 노트: 표 보기 드래그 재정렬·중첩

**작성일**: 2026-08-05
**상태**: 승인됨 (brainstorming 완료, `/speckit-specify`로 인계)

브레인스토밍에서 확정한 결정과 근거를 남긴다. spec.md는 이 문서에서 "무엇을"만
뽑아 쓰고, "왜 그렇게 정했는가"는 여기 남는다.

## 문제

표 보기에서 카드 순서를 바꾸거나 계층을 정리하는 일이 사실상 불가능하다.

- **드래그 소스가 행 전체다.** `useSortable('card', card, …)`가 `drop(drag(ref))`로
  행에 통째로 붙어 있다(`webapp/src/components/table/tableRow.tsx:68`). 좌측 ⠿
  아이콘(`:168`)은 장식일 뿐 핸들이 아니다.
- **드롭 위치가 안 보인다.** 삽입 지점 계산은 이미 앞/뒤를 구분하는데
  (`table.tsx:215`) 피드백은 행 전체 배경색뿐이다
  (`.dragover { background-color: rgba(128,192,255,0.4) }`, `styles/main.scss:120`).
  어디에 떨어질지 모른 채 놓는다.
- **계층 이동 수단이 없다.** 상위↔하위 전환은 카드 상세나 메뉴를 거쳐야 한다.
- **핸들이 안 보인다.** `visibility: hidden`이고 행 hover에만 뜨며 대비가 낮다.

계층 이동 API는 이미 완비돼 있다 — `mutator.linkCardAsSubCard` /
`unlinkSubCard`(서버 `POST` / `DELETE /cards/{id}/link`), 되돌리기 포함. **서버
작업 없이 클라이언트 배선 문제다.**

## 결정

### D1. 중첩 제스처 = 가로 위치로 깊이 결정 (노션 방식)

드래그 중 커서 x가 임계를 넘으면 인디케이터가 한 단계 들여쓰기되고, 놓으면 윗
행의 하위로 들어간다. 순서 이동과 계층 이동이 한 제스처로 통합된다.

**대안이었던 것**: 행 세로 3구간(위/가운데/아래), 드래그는 순서만 + 계층은 메뉴.
전자는 배우기 쉽지만 노션과 감각이 다르고, 후자는 요청의 핵심("드래그로 상위↔하위")을
못 채운다.

### D2. 다른 그룹 카드 하위로 넣으면 부모의 그룹 값을 따라간다

현재 `onDropToCard`가 이미 대상 카드의 그룹 값을 덮어쓴다(`table.tsx:131`).
그 동작과 일관되게 간다. 하위 카드를 나중에 최상위로 빼도 부모와 같은 그룹에
남아 자연스럽다.

**단, 자손의 그룹 값은 건드리지 않는다.** 자손은 부모 밑에 렌더되므로 자기 그룹
값이 화면에 드러나지 않는다. 자손까지 쓰면 쓰기가 서브트리 크기만큼 늘고 되돌리기
단위만 비대해진다.

### D3. 핸들은 hover 전용, 대신 크고 진하게 (노션 패리티)

항상 노출하면 행이 많을 때 좌측이 붐빈다. hover 시 크기·대비·클릭 영역을 키우고
`grab` 커서와 호버 배경을 준다.

**대안이었던 것**: 항상 은은하게 노출, ⠿와 `+`를 함께 노출. 후자는 003에서 만든
"추가 줄"과 역할이 겹쳐 정리가 선행돼야 한다.

### D4. 정렬이 걸린 표에서는 수동 정렬 전환을 제안한다

속성 정렬 중에는 순서 이동이 무의미하다(정렬이 즉시 덮어쓴다). 드롭 순간
확인 대화를 띄우고, 승인하면 `changeViewSortOptions(…, [])`로 정렬을 해제한 뒤
이동한다. 거부하면 아무 일도 일어나지 않는다.

**대안이었던 것**: 드래그 비활성(현행), 중첩만 허용. 전자는 막다른 길이고 후자는
인디케이터 로직이 두 갈래로 갈라진다.

### D5. 이동 단위는 카드가 아니라 서브트리

부모를 옮기면 자손 전부가 따라간다. 접혀 있어도 마찬가지다. 이 결정이 나머지에
파급된다:

- `cardOrder`에 서브트리 id를 **깊이우선(부모 → 자손) 연속**으로 배치한다. 기존
  splice 로직(`table.tsx:212-232`)이 `draggedCardIds`를 통째로 옮기는 구조라 그대로
  재사용된다.
- 깊이 상한이 서브트리 높이만큼 줄어든다. 서버가 이미
  `newDepth + maxSubDepth > MaxCardDepth`로 거부한다(`server/app/cards.go:308`).
  클라이언트도 같은 규칙으로 클램프해 **거부당할 인디케이터를 애초에 안 그린다.**
- 자손 깊이 갱신은 서버가 한다(`updateSubCardsDepth`, `cards.go:251`). 클라이언트는
  드래그한 카드 하나만 link/unlink 한다.

### D6. 구현은 `react-dnd` 유지 (라이브러리 교체 안 함)

표 전용 훅을 새로 만들어 드래그 소스를 핸들에만 붙이고, `useDrop`의 `hover`에서
`monitor.getClientOffset()`으로 좌표를 읽는다.

**대안이었던 것**: `@dnd-kit`으로 표만 교체(중첩 정렬 예제·키보드 접근성이 강점),
`@hello-pangea/dnd`(중첩 트리 지원 약함).

dnd-kit으로 가면 저장소의 DnD 스택이 넷으로 갈라지고 칸반과 공유하던 `'card'`
itemType 경로가 끊긴다. 이번 요청은 표 한 곳의 상호작용 개선이다. 라이브러리
교체는 그 자체로 별도 과제이며, 지금 섞으면 이번 변경의 성패가 교체 리스크에 묶인다.

## 현행 코드에서 발견한 결함

설계 과정에서 드러난 것들이다. 규격이 성립하려면 함께 고쳐야 한다.

| # | 결함 | 위치 |
|---|---|---|
| B1 | `cardOrder` 시드를 최상위 카드 목록으로만 채운다. 하위 카드 id가 빠져 splice 위치가 어긋난다 | `table.tsx:213` |
| B2 | 그룹 변경과 순서 변경이 `performAsUndoGroup` 두 개로 갈라져 Ctrl+Z 한 번에 절반만 돌아온다 | `table.tsx:148`, `:234` |
| B3 | 하위 카드가 `cardOrder`를 무시하고 스토어 순서로 렌더돼 하위 레벨 순서 이동이 화면에 안 남는다 | `hooks/useSubCardInfo.ts:20`, `store/cards.ts:266` |

## 구조

계산을 순수 모듈로 빼고, 표 단위 상태는 컨텍스트 하나가 갖는다. 깊이가 **이웃 행**에
의존하므로 행 로컬 상태로는 풀 수 없다.

| 모듈 | 책임 | 의존 |
|---|---|---|
| `tableDropTarget.ts` | 순수 계산. 행 메트릭 + 커서 좌표 + 드래그 서브트리 → `DropIntent \| null` | 없음 (React 무관) |
| `TableDragContext.tsx` | 표 단위 상태. 행 메트릭 등록, hover 좌표 수신, `DropIntent` 보관 | `tableDropTarget` |
| `useTableRowDrag.ts` | 행 하나의 배선. `handleRef`=드래그 소스, `rowRef`=드롭 타깃 | react-dnd, Context |
| `TableDropIndicator.tsx` | `.Table` 기준 절대 위치 선 하나 | Context |
| `applyTableDrop.ts` | `DropIntent` → mutator 호출. 단일 undo 그룹 | mutator |

```ts
type DropIntent = {
    boundaryIndex: number    // 어느 행 사이인가
    depth: number            // 클램프된 목표 깊이
    parentCardId: string     // '' = 최상위
    anchorTop: number        // 인디케이터 y (표 좌표계)
    indentOffsetPx: number   // depth × indentStepPx(22)
}
```

인디케이터를 행마다 그리면 경계에서 깜빡인다. `.Table`이 `position: relative`이므로
절대 위치 오버레이 하나로 그린다. z-index 슬롯을 새로 판다
(`table-drop-indicator`, `table-row-action-cell: 100`보다 위).

### 데이터 흐름

```
핸들 mousedown
  └ useDrag item = {cardId, subtreeIds[], subtreeHeight}
       │
       ├ 행 위 hover → useTableRowDrag가 커서 좌표를 Context로 (rAF throttle)
       │    └ Context → tableDropTarget(rows, cursor, dragged) → DropIntent
       │         └ TableDropIndicator 선 1개 렌더
       │
       └ drop → 정렬 걸렸으면 ConfirmationDialogBox
                  └ 승인 → changeViewSortOptions(…, [])
            → applyTableDrop(intent)  ← performAsUndoGroup 하나
                 ├ 계층: linkCardAsSubCard / unlinkSubCard   (부모가 바뀔 때만)
                 ├ 그룹: changePropertyValue                  (드래그한 카드만)
                 └ 순서: changeViewCardOrder                  (서브트리 깊이우선)
            → 서버가 자손 depth 재귀 갱신 → 웹소켓 → 스토어
```

### 기존 코드 수정

- `tableRow.tsx` — `useSortable` → `useTableRowDrag`. ⠿ `IconButton`에 드래그 ref를
  붙인다. 행 `.dragover` 배경 제거.
- `tableRow.scss` — 핸들 크기·대비·`grab` 커서·호버 배경. 서브트리 반투명.
- `table.tsx` — B1·B2 수정. `TableDragContext`·`TableDropIndicator`로 감싼다.
- `store/cards.ts` — B3 수정.

**칸반은 건드리지 않는다.** `useSortable`을 그대로 두고 표만 새 훅을 쓴다. `'card'`
itemType을 유지하므로 표↔칸반 드래그 경로도 그대로다.

## 검증 규칙

`tableDropTarget`이 "놓을 수 있는가"의 유일한 판정자다. `null`이면 인디케이터를
숨기고 `no-drop` 커서를 준다 — **놓을 수 없는 자리는 놓을 수 있어 보이지 않는다.**

| 규칙 | 판정 |
|---|---|
| 자기 자신·자손 경계 | `null` |
| 깊이 상한 | `min(윗행 depth + 1, 5 − 서브트리 높이)` |
| 깊이 하한 | `아랫행 depth` |
| 상한 < 하한 | `null` (예: 아랫행 depth 4, 서브트리 높이 2 → 상한 3) |
| readonly·권한 없음 | 핸들 자체를 안 그린다 |

**서버가 최종 판정자다.** 클램프는 UX용이고, 동시 편집으로 다른 사용자가 자손을
추가하면 클라이언트 계산이 낡을 수 있다. 서버가 거부하면 `performAsUndoGroup`이
롤백하고 flash message로 알린다. 거부는 예외가 아니라 정상 경로다.

## 테스트 전략과 그 한계

| 대상 | 방식 | 무엇을 지키나 |
|---|---|---|
| `tableDropTarget` | 순수 함수, 케이스 표 | 규격 전부 — 경계 y, 임계 x, 클램프, 자손 금지, 서브트리 높이 |
| `applyTableDrop` | mutator 목 | 계층·그룹·순서가 단일 undo 그룹 안에서 올바른 인자로. 부모 안 바뀌면 link/unlink 미호출 |
| `store/cards` | 셀렉터 | 하위 카드가 `cardOrder` 순서로 나온다 |
| `tableRow` | 렌더 | 드래그 ref가 핸들에만 붙는다, readonly면 핸들 없음 |
| 칸반 스위트 | baseline 대조 | `useSortable` 경로 무회귀 |

**실제 드래그는 자동 테스트하지 않는다.** `react-dnd-test-backend`가 설치돼 있지
않고 기존 표·칸반 테스트도 드래그를 시뮬레이션하지 않는다(`wrapDNDIntl`이
`DndProvider(HTML5Backend)`로 감싸지만 jsdom에서 실제 드래그 이벤트는 못 흘린다).
새 의존성 + 통합 하네스를 들이는 건 이번 범위를 넘는다.

대신 판정 로직을 순수 모듈로 뽑아 전수 테스트하고, 실제 드래그는 배포된 플러그인에서
수동 검증한다. **트레이드오프를 명시해둔다 — 배선 오류는 컴포넌트 테스트가, 규칙
오류는 순수 테스트가 잡지만, 둘을 잇는 실제 HTML5 드래그 이벤트는 수동 검증에
의존한다.**

## 범위 밖

- 칸반·갤러리·캘린더 보기의 드래그
- 키보드로 순서·계층 이동 (접근성 개선은 별도 과제)
- `@dnd-kit` 전환
- 다중 선택 드래그의 계층 이동 — 다중 선택 **순서** 이동은 기존 동작을 유지하되,
  여러 카드를 한 번에 하위로 넣는 건 이번 범위에서 뺀다
