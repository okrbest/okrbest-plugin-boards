# Phase 0 Research: 표 보기 드래그 재정렬·중첩

**Date**: 2026-08-05 | **Plan**: [plan.md](plan.md)

명세를 구현으로 옮기기 전에 답이 필요했던 것들. 전부 이 저장소의 현행 코드를 읽어 확인했다.

---

## R1. 되돌리기 그룹은 중첩할 수 없다

**Decision**: `applyTableDrop`은 **최상위에서 `performAsUndoGroup`을 딱 한 번** 열고, 그 안에서 `linkCardAsSubCard` / `unlinkSubCard` / `changePropertyValue` / `changeViewCardOrder`를 직접 호출한다. 하위 호출을 다시 `performAsUndoGroup`으로 감싸지 않는다.

**Rationale**: `beginUndoGroup`은 이미 그룹이 열려 있으면 `Utils.assertFailure('UndoManager does not support nested groups')`를 내고 그룹 없이 진행한다(`mutator.ts:64-68`). 반면 `linkCardAsSubCard`·`unlinkSubCard`는 `undoManager.perform(..., this.undoGroupId)`로 **현재 열린 그룹에 자기를 등록**한다(`mutator.ts:1615`, `:1640`). 즉 감싸지 않고 그냥 호출하면 저절로 같은 그룹에 들어간다. 이것이 FR-028(되돌리기 한 번)을 만족시키는 방법이다.

**현행 결함과의 관계**: 지금 `onDropToGroup`은 `performAsUndoGroup`을 **두 번** 연다(`table.tsx:148`, `:234`). 순차 실행이라 assert는 안 나지만 그룹이 둘로 갈라져 Ctrl+Z 한 번에 절반만 돌아온다. design.md의 B2가 이것이다.

**Alternatives considered**: 하위 호출마다 그룹을 열고 바깥에서 합치기 — API가 중첩을 지원하지 않아 불가능. 드롭 전체를 서버 단일 엔드포인트로 만들기 — 서버 무변경 제약(spec Assumptions)에 어긋나고 범위가 커진다.

---

## R2. `performAsUndoGroup`은 예외를 삼킨다 — 실패 알림을 그 밖에 두면 동작하지 않는다

**Decision**: 서버 거부를 잡는 `try/catch`를 **`performAsUndoGroup`에 넘기는 콜백 안에** 둔다. 잡은 자리에서 `sendFlashMessage({severity: 'high'})`를 호출한다.

**Rationale**: `performAsUndoGroup`의 본문은 이렇다(`mutator.ts:81-91`).

```ts
try {
    await actions()
} catch (err) {
    Utils.assertFailure(`ERROR: ${err}`)
}
```

**예외를 다시 던지지 않는다.** 그래서 이렇게 쓰면 `catch`가 영원히 실행되지 않는다.

```ts
try {
    await mutator.performAsUndoGroup(async () => { ... })   // ← 여기서 삼켜진다
} catch (e) {
    sendFlashMessage(...)                                    // ← 도달 불가
}
```

FR-029(서버 거부 시 사용자에게 알림)를 이 형태로 짜면 조용히 실패한다. 계획 단계에서 못 잡았으면 구현에서 "왜 오류 메시지가 안 뜨지"로 시간을 버렸을 항목이다.

**Alternatives considered**: `performAsUndoGroup`이 다시 던지도록 고치기 — 다른 호출부 전체의 동작이 바뀌므로 이번 범위(원칙 VIII: 한 변경 = 한 관심사)를 벗어난다. `Utils.assertFailure`를 가로채기 — 전역 훅이라 취약하다.

---

## R3. 접힌 그룹의 행은 DOM에 남는다 — 메트릭 수집에서 제외해야 한다

**Decision**: 행 메트릭을 등록할 때 `display: none`인 행(접힌 그룹 소속)을 제외한다. 판정 모듈에는 **보이는 행만** 넘긴다.

**Rationale**: 접힌 그룹의 행은 언마운트되지 않고 `.hidden` 클래스로 `display: none` 처리된다(`tableRow.tsx:119-121` → `table.scss:240-242`). `display: none` 요소의 `getBoundingClientRect()`는 전부 0이라, 그대로 수집하면 경계 계산이 좌표 0 근처로 무너진다.

이 사실이 FR-024(접힌 그룹 안으로는 놓을 수 없다)를 **공짜로** 만족시킨다. 보이는 행만 넘기면 접힌 그룹에는 경계 자체가 생기지 않는다. 별도 분기가 필요 없다.

**Alternatives considered**: 렌더 시점에 접힌 행을 아예 언마운트 — 그룹을 펼칠 때마다 재마운트 비용이 들고 기존 동작을 바꾼다. 판정 모듈에서 `collapsedOptionIds`를 다시 조회 — 모듈이 뷰 상태에 의존하게 되어 순수성이 깨진다.

---

## R4. 가로 임계값은 들여쓰기 눈금과 같은 22px

**Decision**: 깊이 후보 = `floor((커서 x − 제목 셀 시작 x) / 22)`. 22px은 하위 카드 들여쓰기와 같은 값이다.

**Rationale**: 들여쓰기는 `width: depth * 22`로 그려진다(`tableRow.tsx:183`). 임계값을 이 눈금과 같게 두면 **선이 멈추는 자리와 카드가 놓이는 자리가 픽셀 단위로 일치한다** — FR-007이 요구하는 것이다. 다른 값을 쓰면 "선은 여기 있는데 카드는 저기 놓인다"가 된다.

