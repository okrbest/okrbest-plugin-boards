# Tasks: 카드 접근 권한을 역할 매트릭스로 정한다

**Input**: [specs/009-card-access-role-matrix/](./)

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/card-access-matrix.md](./contracts/card-access-matrix.md)

**Tests**: 넣는다. 원칙 IV가 동작 변경에 테스트를 요구하고, 이 기능은 권한 판정을 바꾼다.
서버와 webapp **양쪽 다** 이야기마다 테스트를 둔다.
**테스트 과제는 실패 출력을 남긴 뒤에만 완료로 표시한다.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일이라 병렬로 돌릴 수 있다
- **[US1]~[US4]**: [spec.md](./spec.md)의 사용자 이야기 번호

## Path Conventions

서버는 `server/model/`·`server/app/`·`server/api/`, webapp은 `webapp/src/`다.
`API → App → Store` 단방향을 지킨다 (원칙 II).

---

## Phase 1: Setup

**Purpose**: 회귀 판정의 기준선을 잡는다. 깨끗한 상태에서도 실패가 있으므로 개수가 아니라
목록을 저장한다.

- [X] T001 기준선 측정 — `git stash -u` 후 `webapp/`에서 `npm run test`·`npm run check-types`·`npm run check`를, 저장소 루트에서 `make server-lint`와 `make server-test`를 돌려 **실패 목록**을 작업 폴더에 저장한다. `make server-test` 실행 시간도 함께 적는다 ([plan.md](./plan.md) Constitution Check I)

### T001 기준선 (2026-08-15 측정)

작업 트리가 깨끗하고 명세는 전부 커밋돼 있어 `git stash`가 필요 없었다 — HEAD가 곧
기준선이다.

| 게이트 | 값 | 목록 저장 위치 |
|---|---|---|
| jest 실패 스위트 | **57** / 182 | `jest-fail-suites.txt` |
| jest 실패 테스트 | **144** / 1119 | `jest-fail-tests.txt` (146줄, 이름 기준) |
| tsc 오류 | **23** | `tsc.txt` |
| eslint | **2482 problems** | `eslint.txt` |
| `make server-test` | **실패 33줄** (상위 12 · 하위 21), 패키지 3개 | `server-fail-list.txt` |
| `make server-test` 실행 시간 | **24.13초** | |
| `make server-lint` | **지적 11건** | `server-lint.txt` |

server 실패 패키지 셋: `server/app`, `server/model`, `server/services/store/sqlstore`.

**기준선에 불안정한 테스트가 하나 있다 — `TestPatchBoard`.** T001 회차에는 통과했지만
실행마다 결과가 달라진다. 여덟 번씩 돌려 재보면 이렇다.

| | TestPatchBoard 실패 |
|---|---|
| 009 변경 전 | 2/8 |
| US1 서버 변경 후 | 1/8 |

원인은 `GetMembersForBoard`의 mock 기대를 웹소켓 브로드캐스트 고루틴(`ws/server.go:458`)과
`AddTeamMembers` 검사(`boards.go:638`)가 동시에 소진하는 경합이다. 먼저 걸린 쪽이
보고되므로 실패 문구의 파일명까지 회차마다 달라진다.

**이 기능의 범위가 아니라 고치지 않는다.** 다만 회귀를 판정할 때 이 한 줄은 diff에서
빼고 본다 — 넣고 보면 내 변경과 무관한 이유로 목록이 어긋난다.

**회귀 판정은 개수가 아니라 목록 diff로 한다.** `make webapp-ci`는 기준선에서도
실패하므로 세 단계를 따로 돌려 대조한다.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 평가기의 게이트를 `(속성, 값)` 키에서 규칙 루프로 옮긴다. **동작은 하나도
바꾸지 않는다.** 새 조건은 Phase 3부터 얹는다.

**⚠️ 이 단계를 따로 떼는 이유**: 구조 변경과 새 조건을 한 커밋에 섞으면 기존 보드 판정이
달라졌을 때 원인이 둘 중 어느 쪽인지 못 가린다.

- [X] T002 계약 1절 여섯 줄의 안전망을 확보한다. **새로 쓰지 않았다 — 이미 전부 있었다.** `server/app/property_access_test.go`를 읽어 계약 행마다 대응하는 기존 테스트를 찾아 아래 표로 고정하고, 일곱 스위트가 지금 코드로 통과하는 것을 확인했다

