# Phase 1 Data Model: 표 보기 카드 추가 진입점

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

**신규 엔티티가 없다.** 저장 형식도, API도, 마이그레이션도 바뀌지 않는다. 이 기능은 기존 엔티티를 **읽어** 진입점을 보일지 말지 정하고, 기존 생성 경로를 부른다.

이 문서는 그 판단에 쓰이는 기존 필드와 화면 상태를 적는다.

---

## 1. 읽는 기존 엔티티

### 1.1 Card

| 필드 | 출처 | 이 기능에서의 용도 |
|---|---|---|
| `id` | `blocks/card.ts` | 하위 카드 생성 시 부모 지정, 포커스 대상 지정 |
| `boardId` | 같음 | 하위 카드 생성 시 보드 지정 |
| `fields.depth` | 같음 | 깊이 한도 판정. 없으면 0으로 본다 |
| `fields.properties` | 같음 | 그룹 추가 줄이 만든 카드에 그룹 속성값이 들어가는지 확인하는 대상. 채우는 일은 기존 `addCard`가 한다 |

`fields.depth`는 상위로부터의 깊이다. 최상위 카드는 0 또는 없음.

### 1.2 BoardTreeGroup (그룹)

`tableGroup.tsx`가 받는 그룹 단위.

| 필드 | 이 기능에서의 용도 |
|---|---|
| `option.id` | 추가 줄 클릭 시 `addCard(groupByOptionId)`에 넘길 값 |
| `cards` | 길이가 0이어도 추가 줄을 그린다는 판단의 대상 (R1) |

### 1.3 BoardView

| 필드 | 용도 |
|---|---|
| `fields.groupById` | 그룹 보기 여부. 기존 푸터의 표시 조건이며 이 기능이 바꾸지 않는다 |
| `fields.collapsedOptionIds` | 접힌 그룹 판정 — 접혀 있으면 추가 줄을 그리지 않는다 |

---

## 2. 화면 상태

새 Redux 슬라이스를 만들지 않는다. 기존 상태 두 가지를 쓴다.

### 2.1 `cardIdToFocusOnRender` (centerPanel 로컬 state)

방금 만든 카드의 제목에 커서를 두기 위한 값. `addCard`가 이미 설정하고 300ms 뒤 비운다.

**이 기능이 바꾸는 것**: 지금 `TableRowExpandable`까지만 내려간다. 하위 카드 제목에 커서를 두려면 `TableSubCardRows`를 거쳐 하위 `TableRowExpandable`까지 전달해야 한다 (R4).

### 2.2 `expanded` (TableRowExpandable 로컬 state)

카드가 펼쳐졌는지. 초기값은 `hasSubCards`.

**상태 전이**

```
하위 0개  ──(하위가 1개가 됨)──▶  펼침
펼침      ──(하위가 0개가 됨)──▶  접힘        ← 기존 useEffect가 이미 한다
펼침/접힘 ──(사용자가 화살표 클릭)──▶  반전    ← 기존
```

첫 번째 전이가 이 기능이 더하는 것이다. ⋯ 메뉴로 하위 카드를 만들었을 때 부모가 저절로 펼쳐져 새 하위 카드가 보이게 한다(FR-010). 위에서 신호를 내려보내지 않고 하위 개수 변화만 보고 판단한다.

### 2.3 하위 카드 목록 (`store/cards.ts`)

기존 `subCardsByParent` 상태와 `addSubCard` 리듀서를 그대로 쓴다.

**화면 갱신의 실제 경로는 웹소켓 에코다.** `useSubCardInfo`가 읽는 `getCurrentBoardSubCardsByParent`는 `state.cards.cards`에서 파생하며 리듀서가 쓰는 `subCardsByParent` 필드를 보지 않는다. 서버가 되돌려주는 `UPDATE_BLOCK`이 `updateCards`로 들어와야 행이 그려진다 — 카드 생성(`addCard`)도 똑같이 에코에 의존한다. 리듀서 호출은 스토어 필드를 정합하게 유지할 뿐이다.

---

## 3. 신규 문자열

`webapp/i18n/en.json`·`ko.json`에 동시 추가한다 (constitution 원칙 V).

| 키 | en | ko | 쓰이는 곳 |
|---|---|---|---|
| `TableComponent.plus-new-card` | `+ New card` | `+ 새 카드` | 그룹 목록 끝 추가 줄 |
| `TableComponent.plus-new-subcard` | `+ New sub-card` | `+ 새 하위 카드` | 하위 목록 끝 추가 줄 |
| `CardActionsMenu.addSubCard` | `Add sub-card` | `하위 카드 추가` | ⋯ 메뉴 항목 |

기존 `TableComponent.plus-new`(`+ New`)는 그룹 없는 보기 푸터가 계속 쓴다. 키를 나눈 이유는 그룹 보기에서 카드 추가 줄과 하위 카드 추가 줄이 한 화면에 같이 나오기 때문이다 — 둘 다 `+ New`면 구분이 안 된다.

---

## 4. 진입점 표시 판정

세 진입점의 표시 조건을 한자리에 모은다. 구현은 이 표를 그대로 옮기면 된다.

| 진입점 | 표시 조건 |
|---|---|
| 그룹 추가 줄 | 그룹 보기 · 그룹이 접혀 있지 않음 · 읽기 전용 아님 · `ManageBoardCards` 있음 |
| 하위 추가 줄 | 하위 카드 ≥ 1 · 펼침 · 부모 깊이 < 한도 · 읽기 전용 아님 · `ManageBoardCards` 있음 |
| ⋯ 메뉴 항목 | 하위 카드 = 0 · 카드 깊이 < 한도 · 읽기 전용 아님 · `ManageBoardCards` 있음 |

권한·읽기 전용은 세 진입점에 공통이다. 앞의 세 조건만 자리마다 다르다.

---

## 5. 관계

```
BoardView ──(groupById)──▶ 그룹 보기 여부
    │
    └─(collapsedOptionIds)──▶ 그룹 접힘 여부

Group ──(option.id)──▶ addCard(groupByOptionId) ──▶ 새 카드 (그룹 속성값 채워짐)

Card ──(id, boardId)──▶ mutator.createSubCard ──▶ 새 하위 카드
  │                                                    │
  └─(fields.depth)──▶ 깊이 한도 판정                    └─▶ store addSubCard
                                                              │
                                                     useSubCardInfo ──▶ 하위 행 렌더
```

기능 002(속성 기준 카드 접근 권한)와의 관계: 카드 **생성**은 규칙을 적용하지 않고 보드 권한만 본다(002 FR-032). 다만 규칙이 걸린 보드에서 만든 카드가 만든 사람의 목록에 나타나지 않을 수 있다 — 002의 정의된 동작이며 이 기능이 처리하지 않는다.