22는 현재 하드코딩이다. 판정 모듈과 렌더가 같은 상수를 보도록 `Constants`로 올리고 양쪽이 그것을 참조한다.

**Alternatives considered**: 고정 임계(예: 40px) — 눈금과 어긋나 선과 결과가 불일치. 행 폭 비율 — 열 너비를 조절하면 임계가 따라 움직여 예측이 안 된다.

---

## R5. `hover`는 픽셀마다 호출된다 — rAF로 프레임당 1회로 합친다

**Decision**: `useDrop`의 `hover`에서는 좌표만 ref에 적고, `requestAnimationFrame` 콜백에서 판정과 상태 갱신을 한 번 수행한다.

**Rationale**: `react-dnd`의 `hover`는 드래그 중 마우스 이동마다 호출된다. 여기서 바로 `setState`를 하면 판정 + 리렌더가 픽셀마다 돈다. 판정은 보이는 행 전체를 훑으므로 행이 많은 표에서 비용이 눈에 띈다.

좌표를 ref에 적는 건 리렌더를 유발하지 않으므로, rAF 한 번에 마지막 좌표만 반영하면 프레임당 판정 1회로 떨어진다.

**Alternatives considered**: `lodash.throttle` — 시간 기준이라 프레임과 어긋나고 의존성이 는다. 판정을 `drop`에서만 하기 — 드래그 중 인디케이터가 필요하므로 불가.

---

## R6. 인디케이터 좌표계는 `.Table`의 콘텐츠 좌표

**Decision**: `anchorTop`을 `.Table`의 스크롤 콘텐츠 기준 y로 계산하고, 인디케이터를 `.Table`의 `position: absolute` 자식으로 둔다.

**Rationale**: `.Table`은 `position: relative` + `overflow: auto`다(`table.scss:3-8`). 절대 위치 자식은 이 컨테이너의 패딩 박스를 기준으로 배치되며 **스크롤 콘텐츠와 함께 움직인다.** 별도 스크롤 보정 없이 FR-009(스크롤 중에도 선이 목표 경계에 붙어 있음)가 만족된다.

`getBoundingClientRect()`는 뷰포트 기준이므로, 컨테이너의 rect와 `scrollTop`으로 콘텐츠 좌표로 환산한다.

z-index는 새 슬롯 `table-drop-indicator`를 `_z-index.scss`에 판다. 기존 `table-row-action-cell: 100`보다 위여야 핸들에 가리지 않는다.

**Alternatives considered**: `position: fixed` + 뷰포트 좌표 — 스크롤할 때마다 좌표를 다시 써야 하고 표가 다이얼로그 안에 들어가면 깨진다. 행 안에 선을 그리기 — 경계에서 두 행이 각자 그려 깜빡인다(design.md에 기록).

---

## R7. 서브트리는 스토어에서 재귀로 모은다

**Decision**: 드래그 시작 시 `getCurrentBoardSubCardsByParent` 맵을 깊이우선으로 훑어 `subtreeIds`(부모 → 자손 순서)와 `subtreeHeight`(아래로 몇 단인지)를 만든다. `useDrag`의 `item`에 실어 보낸다.

**Rationale**: 이 맵은 이미 스토어 셀렉터로 존재하며(`store/cards.ts:266`) `useSubCardInfo`가 쓰고 있다. 별도 API 호출 없이 재귀 한 번으로 서브트리를 얻는다.

`subtreeIds`의 깊이우선 순서가 곧 `cardOrder`에 넣을 순서다 — FR-017(자손이 상대적 계층을 유지)이 여기서 보장된다.

`subtreeHeight`는 깊이 클램프 상한(`5 − 높이`)에 쓰인다. 서버도 같은 계산을 `getMaxSubCardDepth`로 한다(`server/app/cards.go:226`).

**주의**: 이 맵은 R8에서 정렬 순서를 고치는 대상이기도 하다. 정렬을 고치면 `subtreeIds` 순서도 자동으로 화면 순서와 일치한다.

**Alternatives considered**: 서버에 서브트리 조회 API 추가 — 서버 무변경 제약 위반이고, 드래그 시작마다 왕복이 생긴다.

---

## R8. 하위 카드 정렬은 셀렉터에서 고친다

**Decision**: `getCurrentBoardSubCardsByParent`가 각 부모의 자식 배열을 `activeView.fields.cardOrder` 순서로 정렬해 반환하도록 고친다.

**Rationale**: 지금은 `getCurrentBoardCards`를 순회하며 맵에 밀어 넣기만 한다(`store/cards.ts:266-282`). 스토어 순서가 곧 화면 순서라 `cardOrder`를 바꿔도 하위 레벨에서는 반영되지 않는다 — design.md의 B3이고, FR-020·FR-021이 요구하는 것이다.

셀렉터에서 고치면 `useSubCardInfo`를 쓰는 모든 곳(표 하위 행, 카드 상세의 하위 목록)이 함께 고쳐진다.

**Alternatives considered**: `TableSubCardRows`에서 렌더 직전 정렬 — 같은 정렬이 카드 상세에는 안 걸려 두 화면의 순서가 갈린다.

---

## 미해결 없음

Technical Context에 `NEEDS CLARIFICATION`으로 남긴 항목은 없다. R1~R8이 계획 수립에 필요한 미지를 모두 해소했다.