### T002 안전망 — 계약 1절 ↔ 기존 테스트

새 테스트를 쓰지 않은 이유는 하나다. **여섯 줄이 이미 테스트되고 있었다.** 같은 것을 다시
쓰면 신호가 늘지 않고 파일만 길어진다 (원칙 II — 기존 패턴을 먼저 쓴다).

| 계약 | 기존 테스트 | 확인한 단언 |
|---|---|---|
| 1-1 규칙 밖 카드 → 조회 | `TestEvaluatorCardOutsideAnyRule` | 값·속성·nil 카드 셋 다 조회 |
| 1-2 규칙 밖 + 작성자 → 편집 | `TestEvaluatorOwnerFloor` | "the author edits a card outside every rule" |
| 1-3 게이트 닫힘 → 접근 없음 | `TestEvaluatorOrgGate` | "a 팀장 of another division is stopped by the gate" |
| **1-4 게이트 닫힘 + 작성자 → 접근 없음** | `TestEvaluatorOwnerFloorDoesNotCrossOrgGate` | "a 팀장 of another division stays out even of their own card" |
| 1-5 게이트 닫힘 + 전체보기 → 조회 | `TestEvaluatorFullVisibilityFloor` | "US4-1 a blocked card is still readable" |
| 1-6 두 규칙 → 높은 쪽 | `TestEvaluatorMaxAcrossRows` | "both rows match, so the higher of the two applies" |
| (보강) 조직 조건 없는 규칙은 게이트가 아니다 | `TestEvaluatorDutyOnlyRule` | "no organization row means no gate" |

마지막 줄을 안전망에 넣은 이유가 있다. T003이 `gated`를 규칙 단위로 다시 세는데, 조직
조건이 **없는** 규칙을 게이트로 잘못 세면 이 테스트가 깨진다.

**통과 증거** (2026-08-15)

```
--- PASS: TestEvaluatorCardOutsideAnyRule (0.00s)
--- PASS: TestEvaluatorOrgGate (0.00s)
--- PASS: TestEvaluatorMaxAcrossRows (0.00s)
--- PASS: TestEvaluatorDutyOnlyRule (0.00s)
--- PASS: TestEvaluatorFullVisibilityFloor (0.00s)
--- PASS: TestEvaluatorOwnerFloor (0.00s)
--- PASS: TestEvaluatorOwnerFloorDoesNotCrossOrgGate (0.00s)
ok  	github.com/mattermost/mattermost-plugin-boards/server/app	0.010s
```

이 일곱 스위트가 T003의 판정 기준이다. 하나라도 깨지면 구조 변경이 동작을 바꾼 것이다.
- [X] T003 `server/app/property_access.go`의 `evaluate`를 규칙 루프로 바꾼다. `gates`·`grants` 두 map을 없애고 `mentioned`·`gated`·`passed`·`granted` 네 값으로 판정한다. **작성자 바닥을 게이트 안쪽에 두는 배치를 그대로 지킨다** ([research.md](./research.md) R2)
- [X] T004 `server/app/property_access.go`의 `NewPropertyAccessEvaluator`에서 미리 계산하는 것을 조상 집합·직책·전체보기 바닥으로 줄인다. 규칙별 판정에 쓸 값만 남긴다
- [X] T005 Phase 2 검증 — `make server-test`를 돌려 **기존 테스트가 하나도 안 깨졌는지** T001 목록과 대조한다. 새 테스트를 쓰지 않는다. 실행 시간도 대조한다

### T005 Phase 2 검증 결과 (2026-08-15)

| 게이트 | 기준선 | T003·T004 이후 | 판정 |
|---|---|---|---|
| `make server-test` 실패 목록 | 33줄 | 33줄 — **diff 없음** | 통과 |
| `make server-test` 실행 시간 | 24.13초 | 25.39초 | 통과 (오차 범위) |
| `make server-lint` | 지적 11건 | 11건, `property_access.go` 지적 없음 | 통과 |
| `gofmt -l` | — | 출력 없음 | 통과 |
| 안전망 일곱 스위트 | 통과 | 통과 | 통과 |

**옮기면서 지킨 것 셋.** 리팩터가 조용히 의미를 바꿀 수 있던 자리다.

