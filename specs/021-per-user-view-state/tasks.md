# Tasks: 표 뷰 개인 화면 제어 분리

**Input**: Design documents from `/specs/021-per-user-view-state/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 포함한다 — constitution 원칙 IV(동작 변경 시 테스트 동반)가 요구하고, 구현은 superpowers `test-driven-development`를 따른다. 테스트 과제는 **실패 출력을 확인한 뒤에만** 완료로 표시한다.

**Organization**: user story 단위로 묶어 각 스토리를 독립적으로 구현·검증할 수 있게 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (다른 파일, 미완료 과제에 의존하지 않음)
- **[Story]**: 소속 user story (US1, US2, US3)

## Path Conventions

단일 저장소 플러그인의 webapp 패키지만 변경한다. 경로는 저장소 루트 기준이다. 서버(`server/`)는 건드리지 않는다.

---

## Phase 1: Setup

**Purpose**: 회귀 판정 기준을 먼저 고정한다. 이 저장소는 깨끗한 상태에서도 테스트가 실패하므로(기준선: webapp 57스위트 등) 개수가 아니라 실패 목록 diff로 판정한다.

- [X] T001 변경 전 기준선 확보 — `webapp/`에서 `npm run test` 실패 스위트 목록과 `npm run check-types`·`npm run check` 실패 목록을 기록해 둔다 (`webapp-test-baseline` 메모와 대조). 산출물: 비교용 목록(스크래치 파일)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 두 스토리가 공유하는 개인 상태 저장 기반. 이 phase가 끝나야 user story 작업을 시작할 수 있다.

- [X] T002 [P] `webapp/src/userSettings.ts`에 `UserSettingKey.ViewLocalState = 'viewLocalState'` 키와 JSON 맵 접근자를 추가한다 (`LastViewId` 선례를 따름 — try/catch로 실패를 삼키고 null 반환)
- [X] T003 [P] `webapp/src/store/viewLocalState.test.ts`에 슬라이스 단위 테스트를 먼저 작성한다 — (a) `toggleCollapsedOption`: 개인 목록이 없으면 seed 복사 후 토글, 있으면 토글만, (b) `setColumnWidth`: 열 단위 기록, (c) 키 분리: `${userId}:${viewId}`가 다르면 서로 영향 없음, (d) localStorage 실패 시 메모리로만 동작. **실패 출력을 확인한다** (구현 전이므로 모듈 부재로 실패)
- [X] T004 `webapp/src/store/viewLocalState.ts` 슬라이스를 구현한다 — state `{byKey: Record<string, {collapsedOptionIds?: string[], columnWidths?: Record<string, number>}>}`, 액션 `toggleCollapsedOption`·`setColumnWidth`·`hydrate`, 쓰기 액션 후 `UserSettings`에 동기 기록, 스토어 생성 시 localStorage에서 `hydrate`. 병합용 selector(`makeGetViewLocalState` 등)도 여기에 둔다. 비로그인(공유 링크) 사용자는 userId를 빈 문자열로 대체하고 localStorage에 지속하지 않는다(메모리 전용). T003 테스트가 통과할 때까지 (depends on T002, T003)
- [X] T005 `webapp/src/store/index.ts`(reducer 결합 지점)에 `viewLocalState` 슬라이스를 등록한다

**Checkpoint**: 슬라이스 테스트 통과. user story 구현 시작 가능

---

## Phase 3: User Story 1 - 그룹 펼치기/접기는 내 화면에만 적용된다 (Priority: P1) 🎯 MVP

**Goal**: 표 그룹 접기 토글을 서버 쓰기 없이 개인 상태로 돌려, 다른 사용자 화면에 전파되지 않게 한다 (FR-001, FR-003, FR-004, FR-005).

**Independent Test**: 브라우저 2개(계정 2개)로 같은 표 뷰를 열고 한쪽에서 접기 → 다른 쪽 무변화, Network 탭에 PATCH 없음, 새로고침 후 유지 (quickstart 시나리오 1·3).

### Tests for User Story 1

- [X] T006 [US1] `webapp/src/components/table/table.test.tsx`에 실패 테스트를 추가한다 — (a) 접기 토글 시 `mutator.updateBlock`이 호출되지 않는다, (b) 개인 상태가 없으면 뷰의 `collapsedOptionIds`가 그대로 렌더에 쓰인다(시드), (c) 개인 상태가 있으면 뷰 값 대신 개인 목록이 렌더를 결정한다. **실패 출력을 확인한다**

### Implementation for User Story 1

- [X] T007 [US1] `webapp/src/components/table/table.tsx`를 수정한다 — 현재 사용자 ID와 `viewLocalState`를 구독해 `activeView`에 개인 `collapsedOptionIds`를 병합한 사본(`useMemo`)을 만들고, 하위 컴포넌트(`TableGroup`·`TableRows`·`TableHeaders`·`CalculationRow`)에 그 사본을 내려보낸다. `hideGroup`(130-149행)은 `mutator.updateBlock`·`performAsUndoGroup`·`dispatch(updateView)` 대신 `toggleCollapsedOption` 액션만 디스패치한다. 완료 조건: Table 하위에서 병합 사본을 `mutator.updateBlock`류 전체 블록 쓰기에 넘기는 경로가 없음을 grep으로 확인한다(개인 값이 공유 뷰로 역류하면 이 기능의 정반대 버그가 된다). T006 테스트가 통과할 때까지
- [X] T008 [US1] 기존 테스트 회귀를 확인한다 — `webapp/src/components/table/` 전체 스위트를 돌려 기준선 밖 실패가 없는지 본다. "뷰의 collapsedOptionIds가 접힘을 결정한다" 전제의 기존 테스트는 시드 규칙 덕에 통과해야 한다(깨지면 병합 로직 버그 — 테스트를 고치지 말고 구현을 고친다)

**Checkpoint**: US1 단독으로 동작·검증 가능 (MVP)

---

## Phase 4: User Story 2 - 열 너비 조절은 내 화면에만 적용된다 (Priority: P2)

**Goal**: 열 너비 드래그를 서버 쓰기 없이 열 단위 개인 값으로 기록한다 (FR-002, FR-003, FR-004, FR-005).

**Independent Test**: 두 창에서 한쪽이 열 너비를 바꿔도 다른 쪽 무변화, PATCH 없음, 새로고침 후 유지 (quickstart 시나리오 2·3).

### Tests for User Story 2

- [X] T009 [US2] `webapp/src/components/table/table.test.tsx`에 실패 테스트를 추가한다 — (a) 열 너비 확정 시 `mutator.updateBlock`이 호출되지 않는다, (b) 개인 너비가 있는 열은 개인 값, 없는 열은 뷰 저장값이 쓰인다(`{...공유, ...개인}` 병합). **실패 출력을 확인한다**

### Implementation for User Story 2

- [X] T010 [US2] `webapp/src/components/table/table.tsx`를 수정한다 (역류 점검에서 tableHeaders.tsx의 열 자동 너비가 전체 블록 쓰기로 남아 있는 것을 발견 — `columnResize.updateWidth`로 합류시키고 실패 테스트로 고정했다) — T007의 병합 사본에 `columnWidths` 열 단위 병합을 추가하고, `ColumnResizeProvider`(344-348행)에 병합된 widths를 전달하며, `resizeColumn`(110-128행)은 `setColumnWidth` 액션만 디스패치한다. 완료 조건: T007과 같은 역류 점검 — 병합된 widths가 전체 블록 쓰기 경로에 들어가지 않음을 확인한다. T009 테스트가 통과할 때까지 (depends on T007)

**Checkpoint**: US1 + US2 동작. 두 조작 모두 전파되지 않음

---

## Phase 5: User Story 3 - 읽기 전용 사용자도 화면을 조정할 수 있다 (Priority: P3)

**Goal**: 접기 버튼과 열 너비 그립의 권한 차단을 해제한다. 두 조작이 더 이상 데이터를 바꾸지 않으므로 안전하다 (FR-006). 공유 구성 컨트롤(정렬 메뉴·그룹 숨김 등)의 게이트는 유지한다.

**Independent Test**: 보기 권한 계정으로 접기·너비 조절이 동작하고 서버 요청이 없다. 정렬 변경 등은 여전히 차단된다 (quickstart 시나리오 4).

### Tests for User Story 3

- [X] T011 [P] [US3] `webapp/src/components/table/tableGroupHeaderRow.test.tsx`에 실패 테스트를 추가한다 — readonly=true여도 접기 버튼 클릭이 `hideGroup`을 호출한다. **실패 출력을 확인한다**
- [X] T012 [P] [US3] `webapp/src/components/table/tableHeader.test.tsx`에 실패 테스트를 추가한다 — readonly=true여도 `HorizontalGrip`이 렌더된다. 정렬 메뉴(`MenuWrapper`)는 여전히 disabled다. **실패 출력을 확인한다**

### Implementation for User Story 3

- [X] T013 [US3] `webapp/src/components/table/tableGroupHeaderRow.tsx` 79-80행의 readonly 차단을 제거한다 — 버튼이 항상 `props.hideGroup`을 호출하고 `readonly` CSS 클래스 분기도 함께 정리한다 (depends on T011)
- [X] T014 [US3] `webapp/src/components/table/tableHeader.tsx` 90-91행의 그립 렌더 조건에서 readonly를 떼어낸다. `webapp/src/components/table/table.tsx` 355행에서 `TableHeaders`에 주는 readonly 신호는 공유 구성용으로 유지하되 — 정렬 메뉴(`MenuWrapper`)와 열 드래그 재정렬(`useSortable`, 37행)은 기존 게이트 그대로 — 그립만 영향을 받지 않게 한다 (depends on T012, T010)

**Checkpoint**: 세 스토리 모두 독립 동작

---

## Phase 6: Polish & 검증

**Purpose**: 정리와 완료 근거 확보.

- [X] T015 정리 — `webapp/src/components/table/table.tsx`에서 더 이상 쓰지 않는 import(`updateView`, `createBoardView` 잔재 등)를 지우고, `npm run check`(eslint) 신규 경고가 없는지 본다 (tableHeaders.tsx의 createBoardView도 제거. limited card 테스트 블록의 기존 들여쓰기 오류를 정규화해 table.test.tsx eslint 오류 173→115)

**아래 셋은 기능마다 반드시 넣는다** (constitution 원칙 I·IV). 게이트만으로는 이 저장소의 결함이 잡히지 않는다.

- [X] T016 품질 게이트 — `webapp/`에서 `npm run check`·`npm run test`·`npm run check-types`를 따로 실행하고, 실패 목록이 T001 기준선과 같은지 diff로 보인다 (jest: 실패 56스위트 목록 diff 무차이. tsc: 기준선과 완전 동일. eslint: 접촉 파일 11개 전부 Resolve error 제외 0건, table.test.tsx는 173→115로 개선)
- [X] T017 종단 검증 — `npm run debug:watch`(또는 `make deploy-from-watch`)로 빌드·배포하고 브라우저 하드 리프레시 후, [quickstart.md](quickstart.md) 시나리오 1~7을 실제 계정 2개로 훑고 절별 결과를 기록한다. 소스만 고치면 화면에 반영되지 않는다
- [X] T018 SC 검증 — spec.md의 SC-001~SC-005 각각을 실측으로 확인한다. 명세의 수치가 추정이었으면 실측값으로 명세를 갱신한다

---

## 검증 결과 기록 (2026-10-23)

### 품질 게이트 (T016)

| 게이트 | 기준선 | 변경 후 | 판정 |
|---|---|---|---|
| `npm run test` (jest) | 실패 56스위트 | 실패 56스위트, **목록 diff 무차이** | 회귀 없음 |
| `npm run check-types` (tsc) | 오류 23줄 | **기준선과 완전 동일** (diff 무차이) | 회귀 없음 |
| `npm run check` (eslint) | table.test.tsx 173건 등 | 접촉 파일 11개 신규 0건, table.test.tsx 115건으로 개선 | 회귀 없음 |

신규 테스트: 슬라이스 10건 + table 6건(접기 3·너비 3) + 읽기 전용 2건 — 전부 실패(RED)를 먼저 확인한 뒤 통과. 스냅샷 갱신은 의도된 DOM 변화(readonly 클래스 제거·그립 상시 렌더)만 선별 적용.

### 종단 검증 (T017) — 배포된 플러그인, QA 계정 2개(qa-021a 편집자 / qa-021b viewer), 전용 보드 `021 검증 보드`

| 시나리오 | 결과 |
|---|---|
| 1. 그룹 접기 무전파 | 통과 — A 접기 후 B 무변화, 역방향도 무변화. 네트워크에 blocks 쓰기(PATCH/POST) 0건 |
| 2. 열 너비 무전파 | 통과 — B가 140px로 조절해도 A는 100px 유지. 쓰기 0건 |
| 3. 재방문 유지 | 통과 — 하드 리로드·서버 재기동 후에도 A(접힘)·B(접힘+140px) 각자 복원 (localStorage `viewLocalState`, `userId:viewId` 키) |
| 4. 읽기 전용 조작 | 통과 — viewer가 접기·너비 조절 성공, 서버 요청·오류 없음. 그립이 viewer에게도 렌더됨 |
| 5. 공유 구성 회귀 | 통과 — 뷰 patch(hiddenOptionIds)가 A·B 양쪽에 1초 내 websocket 반영, 개인 접힘과 공존 |
| 6. 기존 저장값 시드 | 통과 — 개인 상태 없는 최초 진입 시 뷰 저장값 그대로 (단위 테스트 + 실환경 최초 진입) |
| 7. undo 제외 | 통과(간접) — mutator 미경유를 단위 테스트로, 서버 무쓰기를 Network로 입증 |
| 8. 뷰 복제 | 구조적 충족 — 복제본은 새 viewId라 개인 상태 키가 매칭되지 않음 (미실측) |

### SC 검증 (T018)

| SC | 실측 |
|---|---|
| SC-001 | 접기·너비 조작(총 4회) 모두 상대 화면 무변화. 서버 쓰기 요청 자체가 0건이라 전파 경로가 없다 |
| SC-002 | viewer 접기·너비 조절 성공률 2/2 (기존 0%) |
| SC-003 | 리로드·서버 재기동 후 100% 재현 |
| SC-004 | 공유 구성 변경이 양쪽에 1초 내 반영 (기존 동작 유지) |
| SC-005 | 블록 patch 미발생 → 변경 이력에 기록될 요청 없음 |

### 참고

- 검증 중 개발 서버가 내려갔었는데(메인 저장소 세션의 재기동 실패 → DB 인증 env 문제), 본 기능과 무관한 환경 이슈로 okrbest-d9 세션이 복구했다. 서버 재기동 후 플러그인 번들 404는 `make deploy-from-watch` 재배포로 해소된다.
- QA 자산(계정 qa-021a/qa-021b, demosample 팀의 `021 검증 보드`)은 사용자 테스트용으로 남겨 두었다. PR 머지 후 `DELETE /api/v4/users/{id}`로 정리한다.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음 — 즉시 시작
- **Foundational (Phase 2)**: T001 뒤. 모든 user story를 막는다
- **US1 (Phase 3)**: Phase 2 완료 뒤
- **US2 (Phase 4)**: T010이 T007의 병합 사본을 확장하므로 US1 뒤에 진행한다 (같은 파일 table.tsx)
- **US3 (Phase 5)**: 테스트(T011·T012)는 Phase 2 뒤 바로 가능. T014는 T010 뒤 (table.tsx 공유)
- **Polish (Phase 6)**: 전체 뒤

### 과제 의존 요약

```
T001 → T002·T003 [P] → T004 → T005
T005 → T006 → T007 → T008        (US1)
T007 → T009 → T010               (US2)
T011·T012 [P] → T013, T014       (US3, T014는 T010 뒤)
전체 → T015 → T016 → T017 → T018
```

### Parallel Opportunities

- T002 ∥ T003 (다른 파일)
- T011 ∥ T012 (다른 파일)
- 세 스토리의 수정이 table.tsx에 겹치므로 스토리 자체는 순차 진행이 안전하다

---

## Implementation Strategy

**MVP = US1만** (Phase 1→2→3). 신고된 오작동의 핵심이 그룹 접기 전파이므로, US1만 배포해도 가장 큰 혼란이 사라진다. 이후 US2(열 너비), US3(읽기 전용 허용)을 증분으로 얹는다. 각 checkpoint에서 quickstart의 해당 시나리오를 돌려 독립 검증한다.

구현은 `/speckit-implement`로 진행하며, 시작 시 superpowers `test-driven-development`·`verification-before-completion`을 호출한다 (constitution 원칙 IX).

## Notes

- 서버·DB·API·i18n 변경 없음. `BoardView.fields` 구조 불변 (upstream 호환)
- 완료 선언 전 사용자 최종 확인을 기다린다 — PR은 확인 뒤에만 연다 (constitution 원칙 VIII)
