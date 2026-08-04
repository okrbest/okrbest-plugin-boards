# 설계: 표 보기 추가 행 (새 카드 · 새 하위 카드)

**브랜치**: `003-table-add-row` (`develop` 기반) | **작성**: 2026-08-04 | **출처**: brainstorming

이 문서는 `/speckit-specify`의 입력이다. 명세 정본은 같은 디렉터리의 `spec.md`가 된다.

---

## 1. 문제

표 보기에서 카드를 추가할 진입점이 두 군데서 빠져 있다.

**그룹이 걸린 표.** `table.tsx`의 `+ New` 푸터가 `!activeView.fields.groupById` 조건이라 그룹 보기에서는 나오지 않는다. 그룹 헤더의 `+`만 남는데, 이건 목록 **위**에 있어서 카드를 여러 개 이어 넣을 때 매번 위로 올라가야 한다.

**하위 카드.** 하위 행 영역은 `hasSubCards && expanded`일 때만 그려진다. 하위 카드가 하나도 없는 카드는 표 안에서 하위 카드를 만들 방법이 없고, 카드 상세를 열어야 한다.

노션의 `New task` / `New sub-item`이 참조 대상이다.

## 2. 하지 않는 것

- 그룹 없는 표의 기존 `+ New` 푸터는 손대지 않는다. 동작하고 있고, 이 작업이 요구하지 않는 변경이다
- 그룹 헤더의 `+`를 없애지 않는다. 그룹 레벨 추가는 노션에도 있고, 없애면 기존 사용자에게 회귀다
- 하위 카드가 없는 카드를 펼칠 수 있게 만들지 않는다. 모든 행에 펼침 화살표가 생기는 변화가 이득보다 크다 — 대신 ⋯ 메뉴를 진입점으로 쓴다
- 카드 생성 로직을 새로 만들지 않는다. `addCard`와 `mutator.createSubCard`가 이미 있다

## 3. 화면 동작

### 3.1 새 카드 (그룹 보기)

| 상황 | 결과 |
|---|---|
| 그룹 없는 보기 | 지금과 같다 — 표 맨 아래 `+ New` |
| 그룹 있는 보기 | 헤더 `+` 유지, **그룹마다 카드 목록 끝에 `+ 새 카드`** |
| 카드 0개 그룹 | `+ 새 카드` 표시 (지금은 행 영역 자체가 안 그려진다) |
| 접힌 그룹 | 표시하지 않는다 — 카드 행도 안 보이므로 |
| 읽기 전용 / 권한 없음 | 표시하지 않는다 |

누르면 그 그룹의 속성값이 채워진 카드가 생기고 제목 칸에 커서가 간다. `addCard(groupByOptionId)`가 이미 그룹값 설정과 인라인 포커스를 모두 한다.

### 3.2 새 하위 카드

| 상황 | 진입점 |
|---|---|
| 하위 카드 ≥ 1, 펼침 | 하위 목록 끝에 `+ 새 하위 카드` 행 (들여쓰기) |
| 하위 카드 0개 | 행의 ⋯ (더 많은 행동) 메뉴에 `하위 카드 추가` |
| 깊이 한도(`Constants.maxCardDepth`, 현재 5) 도달 | 행과 메뉴 항목을 **둘 다 숨긴다** |
| 읽기 전용 / 권한 없음 | 표시하지 않는다 |

메뉴로 만들면 부모 행이 자동으로 펼쳐져 새 하위 카드가 보인다. 어느 경로든 제목 칸에 커서가 간다.

**진입점을 둘로 나눈 이유**: 하위 행 영역의 렌더 조건을 그대로 두기로 했기 때문이다. 조건을 바꾸면 모든 행에 펼침 화살표가 필요해진다.

## 4. 구조

### 4.1 신규 컴포넌트

**`webapp/src/components/table/tableAddRow.tsx`**

```
Props: label: string
       onClick: () => void
       indented?: boolean
```

- `.octo-table-footer` / `.octo-table-cell`을 그대로 쓴다. 기존 푸터와 같아 보여야 한다
- `BoardPermissionGate permissions={[Permission.ManageBoardCards]}`로 감싼다
- "추가 행"이라는 한 가지 일만 한다. 어디에 놓이고 무엇을 만들지는 호출부가 정한다

세 번째 자리가 생기면 그때 기존 푸터까지 이 컴포넌트로 합친다. 지금은 아니다.

### 4.2 배치

| 파일 | 변경 |
|---|---|
| `tableGroup.tsx` | `TableRows` 뒤에 `TableAddRow`. `group.cards.length > 0` 조건은 `TableRows`에만 남긴다 → 빈 그룹에도 나온다. 접힘(`isCollapsed`)일 때는 둘 다 안 그린다 |
| `tableSubCardRows.tsx` | 하위 행 뒤에 `TableAddRow indented` |
| `tableRow.tsx` | `CardActionsMenu`의 `children`으로 `Menu.Text` 하나를 넣는다 (하위 0개 · 깊이 여유일 때만) |

`CardActionsMenu`는 이미 `children`을 받는다. 공용 메뉴 컴포넌트는 건드리지 않는다.

### 4.3 배선

`addSubCard(parentCard: Card): Promise<void>`를 `centerPanel.tsx`에 만들고 기존 `addCard`와 같은 경로로 내려보낸다.