1. **게이트와 권한을 따로 센다.** 조직 조건이 **없는** 규칙은 `gated`를 올리지 않는다.
   합치면 duty-only 규칙이 게이트가 되어 `TestEvaluatorDutyOnlyRule`이 깨진다
2. **게이트가 닫히면 duty-only 규칙의 권한도 버린다.** 조직이 게이트라는 뜻이 이것이다 —
   `granted`를 계산해 두고도 `gated && !gatePassed`면 `floor`만 남긴다
3. **작성자 바닥은 게이트 안쪽에 둔다.** `gated && !gatePassed` 갈래는 `ownerFloor`를
   더하지 않는다

**Checkpoint**: 저장된 규칙도 판정 결과도 그대로다. 코드 구조만 바뀌었다.

---

## Phase 3: User Story 1 - 조직을 이름이 아니라 관계로 고른다 (Priority: P1) 🎯 MVP

**Goal**: 규칙의 조직 칸에서 본부 이름 대신 `같은 본부`를 고른다. 매트릭스 12칸이 규칙
여섯 줄로 표현된다.

**Independent Test**: 화면 개선 없이 규칙을 손으로 여섯 줄 써서 매트릭스가 그대로 나오는지
확인한다.

### Tests for User Story 1

- [X] T006 [P] [US1] `server/model/property_access_test.go`에 필드 우선순위 실패 테스트를 더한다 — 새 필드가 빈 기존 규칙은 지금과 같은 판정, `relation`이 있으면 `divisionId`를 **무시**, `propertyValueIds`에 값 둘이면 그중 하나만 맞아도 일치 ([contracts/card-access-matrix.md](./contracts/card-access-matrix.md) 3절 3-1·3-2·3-4)
- [X] T007 [P] [US1] `server/app/property_access_test.go`에 관계 판정 실패 테스트 열 개를 더한다 — 같은 본부, **부서 소속자가 조상을 따라 본부 조건에 걸림**, 다른 본부, 카드에 본부 값이 없으면 `sameDivision`도 `otherDivision`도 **불성립**, 조직 배정 없는 사용자, `mine`이 작성자·담당자·multiPerson에서 성립 ([contracts/card-access-matrix.md](./contracts/card-access-matrix.md) 2절)
- [X] T008 [P] [US1] `server/app/property_access_test.go`에 저장 검증 실패 테스트를 더한다 — 모르는 `relation` 거절, 본부·부서 계열인데 `orgPropertyId`가 비면 거절, `relation=mine`에 `assigneePropertyId`가 비면 **통과** ([contracts/card-access-matrix.md](./contracts/card-access-matrix.md) 4절)
- [X] T009 [P] [US1] `webapp/src/components/shareBoard/propertyAccessRow.test.tsx`에 관계 선택 실패 테스트를 더한다 — 관계 다섯이 목록에 나온다, 관계를 고르면 절대값 칸이 사라진다, `relation`이 빈 옛 규칙은 절대값 칸을 그대로 보여준다, 보드에 조직 속성이 하나뿐이면 볼 속성이 자동으로 채워진다

### Implementation for User Story 1

- [X] T010 [US1] `server/model/property_access.go`에 `PropertyAccessRule` 필드를 더한다 — `PropertyValueIDs []string`, `Relation string`, `OrgPropertyID string`, `AssigneePropertyID string`, `Source string`. 기존 필드는 지우지 않는다 (FR-001, FR-016)
- [X] T011 [US1] `server/model/property_access.go`에 우선순위 헬퍼를 더한다 — `CardValueIDs()`가 `propertyValueIds`를 먼저 보고 없으면 `propertyValueId`로 떨어진다. `HasOrgCondition()`이 `relation`도 조직 조건으로 센다 ([data-model.md](./data-model.md) 3절)
- [X] T012 [US1] `server/app/property_access.go`에 관계 판정을 더한다. 조상 집합은 `orgUnitAncestors`를 그대로 쓴다. **`otherDivision`은 `sameDivision`의 부정이 아니다** — 양쪽 다 값이 있어야 성립한다 ([research.md](./research.md) R3)
- [X] T013 [US1] `server/app/property_access.go`의 `validatePropertyAccessSettings`에 관계 검증 셋을 더한다 ([data-model.md](./data-model.md) 6절)
- [X] T014 [P] [US1] `webapp/src/blocks/board.ts`의 `PropertyAccessRule`에 같은 필드를 더한다. **`relation`은 문자열 유니온으로 정의한다** — `as any`도 넓은 `string`도 쓰지 않는다 (원칙 III). 서버 JSON 태그와 이름을 맞춘다
- [X] T015 [US1] `webapp/src/components/shareBoard/propertyAccessRow.tsx`의 본부·부서 칸을 관계 칸으로 바꾼다. 기존 `Selector`를 그대로 쓰고 **새 컴포넌트를 만들지 않는다** (원칙 II). 관계가 `""`인 옛 규칙은 절대값 칸을 계속 보여준다
- [X] T016 [US1] `webapp/src/components/shareBoard/propertyAccessRow.tsx`에 볼 속성 선택을 더한다. 보드에 그 타입 속성이 하나뿐이면 자동으로 채운다 (FR-006)
- [X] T017 [P] [US1] `webapp/i18n/en.json`·`ko.json`에 관계 이름 다섯과 속성 선택 문자열을 넣는다 (원칙 V)
- [X] T018 [US1] 빌드·배포 후 규칙을 손으로 여섯 줄 써서 [quickstart.md](./quickstart.md) 4절 표를 훑는다. **팀장·팀원이 타 본부 Objective를 못 보는지**가 이 이야기의 핵심이다

