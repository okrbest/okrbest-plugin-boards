# Contract: 컴포넌트 인터페이스

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

이 기능은 HTTP 표면을 만들지 않는다. 외부로 노출되는 계약은 컴포넌트 인터페이스와 콜백이다.

---

## 1. `TableAddRow` (신규)

`webapp/src/components/table/tableAddRow.tsx`

### Props

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `label` | `string` | ✓ | 표시할 문구. 호출부가 번역해서 넘긴다 |
| `onClick` | `() => void` | ✓ | 눌렀을 때 부를 것 |
| `indented` | `boolean` | | 하위 목록용 들여쓰기. 기본 `false` |

### 계약

| 동작 | 규정 |
|---|---|
| 권한 | `BoardPermissionGate permissions={[Permission.ManageBoardCards]}`로 감싼다. 권한이 없으면 **아무것도 렌더하지 않는다** |
| 스타일 | 기존 `.octo-table-footer` / `.octo-table-cell`을 쓴다. **새 클래스를 정의하지 않는다**. 들여쓰기만 한 클래스 추가 |
| 상태 | 갖지 않는다. 읽기 전용·깊이·하위 개수 판정은 전부 호출부의 몫 |
| 접근성 | 클릭 가능한 요소로 키보드 접근이 된다 |

`TableAddRow`는 "추가 줄을 그린다"만 한다. 무엇을 만들지, 언제 보일지는 호출부가 정한다.

---

## 2. `addSubCard` 콜백 (신규)

`centerPanel.tsx`에서 만들어 표 컴포넌트 계층으로 내려보낸다.

```
addSubCard(parentCard: Card): Promise<void>
```

### 계약

| # | 규정 |
|---|---|
| C-01 | 부모 깊이가 한도 미만일 때만 생성한다. 한도 이상이면 아무 일도 하지 않는다 |
| C-02 | 성공하면 새 하위 카드를 `store/cards.ts`의 `addSubCard` 리듀서로 넣는다. **다만 화면 갱신은 이것이 아니라 웹소켓 에코가 만든다** — 하위 행이 읽는 `getCurrentBoardSubCardsByParent`는 `state.cards.cards`에서 파생하고 리듀서가 쓰는 `subCardsByParent` 필드를 보지 않는다. 카드 생성(`addCard`)도 같은 방식이다 |
| C-03 | 성공하면 새 카드를 포커스 대상(`cardIdToFocusOnRender`)으로 지정한다 |
| C-04 | 실패하면 `sendFlashMessage`로 알린다. 빈 `catch`로 삼키지 않는다 (constitution III) |
| C-05 | 실패해도 표에 빈 행이 남지 않는다 — 낙관적 행을 만들지 않으므로 되돌릴 상태가 없다 |
| C-06 | 처리 중 다시 불려도 두 번째 호출은 무시한다 |
| C-07 | 카드 상세를 열지 않는다 |

### 전달 경로

```
centerPanel ──▶ table ──▶ tableGroup ──▶ tableRows ──▶ tableRowExpandable
                                                          ├─▶ tableRow          (⋯ 메뉴 항목)
                                                          └─▶ tableSubCardRows  (추가 줄)
```

기존 `addCard`와 같은 경로다. 새 문맥(Context)을 만들지 않는다.

---

## 3. `CardActionsMenu` 주입 항목

`CardActionsMenu`는 **수정하지 않는다.** 이미 `children`을 받는다.

`tableRow.tsx`가 아래 조건을 모두 만족할 때만 자식으로 `Menu.Text` 하나를 넣는다.

| 조건 | 값 |
|---|---|
| 하위 카드 개수 | 0 |
| 카드 깊이 | 한도 미만 |
| 읽기 전용 | 아님 |
| 권한 | `ManageBoardCards` |

메뉴 항목 문구는 `CardActionsMenu.addSubCard`.

**다른 보기(보드·갤러리·캘린더)의 `CardActionsMenu`는 이 항목을 받지 않는다.** 표 행에서만 주입하기 때문이다.

---

## 4. 기존 계약 중 바뀌는 것

| 대상 | 변경 |
|---|---|
| `TableSubCardRows` props | `cardIdToFocusOnRender`, `addSubCard`, `parentCard` 추가 |
| `TableRowExpandable` props | `addSubCard` 추가 |
| `TableRow` props | `addSubCard`, `hasSubCards`(이미 있음)로 메뉴 항목 조건 판정 |
| `TableGroup` | props 변경 없음. `TableAddRow` 배치만 추가 |
| `TableRowExpandable`의 `expanded` | 하위 개수가 0 → 1이 되면 펼침으로 전이 |

**바뀌지 않는 것**: `addCard` 시그니처, `CardActionsMenu` props, 그룹 없는 보기 푸터, 그룹 머리글의 `+`.

---

## 5. 계약 테스트 항목

### `TableAddRow`

| # | 검증 |
|---|---|
| T-01 | `label`을 표시한다 |
| T-02 | 클릭하면 `onClick`이 불린다 |
| T-03 | `ManageBoardCards` 권한이 없으면 렌더되지 않는다 |
| T-04 | `indented`가 클래스에 반영된다 |

### 그룹 추가 줄 (US1)

| # | 검증 |
|---|---|
| T-05 | 카드가 있는 그룹의 목록 끝에 추가 줄이 하나 있다 |
| T-06 | 카드가 0개인 그룹에도 추가 줄이 있다 |
| T-07 | 접힌 그룹에는 추가 줄이 없다 |
| T-08 | 클릭하면 `addCard`가 그 그룹의 `option.id`로 불린다 |

### 하위 추가 줄 (US2)

| # | 검증 |
|---|---|
| T-09 | 하위 목록 끝에 추가 줄이 있다 |
| T-10 | 부모 깊이가 한도에 닿으면 추가 줄이 없다 |
| T-11 | 클릭하면 `addSubCard`가 부모 카드로 불린다 |

### ⋯ 메뉴 항목 (US3)

| # | 검증 |
|---|---|
| T-12 | 하위 0개 · 깊이 여유면 메뉴에 항목이 있다 |
| T-13 | 하위가 1개 이상이면 항목이 없다 |
| T-14 | 깊이가 한도에 닿으면 항목이 없다 |

### 배선

| # | 검증 |
|---|---|
| T-15 | `addSubCard`가 `mutator.createSubCard`를 부르고, 성공 시 포커스 대상이 새 카드가 된다 (C-02, C-03) |
| T-16 | 생성 실패 시 flash message가 뜬다 (C-04) |
| T-17 | 하위 개수가 0 → 1이 되면 부모가 자동으로 펼쳐진다 (FR-010) |
| T-18 | 하위 카드 행에도 포커스 대상이 전달된다 (R4) |