```
centerPanel
  addSubCard ──▶ table ──▶ tableGroup ──▶ tableRows ──▶ tableRowExpandable
                                                          ├─▶ tableRow          (⋯ 메뉴 항목)
                                                          └─▶ tableSubCardRows  (추가 행)
```

**함께 이어야 하는 것 하나**: `cardIdToFocusOnRender`가 지금 `TableRowExpandable`에서 멈춘다. 하위 카드 제목에 커서를 두려면 `TableSubCardRows`를 거쳐 하위 `TableRowExpandable`까지 내려야 한다.

**펼침 상태**: `expanded`는 `TableRowExpandable`의 로컬 state다. 하위 개수가 0에서 1로 바뀌면 펼치도록 기존 `useEffect`를 넓힌다. 위에서 별도 신호를 내려보내지 않는다.

## 5. 데이터 흐름

### 5.1 카드 생성

기존 `addCard` 경로를 그대로 탄다. 낙관적 갱신·undo 그룹·필터 반영이 그 안에 있다. 새로 만드는 흐름이 없다.

### 5.2 하위 카드 생성

```
addSubCard(parentCard)
  ├ 깊이 확인   (parentCard.fields.depth ?? 0) < Constants.maxCardDepth
  ├ mutator.createSubCard(board.id, parentCard.id, '', afterRedo)
  │    afterRedo(created) → dispatch(addSubCard({parentCardId, subCard: created}))
  │                         setCardIdToFocusOnRender(created.id)
  └ 실패    → sendFlashMessage(오류)
```

`addSubCard` 리듀서는 `store/cards.ts`에 이미 있고 `subCards.tsx`가 쓴다. 스토어가 갱신되면 `useSubCardInfo`가 새 목록을 내주고 행이 그려진다 — 표에서 따로 조회하지 않는다.

### 5.3 실패 처리

| 경우 | 처리 |
|---|---|
| 서버 오류 | `sendFlashMessage`로 알린다. 낙관적 행을 만들지 않으므로 되돌릴 상태가 없다 |
| 깊이 초과 | 진입점을 숨겨 도달하지 않는다. 서버가 그래도 거부하면 위 오류 경로로 흡수 |
| 연타 | 생성 중 플래그로 두 번째 클릭을 무시한다 (`subCards.tsx`의 `isAdding`과 같은 방식) |

### 5.4 카드 접근 권한(002)과의 관계

카드 **생성**은 규칙을 적용하지 않고 보드 권한만 본다(002 FR-032). 이 기능은 생성만 하므로 충돌하지 않는다.

다만 규칙이 걸린 보드에서 그룹 속성이 곧 규칙의 속성인 경우, 만든 사람에게 그 카드가 곧바로 보이지 않을 수 있다. **이는 002의 정의된 동작이며 이 기능의 결함이 아니다.** 명세에 사실로만 기록한다.

### 5.5 텔레메트리

기존 `TelemetryActions.CreateCard`를 하위 카드에도 쓴다. 새 액션을 만들지 않는다.

## 6. i18n

`webapp/i18n/en.json`·`ko.json`에 동시 추가한다 (constitution 원칙 V).

| 키 | en | ko |
|---|---|---|
| `TableComponent.plus-new-card` | `+ New card` | `+ 새 카드` |
| `TableComponent.plus-new-subcard` | `+ New sub-card` | `+ 새 하위 카드` |
| `CardActionsMenu.addSubCard` | `Add sub-card` | `하위 카드 추가` |

그룹 없는 보기의 기존 `TableComponent.plus-new`(`+ New`)는 그대로 둔다. 새 키를 따로 두는 이유는 그룹 보기에서 카드 추가 행과 하위 카드 추가 행이 한 화면에 같이 나오기 때문이다 — 둘 다 `+ New`면 어느 쪽인지 알 수 없다.

## 7. 테스트

| 파일 | 검증 |
|---|---|
| `tableAddRow.test.tsx` (신규) | 라벨 표시·클릭 시 `onClick` 호출 / `ManageBoardCards` 없으면 미렌더 / 들여쓰기 플래그가 클래스에 반영 |
| `tableGroup.test.tsx` (신규) | 카드 있는 그룹 끝에 추가 행 1개 / **카드 0개 그룹에도 표시** / 접힌 그룹엔 미표시 / 클릭 시 `addCard(group.option.id)` |
| `tableSubCardRows.test.tsx` (신규) | 하위 목록 끝에 추가 행 / 깊이 5 부모에선 미표시 / 클릭 시 `addSubCard(parentCard)` |
| `tableRow.test.tsx` (기존) | 하위 0개·깊이 여유 → 메뉴에 `하위 카드 추가` 있음 / 하위 ≥ 1 → 없음 / 깊이 5 → 없음 |
| `tableRowExpandable` | 하위가 0 → 1이 되면 자동으로 펼쳐진다 |
| `centerPanel.test.tsx` (기존) | `addSubCard`가 `mutator.createSubCard` 호출·성공 시 포커스 대상이 새 카드 / 실패 시 flash message |

**회귀 기준**: webapp 실패 **스위트 목록** diff (개수는 진동한다). 표 스냅샷은 추가 행이 생기므로 갱신이 필요하다 — 갱신 전후 실패 개수가 같은지 확인한다.

## 8. 품질 게이트

webapp만 변경하므로 `make webapp-ci`(`npm run check` + `npm run test` + `npm run check-types`)를 실행하고 baseline 대비 신규 실패 0건을 근거로 제시한다. 서버 변경이 없으므로 `server-lint`·`server-test`는 해당하지 않는다.