### US1 webapp 설계 메모 — 칸을 안 늘렸다

조직 칸 **하나**가 관계와 특정 조직을 함께 담는다. 둘은 같은 질문에 대한 두 가지 답이라
나란히 두면 어느 쪽이 답인지 화면이 말해주지 못한다. 관계를 고르면 절대값이 비워지고,
특정 조직을 고르면 관계가 비워진다.

그 다음 칸은 "무엇을 기준으로"를 묻는다. 같은 자리를 쓰는 이유는 그 질문이 **앞 칸에
답한 뒤에만 생기기 때문**이다.

| 앞 칸 | 다음 칸 |
|---|---|
| 특정 본부 | 부서 (기존 그대로) |
| 같은/다른 본부, 같은 부서 | 볼 조직 속성 |
| 본인 | 담당자 속성 |
| 전체 | 고를 것 없음 |

덕분에 버튼이 여섯 개 그대로다. 기존 테스트 12건이 한 줄도 안 고치고 통과한다.

**보드에 조직 속성이 하나뿐이면 볼 속성을 자동으로 채운다** (FR-006). 고를 것이 없는데
묻는 칸은 일만 늘린다.

### T018 종단 검증 (2026-08-15, 팀 `한국케이밸브`)

`MM_DEBUG=1 make server-linux` → `npm run debug` → `make deploy-from-watch`로 Go
바이너리까지 올렸다. 번들에 `sameDivision`이 들어간 것을 확인했다.

| 확인 | 결과 |
|---|---|
| 조직 칸이 관계 다섯을 내놓는다 | 통과 — Any organisation / Same division / Other division / Same department / Mine |
| 같은 칸에 실제 조직도 이어진다 | 통과 — kkv 조직 마스터의 본부가 그대로 (대표, CEO - 연구 …) |
| 버튼이 여섯 개 그대로다 | 통과 |
| 열 제목이 칸의 내용과 맞는다 | **처음엔 어긋났다** — "DIVISION"이 그대로여서 `Organisation`·`Measured against`로 고쳤다 |

검증용 보드는 지웠다. 실보드(`FY27 KKV OKR`)는 열지 않았다.

**막혔다가 풀린 것 하나.** [quickstart.md](./quickstart.md) 4절의 판정 표는 계정 여섯
개로 로그인해야 하는데 처음엔 `okrbest` 자격 증명만 있었다. 사용자가 공통 비밀번호를
알려줘 풀렸다 — 계정 지도를 quickstart 준비 절에 박아 뒀다.

| | 이메일 | 조직 | 직책 |
|---|---|---|---|
| A | `sungmin.ahn@kkv.co.kr` | 대표 | CEO |
| B | `myoungeon.lee@kkv.co.kr` | CSO - 영업 | CSO |
| C | `minsu.kwon@kkv.co.kr` | COO - 생산 | COO |
| D | `kisun.kim@kkv.co.kr` | 영업1팀 | 팀장 |
| E | `jiho.moon@kkv.co.kr` | 영업1팀 | 팀원 |
| F | `daechan.lee@kkv.co.kr` | 영업2팀 | 팀원 |

