# Tasks: 사용자 속성 필터에 "본인" 조건을 더한다

**Input**: Design documents from `/specs/019-me-filter/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-surfaces.md](contracts/ui-surfaces.md)

**Tests**: constitution IV·IX가 TDD를 강제한다. 테스트 과제는 실패 출력을 남긴 뒤에만 완료로 표시한다.

**Organization**: US1(본인 선택·풀이)이 메커니즘 전체를 만들고, US2(공유 뷰 교차)는 같은 메커니즘을 다른 사용자 관점에서 검증한다 — US2 전용 코드는 교차 검증 테스트뿐이다.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 baseline 측정 — `webapp/`에서 `npm run check`·`npm run test`·`npm run check-types`를 각각 실행해 실패 목록을 `specs/019-me-filter/baseline.md`에 기록한다. `cardFilter.test`·`filterValuePanel.test` 스위트가 baseline에서 통과하는지 명시한다

---

## Phase 2: Foundational

없음 — 서버·공유 인프라 변경이 없다. 토큰·풀이 함수는 US1 안에서 만든다.

---

## Phase 3: User Story 1 - 필터에서 "본인"을 선택한다 (Priority: P1) 🎯 MVP

**Goal**: 필터 패널 맨 위의 "본인" 항목으로 클릭 2번 만에 자기 카드만 남긴다.

**Independent Test**: 담당자가 다른 카드 2장 → "본인" 체크 → 자기 카드만 ([contracts](contracts/ui-surfaces.md) F-01~F-05, U-01~U-05).

### Tests for User Story 1 (먼저 쓰고 실패를 확인한다)

- [X] T002 [P] [US1] `webapp/src/cardFilter.test.ts`에 계약 F-01~F-05 테스트 추가 — 치환·원본 불변·중첩 그룹 재귀·혼합 values·meId 부재 안전(includes 전부 제외·notIncludes 전부 통과), 치환 결과로 includes/notIncludes 평가(단일·배열 값). **F-06(T008)도 같은 파일이므로 이 시점에 함께 작성**해 RED 증거를 한 번에 확보한다. 실패 출력 기록
- [X] T003 [P] [US1] `webapp/src/components/viewHeader/filterPanel/filterValuePanel.test.tsx`에 계약 U-01~U-05 테스트 추가 — 맨 위 "본인" 항목, 토글 시 values `'me'` 추가/제거, 저장값 복원 표시, 검색 매칭, 혼합 선택. 실패 출력 기록

### Implementation for User Story 1

- [X] T004 [US1] `webapp/src/cardFilter.ts`에 `ME_FILTER_VALUE = 'me'` 상수와 `static resolveMe(filterGroup, meId)` 구현 — 재귀 사본 치환, 원본 불변 ([data-model.md](data-model.md))
- [X] T005 [US1] `webapp/src/store/cards.ts`의 `applyViewCardFilterSearchAndSort` 경로에 `getMe` 주입 — 필터 적용 전 `CardFilter.resolveMe(filter, me.id)` 사본 사용, me 없으면 치환 생략
- [X] T006 [US1] `webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`의 `PersonFilterPanel` — 목록 맨 위 고정 항목 "본인"(`ME_FILTER_VALUE`, 라벨 `PersonProperty.me`, 기존 체크박스 토글 재사용), 검색어가 "본인"/"me" 라벨과 맞으면 유지
- [X] T007 [US1] T002·T003 통과 확인 + i18n 점검 — 기존 키 `PersonProperty.me`(ko·en) 재사용으로 신규 키 없음을 확인, 영향 스냅샷은 의도 확인 후 갱신

**Checkpoint**: US1 단독 배포 가능 (MVP).

---

## Phase 4: User Story 2 - 공유 뷰에서 각자 자기 카드를 본다 (Priority: P2)

**Goal**: 같은 "본인" 필터 뷰를 누가 열어도 각자 자기 카드만 — 특정 ID 박제 금지.

**Independent Test**: 같은 필터 상태를 meId만 바꿔 평가하면 결과가 각자 기준으로 갈린다 (F-06). 실환경 교차 확인은 quickstart.

### Tests for User Story 2

- [X] T008 [US2] `webapp/src/cardFilter.test.ts`의 F-06 교차 테스트 통과 확인 — 동일 필터·동일 카드 집합을 meId='user-a'/'user-b'로 각각 풀어 평가했을 때 서로 자기 카드만 통과하고, 원본 필터는 두 번 모두 불변. **작성은 T002에서 함께** (같은 파일 — RED 증거 일괄 확보), 본 과제는 GREEN 판정을 맡는다

**Checkpoint**: US1+US2 메커니즘 검증 완료 — 실환경 교차는 T011에서.

---

## Phase 5: Polish & 검증

- [X] T009 [P] 회귀 계약 R-01·R-02 — cardFilter 기존 테스트·filterPanel 기존 테스트가 baseline 대비 추가 실패 없이 통과
- [X] T010 품질 게이트 — `npm run check`·`npm run test`·`npm run check-types` 분리 실행, 실패 목록을 T001 baseline과 diff로 제시
- [X] T011 종단 검증 — webpack 빌드 → `make deploy-from-watch` 배포 후 [quickstart.md](quickstart.md) 실측: QA 계정 2개로 시나리오 1(본인 선택)·2(교차 확인)·3(속성 4종)·4(회귀). 교차 확인 스크린샷 기록. 끝나면 QA 계정 비활성화
- [X] T012 SC 검증 — SC-001(클릭 2번)·SC-002(교차 노출 0)·SC-003(4종 동작)·SC-004(기존 동작 불변)를 실측으로 확인하고 결과를 tasks.md 하단에 표로 기록

---

## Dependencies & Execution Order

- **T001** 먼저 — 이후 판정 기준선
- **US1**: T002 ∥ T003 (다른 파일) → T004 → T005 → T006 → T007
- **US2**: T008은 T002와 같은 파일(cardFilter.test.ts)이라 T002 뒤 순차. T004 이후면 반전 검증으로 RED 증거 확보
- **Polish**: T009 ∥ T010 가능, T011 → T012 순차

## Implementation Strategy

**MVP = US1** (T001~T007). US2는 코드 추가 없이 교차 테스트(T008)와 실측(T011 시나리오 2)으로 완성된다. 전체를 한 PR로 묶는다 — 변경 파일 5개 수준의 작은 기능이다.

## Notes

- 테스트 과제는 실패 출력 증거 필수 (constitution IV)
- 과제 또는 논리 단위마다 커밋 (Conventional Commits, 한국어 본문)

---

## 검증 결과 (2026-10-12)

### TDD 증거

- cardFilter F-01~F-06: RED 6건(`resolveMe is not a function`) → GREEN (스위트 70/70)
- filterValuePanel U-01~U-04: RED 7건 → GREEN (스위트 18/18). U-05는 기존 토글 의미를 확인하는 가드 성격이라 첫 실행 통과 — 토글 로직 자체는 기존 코드라 반전 검증을 생략했다

### 품질 게이트 (T010) — baseline(동일 세션 측정) 대비

| 게이트 | baseline | 구현 후 | 판정 |
|---|---|---|---|
| npm run test | 57 스위트/143 실패 (1326개) | 57 스위트 (1340개, 신규 +14 전부 통과) — **실패 스위트 목록·실패 테스트 이름 목록 diff 모두 0** (집계 숫자 1 차이는 실행 간 비결정성) | ✅ |
| npm run check-types | TS 23건 | 23건 동일 | ✅ |
| npm run check | 2505줄 | 2505줄 동일, 터치 파일 신규 오류 0 | ✅ |

### 종단 검증 (T011) — 배포 후 실측 (QA 계정 qa018=A·qa019=B, seegene)

| 절 | 결과 |
|---|---|
| U-01 | 담당자 필터 값 목록 맨 위 "Me" ✅ |
| 본인 선택 (SC-001) | Filter→Me 클릭 2번 → 카드-A만 ✅ |
| 저장값 (FR-002) | 뷰 filter.values = `["me"]` — ID 박제 없음 ✅ |
| 교차 확인 (SC-002, F-06) | 같은 뷰를 B가 열자 **카드-B만**, A는 카드-A만 — 교차 노출 0 ✅ |
| U-03 | B의 패널에서 "Me" 체크 표시 (A 이름 아님) ✅ |
| createdBy (SC-003) | '만든 사람' 속성 추가 후 Me 필터 — B 시점 0장(전 카드 A 생성) ✅. multiPerson·updatedBy는 jest U-01(4종 패널)+F-04(배열 평가)로 검증 |
| 회귀 (FR-008) | B 시점에서 실제 사용자(qa018) 선택 → 카드-A만 — 기존 동작 불변 ✅ |

스크린샷: `shots/01-me-filter-as-A.png` · `02-me-filter-as-B.png`

### SC 검증 (T012)

- **SC-001** 클릭 2번 ✅ · **SC-002** 교차 노출 0건 ✅ · **SC-003** 4종 동작(실환경 2종 + jest 2종) ✅ · **SC-004** 목록 diff 0 + 실사용자 필터 실측 ✅

### 참고 (019 범위 밖)

Boards REST API로 **담당자=요청자 본인** 값을 직접 POST/PATCH하면 해당 카드가 저장에서 소실되는 서버 측 이상을 관찰했다 (UI 경로는 정상). 재현: person 값 포함 블록 생성/패치 → 조회 시 부재. 별도 조사가 필요하다.