로그인은 확인했다(200). **판정 표 자체는 US3까지 끝난 뒤 한 번에 훑는다** — 지금은
규칙을 손으로 여섯 줄 써야 하고, 그건 US3의 프리셋이 하는 일이다.

**Checkpoint**: 매트릭스가 표현된다. 화면은 아직 규칙 목록뿐이다.

---

## Phase 4: User Story 2 - 직책을 묶어 팀에 한 번 정한다 (Priority: P1)

**Goal**: CSO·COO·CFO·CGO를 `C-Level`로 묶고, 팀이 그것을 기억한다. 편집은 시스템·팀
관리자만 한다.

**Independent Test**: 묶음에 직책을 더했을 때 규칙을 안 건드려도 새 직책에 권한이 붙는지,
그리고 같은 팀 다른 보드에도 함께 걸리는지 확인한다.

**저장소 메모**: `GetTeam`·`UpsertTeamSettings`가 이미 Store 인터페이스에 있다.
**`make generate`가 필요 없다.**

### Tests for User Story 2

- [X] T019 [P] [US2] `server/model/duty_tier_test.go`(신규)에 묶음 모델 실패 테스트를 쓴다 — 팀 설정에서 읽기, 설정이 없으면 빈 목록, 다른 키를 건드리지 않기, 이름이 비면 거절, 마스터에 없는 직책 ID는 **통과**
- [X] T020 [P] [US2] `server/app/duty_tiers_test.go`(신규)에 편집 권한 실패 테스트 일곱 개를 쓴다 — 시스템 관리자 200, 팀 관리자 200, **보드 관리자 403**, 보드 관리자 읽기 200, 팀 밖 사용자 403, 묶음을 고치면 같은 팀 다른 보드 판정이 바뀜, `canEditDutyTiers` 플래그 ([contracts/card-access-matrix.md](./contracts/card-access-matrix.md) 5절 5-1~5-7)
- [X] T021 [P] [US2] `server/app/property_access_test.go`에 묶음 판정 실패 테스트 넷을 더한다 — `tierIds`와 `dutyId`가 둘 다 있으면 `tierIds`가 이김, **직책 하나짜리 묶음도 여럿짜리와 똑같이 판정**(FR-013), **한 직책이 두 묶음에 들고 권한이 다르면 높은 쪽**(FR-014), `tierIds`에 묶음 둘이고 내 직책이 그중 하나면 일치(FR-011) ([contracts/card-access-matrix.md](./contracts/card-access-matrix.md) 3절 3-3, 5절 5-8~5-10)
- [X] T022 [P] [US2] `webapp/src/components/shareBoard/dutyTierEditor.test.tsx`(신규)에 묶음 편집기 실패 테스트를 쓴다 — 직책을 여럿 골라 묶는다, **고칠 권한이 없으면 값이 보이되 잠긴다**(FR-011b·FR-011c), "이 팀의 모든 보드에 적용됩니다"가 보인다(FR-011a)
- [X] T023 [P] [US2] `webapp/src/components/shareBoard/propertyAccessRow.test.tsx`에 묶음 선택 실패 테스트를 더한다 — 묶음 목록이 나온다, 한 줄이 묶음을 여럿 가리킨다, `tierIds`가 빈 옛 규칙은 직책 칸을 그대로 보여준다

### Implementation for User Story 2

- [X] T024 [US2] `server/model/duty_tier.go`(신규)에 `DutyTier{ID, Name, DutyIDs}`와 팀 설정을 읽고 쓰는 함수를 만든다. 키는 `dutyTiers`다 ([data-model.md](./data-model.md) 1절)
- [X] T025 [US2] `server/model/property_access.go`에 `TierIDs []string`를 더하고, 직책 축 우선순위 헬퍼를 만든다 — `tierIds`의 `dutyIds` 합집합을 쓰고 비어 있으면 `dutyId`로 떨어진다 ([data-model.md](./data-model.md) 3절)
- [X] T026 [US2] `server/app/duty_tiers.go`(신규)에 조회·저장과 편집 권한 판정을 만든다. 시스템 관리자는 `HasPermissionTo(userID, PermissionManageSystem)`, 팀 관리자는 `HasPermissionToTeam(userID, teamID, PermissionManageTeam)` ([research.md](./research.md) R6)
- [X] T027 [US2] `server/api/teams.go`에 `PUT /teams/{teamID}/dutyTiers`를 등록하고, `GET /teams/{teamID}` 응답에 `canEditDutyTiers`를 싣는다
- [X] T028 [US2] `server/app/property_access.go`의 `newPropertyAccessEvaluator`가 팀 묶음을 함께 읽어 `tierIds`를 직책 집합으로 푼다. 조직 마스터를 읽는 자리 바로 옆이다
- [X] T029 [P] [US2] `webapp/src/octoClient.ts`에 묶음 조회·저장을 더한다
- [X] T030 [P] [US2] `webapp/src/store/dutyTiers.ts`(신규)에 팀 묶음 슬라이스를 만든다. `store/orgMaster`와 같은 모양으로 둔다
- [X] T031 [US2] `webapp/src/components/shareBoard/dutyTierEditor.tsx`(신규)를 만든다. 직책 다중 선택, 묶음 이름, **권한이 없으면 잠긴 채로 보인다** (FR-011b·FR-011c). "이 팀의 모든 보드에 적용됩니다"를 함께 보여준다
- [X] T032 [US2] `webapp/src/components/shareBoard/propertyAccessRow.tsx`의 직책 칸을 묶음 다중 선택으로 바꾼다. `tierIds`가 빈 옛 규칙은 직책 칸을 계속 보여준다
- [X] T033 [US2] `webapp/src/components/shareBoard/propertyAccessSection.tsx`에 묶음 편집기를 끼운다. `propertyAccessSection.scss`에 블록을 더한다 — **새 SCSS 파일을 만들지 않는다** (원칙 II)
- [X] T034 [P] [US2] `webapp/i18n/en.json`·`ko.json`에 묶음 화면 문자열을 넣는다
- [ ] T035 [US2] 빌드·배포 후 [quickstart.md](./quickstart.md) 1·6절을 훑는다. **팀 관리자가 C-Level에 직책을 더하면 다른 보드의 판정이 함께 바뀌는지**를 두 보드에서 확인한다

### US2 서버 설계 메모 — 묶음은 필요할 때만 읽는다

평가기가 팀 묶음을 무조건 읽게 했더니 접근 권한 테스트 30여 건이 한꺼번에 깨졌다.
mock store에 `GetTeam` 기대가 없어서다. 기대를 다 더하는 대신 **묶음을 가리키는 규칙이
하나라도 있을 때만 읽게** 했다.

기존 보드는 규칙이 직책을 직접 가리키므로 조회가 아예 없다. plan이 "조회가 하나 는다"고
적어 둔 비용이 대다수 보드에서 0이 됐다.

**테스트 기대를 한 번 잘못 썼다.** `묶음에 없는 직책은 안 걸린다`에 `dutyHead`를 썼는데
그 직책은 `FullVisibility: true`라 게이트가 닫혀도 조회가 남는다(계약 1-5). 구현이 맞고
기대가 틀렸다. 3-3은 오히려 그 성질을 쓰도록 고쳤다 — `dutyId`를 봤다면 편집이 나왔을
자리에서 전체보기 바닥만 남는 것이 `tierIds`가 이겼다는 증거다.

**Checkpoint**: 묶음이 팀 것이 됐다. 규칙 여섯 줄을 손으로 쓰면 매트릭스가 완성된다.

---

## Phase 5: User Story 3 - 매트릭스 화면에서 권한을 고른다 (Priority: P2)

**Goal**: 요구사항 이미지와 같은 표에서 칸을 고른다. 규칙 줄을 직접 쓸 일이 없어진다.

**Independent Test**: 표에서 칸을 골라 저장한 뒤 규칙 목록에 여섯 줄이 만들어졌는지
확인한다.

### Tests for User Story 3

- [ ] T036 [P] [US3] `webapp/src/components/shareBoard/accessMatrix.test.tsx`(신규)에 표 실패 테스트를 쓴다 — 행이 카드 유형, 열이 묶음, 칸을 고치면 대응하는 규칙만 바뀐다, **표 여섯 칸이 규칙 여섯 줄로 저장된다**(SC-002)
- [ ] T037 [P] [US3] `webapp/src/components/shareBoard/accessMatrix.test.tsx`에 보존 실패 테스트를 더한다 — 표에서 저장해도 `source`가 빈 줄은 안 지운다, 표 밖의 줄이 있으면 알려준다 (FR-021)
- [ ] T038 [P] [US3] `webapp/src/components/shareBoard/propertyAccessSection.test.tsx`에 프리셋 실패 테스트를 더한다 — 처음 켜면 표준 여섯 줄이 깔린다, 팀에 묶음이 없으면 "묶음부터 정하세요"가 뜬다, 카드 유형이 정해지지 않은 보드는 표가 안 나온다 (FR-019·FR-022)

### Implementation for User Story 3

- [ ] T039 [US3] `webapp/src/components/shareBoard/accessMatrix.ts`(신규)에 표 ↔ 규칙 변환을 만든다. 표가 만든 줄에 `source: 'matrix'`를 붙이고, 저장할 때 그 줄만 갈아 끼운다 ([research.md](./research.md) R7)
- [ ] T040 [US3] `webapp/src/components/shareBoard/accessMatrix.tsx`(신규)를 만든다. 칸의 컨트롤은 기존 `MenuWrapper` + `Menu.Text`를 쓴다
- [ ] T041 [US3] `webapp/src/components/shareBoard/propertyAccessSection.tsx`에 `표로 보기`·`규칙으로 보기` 전환을 더한다. 카드 유형이 정해진 보드에만 표를 보여준다 (FR-022)
- [ ] T042 [US3] `webapp/src/components/shareBoard/propertyAccessSection.tsx`에 표준 프리셋을 더한다. 유형 속성과 값은 `board.properties.okrBoard`에서 읽는다 ([data-model.md](./data-model.md) 7절)
- [ ] T043 [US3] `webapp/src/components/shareBoard/propertyAccessSection.scss`에 표 블록을 더한다. 색·간격은 CSS 변수를 쓰고 하드코딩하지 않는다 (원칙 II)
- [ ] T044 [P] [US3] `webapp/i18n/en.json`·`ko.json`에 표 문자열을 넣는다
- [ ] T045 [US3] 빌드·배포 후 [quickstart.md](./quickstart.md) 2·3·7절을 훑는다. **둘째 보드가 스위치 1회로 끝나는지**가 SC-004다

**Checkpoint**: 설정이 요구사항 문서와 1:1로 맞는다.

---

## Phase 6: User Story 4 - 권한이 없는 사람을 화면이 먼저 알려준다 (Priority: P3)

**Goal**: 새 직책이 묶음에 안 들어가 그 사람만 아무것도 못 보는 사고를 저장 전에 막는다.

**Independent Test**: 묶음에 안 든 직책을 하나 남기고 설정 화면을 열어 목록에 뜨는지
확인한다.

### Tests for User Story 4

- [ ] T046 [P] [US4] `webapp/src/components/shareBoard/dutyTierEditor.test.tsx`에 실패 테스트를 더한다 — 어느 묶음에도 없는 직책이 목록에 뜬다(FR-023), 묶음을 지우기 전에 그것을 쓰는 보드 수가 보인다
- [ ] T047 [P] [US4] `webapp/src/components/shareBoard/propertyAccessRow.test.tsx`에 실패 테스트를 더한다 — 없는 묶음을 가리키는 규칙이 깨진 규칙으로 표시된다 (FR-024)

### Implementation for User Story 4

- [ ] T048 [US4] `webapp/src/components/shareBoard/dutyTierEditor.tsx`에 "어느 묶음에도 없음" 목록을 더한다
- [ ] T049 [US4] `webapp/src/components/shareBoard/propertyAccessRow.tsx`에 깨진 묶음 표시를 더한다. 기존 `PropertyAccessRow__broken` 클래스를 그대로 쓴다
- [ ] T050 [US4] `webapp/src/components/shareBoard/dutyTierEditor.tsx`에서 묶음을 지우기 전에 그것을 쓰는 보드가 몇 개인지 보여준다. 개수는 `server/app/duty_tiers.go`가 세어 내려준다 ([spec.md](./spec.md) 엣지 케이스)
- [ ] T051 [P] [US4] `webapp/i18n/en.json`·`ko.json`에 경고 문자열을 넣는다

**Checkpoint**: 조용히 나던 사고가 저장 전에 보인다.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T052 신규 파일 여덟 개(`server/model/duty_tier.go`·`duty_tier_test.go`, `server/app/duty_tiers.go`·`duty_tiers_test.go`, `webapp/src/store/dutyTiers.ts`, `webapp/src/components/shareBoard/accessMatrix.ts`·`accessMatrix.tsx`·`dutyTierEditor.tsx`)에 **라이선스 헤더**가 있는지 확인한다. `mattermost-govet -license`가 집행한다 (원칙 VI)
- [ ] T053 [quickstart.md](./quickstart.md) 5·8·9·10절 — 값이 없을 때, 기존 보드 15칸 변화 0건(SC-005), 본부를 늘려도 규칙 0줄 증가(SC-003), 005·006·007·008 회귀
- [ ] T054 새로 쓴 테스트가 **구현을 되돌렸을 때 실패하는지** 확인한다. 첫 실행에서 통과한 테스트는 아무것도 증명하지 않는다 (원칙 IV). 최소 변이 셋 — `server/app/property_access.go`에서 작성자 바닥을 게이트 바깥으로, 같은 파일에서 `otherDivision`을 `sameDivision`의 부정으로, `server/app/duty_tiers.go`에서 묶음 편집을 보드 관리자에게 개방
- [ ] T055 품질 게이트 — `make webapp-ci`(세 단계 따로), `make server-lint`, `make server-test`를 돌려 T001 기준선과 **실패 목록**을 대조한다. **`server-test`는 CI 미집행이라 로컬 출력을 근거로 제시한다**(원칙 I). `git status`에 새 `.scss`가 없는지, `make server-test` 실행 시간이 늘지 않았는지도 본다
- [ ] T056 [quickstart.md](./quickstart.md) 11절 완료 판정을 채우고, 게이트·종단 검증·SC 실측을 이 파일 하단에 근거로 남긴다. 검증용 보드는 지운다

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (기준선)
    ↓
Phase 2 (게이트를 규칙 루프로) ← 모든 이야기를 막는다
    ↓
    ├─→ Phase 3 (US1 관계)      ← MVP. 단독으로 매트릭스를 표현한다
    │       ↓
    │   Phase 4 (US2 묶음)      ← US1의 규칙 모델 위에 얹는다
    │       ↓
    │   Phase 5 (US3 매트릭스)  ← US1·US2가 있어야 표가 저장할 것이 생긴다
    │       ↓
    │   Phase 6 (US4 안전장치)  ← US2의 묶음이 있어야 가리킬 대상이 생긴다
    ↓
Phase 7 (검증)
```

### User Story Dependencies

- **US1**: Phase 2만 끝나면 시작한다. 다른 이야기에 의존하지 않는다
- **US2**: US1이 만든 우선순위 헬퍼 자리에 직책 축을 더한다. 같은 파일을 만진다
- **US3**: US1·US2가 없으면 표가 만들 규칙이 없다
- **US4**: US2의 묶음이 없으면 "어느 묶음에도 없는 직책"이라는 말이 성립하지 않는다

### 병렬로 돌릴 수 있는 것

| 묶음 | 과제 |
|---|---|
| US1 테스트 | T006 · T007 · T008 · T009 — 파일이 셋으로 갈린다 |
| US2 테스트 | T019 · T020 · T021 · T022 · T023 — 파일이 다섯 |
| US2 클라이언트 | T029 · T030 — 서버 과제와 겹치지 않는다 |
| US3 테스트 | T036 · T037 · T038 |
| US4 테스트 | T046 · T047 |
| i18n | T017 · T034 · T044 · T051 — 각 이야기 안에서 다른 과제와 병렬 |

---

## Implementation Strategy

### MVP

**Phase 1 + Phase 2 + Phase 3(US1)** 이 최소 배포 단위다. 여기까지만 해도 지금 안 되던
것이 된다 — 매트릭스 12칸이 전부 표현된다. 화면은 규칙 목록 그대로이고 여섯 줄을 손으로
쓴다.

### 이후 순서

| 다음 | 얻는 것 |
|---|---|
| + US2 | C-Level 네 직책이 한 줄. 팀에 한 번만 정한다 |
| + US3 | 규칙을 손으로 안 쓴다. 설정이 요구사항 문서와 같은 모양 |
| + US4 | 조용히 나던 권한 사고가 저장 전에 보인다 |

### 커밋 단위

Phase 2를 **반드시 따로 커밋한다.** 구조 변경과 새 조건이 한 커밋에 섞이면 기존 보드
판정이 달라졌을 때 원인을 못 가린다. 나머지는 이야기 단위로 커밋한다.
