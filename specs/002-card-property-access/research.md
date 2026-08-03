# Phase 0 Research: 속성 기준 카드 접근 권한

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-08-03

명세의 Technical Context에 미해결(NEEDS CLARIFICATION) 항목은 없다. brainstorming 단계에서 결정 17건을 확정했기 때문이다. 이 문서는 그 결정들의 근거와 기각한 대안을 남긴다. 조사는 실제 로컬 개발 DB와 저장소 코드에서 확인한 사실에 기반한다.

---

## R1. 규칙 저장 위치

**Decision**: `focalboard_boards.properties` JSON 컬럼에 `propertyAccess` 키를 추가한다. 신규 테이블과 마이그레이션을 만들지 않는다.

**Rationale**:

- DB 마이그레이션이 없으므로 constitution 원칙 VII(3방언 대응, `.down.sql` 제약)의 부담을 지지 않는다.
- 보드 복제·템플릿화·아카이브 내보내기가 `properties`를 통째로 복사하므로 규칙이 **자동으로 따라간다**. 별도 처리가 필요 없다(FR-012).
- 이 저장소가 2026-07-31에 제거한 ACL이 전용 테이블 방식이었고, 그 비용(3방언 마이그레이션 + 복제·템플릿·아카이브 경로 개별 처리)을 실제로 치렀다.

**Alternatives considered**:

- **전용 테이블 `focalboard_property_access_rules`** — 규칙 조회·감사·이력이 쉽다. 기각 이유: 이번 범위에 변경 이력이 없고(마지막 변경자만 기록), 마이그레이션과 복제 경로 비용이 이득을 넘는다. 규칙 수가 실사용에서 문제가 될 규모로 늘면 그때 옮긴다 — 평가기는 그대로 쓰고 저장 위치만 바뀐다.
- **보드와 분리된 설정 문서** — 보드 복제 시 따라가지 않아 FR-012를 만족하지 못한다.

**확인한 사실**: 현재 이 보드의 `properties`에 `card_acl_rules`·`card_acl_enabled`·`card_acl_org_map`·`board_owner_user_id` 키가 남아 있으나 코드 참조는 0건이다. 제거된 ACL 작업의 잔재이며 이 작업에서 정리한다.

---

## R2. 필터링을 어디서 수행하는가

**Decision**: 조회 후 **메모리에서** 필터링한다. 속성값 조건을 SQL로 밀어넣지 않는다.

**Rationale**:

- 카드 속성값은 `focalboard_blocks.fields`에 저장되며 컬럼 타입이 **`json`**(jsonb 아님)이다. PostgreSQL에서 GIN 인덱스나 `@>` 연산자를 그대로 쓸 수 없다.
- 이 저장소는 PostgreSQL·MySQL·SQLite 3방언을 지원한다(constitution VII). JSON 경로 질의 문법이 방언마다 달라 분기가 커진다.
- `GET /boards/{id}/blocks`는 이미 보드의 블록 전체를 로드한다. 그 뒤에 필터를 얹는 추가 비용은 카드 수에 선형이며, 실사용 규모(수십~수천)에서 무시할 수 있다.

**Alternatives considered**:

- **SQL WHERE 절로 밀어넣기** — 대형 보드에서 전송량을 줄일 수 있다. 기각 이유: 3방언 JSON 질의 분기 비용이 크고, `json` 타입이라 인덱스 이득도 없다.
- **허용 카드 ID를 미리 계산해 IN 절로 제한** — 결국 전체 카드를 읽어 속성값을 봐야 ID를 얻으므로 이득이 없다.

---

## R3. 성능 — 카드당 판정 비용

**Decision**: 요청당 사용자별로 **허용 맵을 1회 선계산**하고, 카드 판정은 맵 조회로 처리한다.

**Rationale**:

- 나이브하게 하면 카드 N개 × 규칙 M개 순회다. 규칙 100개·카드 1,000개면 10만 회 비교이며, 웹소켓에서는 수신자 수만큼 곱해진다.
- 사용자 조직·직책은 요청 안에서 고정이므로, 규칙을 한 번 훑어 "이 사용자에게 허용되는 `(속성ID, 값ID) → 권한`" 맵을 만들면 카드당 판정이 O(카드의 속성 수)로 떨어진다.
- 조직 조상 집합과 직책 코드 조회도 평가기 생성 시 1회로 묶인다.

**Alternatives considered**:

- **매 카드마다 전체 규칙 순회** — 구현이 단순하다. 기각 이유: 웹소켓 수신자별 판정에서 비용이 곱해져 SC-006을 위협한다.
- **결과 캐싱(보드×사용자→허용 카드 ID 집합)** — 더 빠르지만 카드 속성이 바뀔 때마다 무효화해야 해서 정합성 위험이 커진다. 선계산만으로 목표를 만족하므로 도입하지 않는다.

**웹소켓 특이사항**: 블록 변경 1건 × 수신자 N명이므로 평가기를 사용자별로 캐시하고, 보드의 `propertyAccess`가 바뀌면 그 보드 캐시를 버린다.

---

## R4. 평가기를 어느 레이어에 두는가

**Decision**: `server/app/property_access.go`에 사용자 컨텍스트를 받는 평가기를 두고, 블록을 반환·변경하는 모든 경로가 이를 거치게 한다.

**Rationale**:

- constitution II(레이어 경계)가 `API → App → Store` 단방향을 요구한다. 권한 판정은 `app` 계층의 책임이다.
- 현재 `app.GetBlocks(boardID, parentID, blockType)`는 **userID를 받지 않는다**. 그대로는 필터를 걸 자리가 없다. 사용자 컨텍스트를 받는 진입점을 추가해야 한다.
- 관문을 하나로 모으면 "어느 경로에서 필터를 빠뜨렸다"는 사고를 구조적으로 줄인다. FR-031(서버 전면 집행)의 검증 대상이 한 곳에 모인다.

**Alternatives considered**:

- **`server/api/` 핸들러마다 필터** — 세션에서 userID를 바로 얻을 수 있어 손쉽다. 기각 이유: 호출 지점이 흩어져 누락 위험이 크고, 원칙 II상 권한 판정이 API 계층에 내려온다.
- **store 계층에서 필터** — 사용자 개념이 store에 새어 들어가 레이어 경계를 흐린다.

---

## R5. 조직 데이터 바인딩

**Decision**: 사용자 조직 정보는 메인 서버가 소유한 `UserOrgProfiles` 테이블에서 읽는다. 본부·부서는 `OrgUnits.id`, 직책은 `PositionDefinitions.id`로 규칙에 저장한다. 직책은 `kind='duty'`만 쓴다. 본부 판정은 사용자 소속에서 루트까지 조상을 모아 포함 여부를 본다.

**Rationale** (메인 서버 `okrbest/okrbest` 코드와 로컬 DB에서 확인):

- 조직 관리(Org Role Management)는 **메인 서버가 소유한 정식 서브시스템**이다.
  - 모델: `server/public/model/org_role.go` — `OrgUnit`, `PositionDefinition`, `UserOrgProfile`, `UserOrgProfileSummary`, `OrgRoleAuditLog`
  - API: `server/channels/api4/team.go` — `/api/v4/teams/{team_id}/positions`, `/org-units`, `/users/{id}/org-profile`, `/org-profiles`, `/org-role-audit`
  - 기능 플래그: `FeatureFlags.EnableOrgRoleManagement` (기본 켜짐, 꺼지면 501)

- `UserOrgProfiles`가 사용자 소속의 정본이다. PK `(TeamID, UserID)`.

  | 컬럼 | 참조 | 용도 |
  |---|---|---|
  | `PrimaryOrgUnitID` | `OrgUnits.id` | 소속 조직(대개 부서) |
  | `PrimaryDutyID` | `PositionDefinitions.id` (`kind='duty'`) | **직책** |
  | `PrimaryPositionID` | `PositionDefinitions.id` (`kind='position'`) | 직위 — 이 기능은 쓰지 않는다 |
  | `ExtraPositions` | JSON 배열 | 부가 직위 — 쓰지 않는다 |
  | `EffectiveFrom` / `EffectiveTo` | 밀리초 | 유효기간 |

  **직책과 직위가 컬럼으로 이미 분리돼 있다.** `PrimaryDutyID`만 읽으면 직위가 섞이지 않으므로 code 접두사로 `kind`를 추론할 필요가 없다.

- `PositionDefinitions.kind`가 `duty`(직책: CEO·고문·본부장·팀장)와 `position`(직위: 부회장~사원)을 한 테이블에서 구분한다. 메인 서버 모델 주석이 이를 명시한다.
- `OrgUnits.type`이 `division`(본부, 4개)과 `department`(부서, 10개)로 나뉘고 `parentid`로 연결된다. 사용자는 대개 부서에 배정되므로 본부 조건은 계층을 올라가 판정한다(FR-017). 현재 2단계지만 일반형으로 구현한다.
- `PositionDefinitions.fullvisibility`가 "보드 전체보기"다. `duty` 중 CEO와 본부장에 켜져 있다.

**유효기간**: `EffectiveFrom`/`EffectiveTo`가 설정된 행은 현재 시각이 그 구간 안일 때만 유효하다. 값이 0이면 무제한으로 본다. 인사 발령 예약이 쓰이기 시작하면 미리 권한이 새는 것을 막는다.

**Alternatives considered**:

- **Mattermost `users.props`의 `org_unit_ids`·`position_codes`** — 초기 설계안이었다. 기각 이유: 커버리지가 낮고(조직 11명, 직책 1명 — 그마저 직위였다), 직책과 직위가 한 필드에 섞이며, 팀 스코프가 없고, 조직은 id·직책은 code로 바인딩이 비대칭이다. `UserOrgProfiles`는 이 넷을 모두 해결한다(조직 15명, 직책 9명 — 본부장 3·팀장 6).
- **메인 서버 조직 API 호출** — 스키마 소유권을 존중한다. 기각 이유는 R5.1 참조.

### R5.1 왜 메인 서버 API를 부르지 않는가

플러그인은 메인 서버와 **같은 DB를 공유**하며, 이 저장소는 이미 Mattermost 소유 테이블을 직접 읽는다 — `sqlstore/user.go`의 `baseUserQuery`가 `Users`를, `searchUsersByTeam`이 `TeamMembers`를 직접 SELECT 한다. 조직 마스터 조회도 같은 계열이다.

메인 서버 API를 쓸 수 없는 실제 이유는 셋이다.

1. **권한 기준이 안 맞는다.** `getTeamPositions`·`getTeamOrgUnits`가 `requireOrgRoleManagement`를 요구한다 — `PermissionSysconsoleReadUserManagementTeams` 또는 `PermissionManageTeamRoles`, 즉 **팀 관리자 이상**. 규칙 편집은 **보드 관리자**(`ManageBoardRoles`)면 열려야 하고 보드 관리자가 팀 관리자가 아닌 경우가 일반적이다.
2. **`org-profile-summary`는 이름만 준다.** `division_name`·`duty_name` 같은 표시용 문자열뿐이고 id가 없다. 판정에는 id가 필요하다.
3. **타인의 조직 정보를 세션 권한으로 못 읽는다.** 웹소켓 수신자별 판정은 다른 사용자의 소속을 서버가 알아야 하는데 `/org-profiles`는 관리자 전용이다.

플러그인이 자기 서버에 HTTP로 되묻는 구조 자체도 불필요하다.

**단, 스키마 소유권은 메인 서버에 있다.** 이 기능은 세 테이블을 **읽기 전용**으로만 쓰고 쓰기·마이그레이션을 하지 않는다. 장기적으로 필요한 메인 서버 개선은 `docs/upstream-org-role-requests.md`에 남긴다.

---

## R6. 판정 알고리즘

**Decision**: 조직은 **관문**, 직책은 **가산**, 전체보기는 **하한**.

```
1. U가 보드 관리자 또는 시스템 관리자          → manage 확정 (종료)
2. 하한 = U의 직책(kind='duty') 중 fullvisibility가 있으면 열람자, 없으면 없음
3. 적용후보 = 카드조건이 C와 맞는 규칙 행 전부
   if 적용후보 = ∅        → return max(보드 권한, 하한)
   조직행 = 적용후보 중 본부 또는 부서가 지정된 행
   if 조직행 ≠ ∅ and (조직 조건만 봤을 때 U와 맞는 조직행이 없음):
       규칙권한 = 없음                                    # 관문
   else:
       내행 = 적용후보 중 지정된 사용자조건이 모두 U와 맞는 행
       규칙권한 = (내행 = ∅) ? 없음 : max(내행의 권한)
4. return max(규칙권한, 하한)
```

관문 판정에서는 그 행의 **조직 조건만** 본다. 같은 행에 직책이 함께 걸려 있어도 관문 통과 여부에는 영향을 주지 않는다.

**Rationale**: 단순 max만 쓰면 조직 조건이 없는 행이 누수 통로가 된다. `본부=전략 → 열람자` / `직책=본부장 → 편집자` 두 행이 있을 때, 생산본부 본부장이 전략 카드를 편집하게 된다. 조직을 관문으로 두면 막힌다. 반대로 직책까지 관문으로 만들면 직책 없는 소속원이 아무 권한도 못 받아 "소속만으로 열람"이 표현되지 않는다.

**Alternatives considered**:

- **전 축 max** — 가장 단순하다. 기각 이유: 위 누수.
- **전 축 min(모든 축을 AND로 좁힘)** — 가장 엄격하다. 기각 이유: 같은 조직 안에서 직책으로 권한을 **올리는** 표현이 불가능해진다.
- **행마다 조직·직책을 모두 필수 지정** — 누수는 막힌다. 기각 이유: 규칙 수가 조직 × 직책으로 곱해져 관리가 불가능해진다.

### 판정표 (평가기 단위 테스트의 기준)

규칙:

```
행1   카드: C-Level=전략   사용자: 본부=전략      권한: 열람자
행2   카드: C-Level=전략   사용자: 직책=본부장    권한: 편집자
```

| 사용자 | 카드 | 관문 | 내행 | 하한 | 결과 |
|---|---|---|---|---|---|
| 전략본부 본부장 | C-Level=전략 | 통과 | 행1+행2 | 열람자 | **편집자** |
| 전략본부 팀장 | C-Level=전략 | 통과 | 행1 | 없음 | **열람자** |
| 생산본부 본부장 | C-Level=전략 | 차단 | — | 열람자 | **열람자** |
| 생산본부 팀장 | C-Level=전략 | 차단 | — | 없음 | **접근 불가** |
| 조직정보 없음 | C-Level=전략 | 차단 | — | 없음 | **접근 불가** |
| 보드 관리자 | C-Level=전략 | — | — | — | **manage** |
| 전략본부 팀장 | C-Level=생산 | 해당 없음 | — | 없음 | **보드 권한** |
| 생산본부 팀장 | C-Level 비어 있음 | 해당 없음 | — | 없음 | **보드 권한** |
| 어느 사용자든 | 임의 (스위치 꺼짐) | 평가 안 함 | — | — | **보드 권한** |

---

## R7. 집행 지점 목록

**Decision**: 아래 여섯 경로 전부에서 집행한다. 클라이언트 표시 수준의 숨김은 집행으로 인정하지 않는다.

| 경로 | 조치 | 대응 FR |
|---|---|---|
| 블록 조회 (`GET /boards/{id}/blocks`) | 권한 없는 카드와 그 자식 블록 제거 | FR-025, FR-026 |
| 카드 조회 (`/cards`, `/cards/by-ids`) | 동일 | FR-025 |
| 블록 수정·삭제 | 대상 카드 권한이 편집 미만이면 거부 | FR-027 |
| 블록 생성 | 보드 권한으로 허용 (규칙 미적용) | FR-032 |
| 검색 | 결과에서 제거 | FR-028 |
| 실시간 브로드캐스트 | 수신자별 판정 후 제외 | FR-029 |

**Rationale**: 카드만 지우고 자식 블록(설명·댓글·첨부)을 남기면 내용이 그대로 샌다. `GET /blocks`는 카드와 자식을 한 응답에 담으므로 같은 필터에서 함께 처리한다.

내보내기(FR-030)와 칼럼·그룹 집계는 클라이언트가 **로드된 카드로** 만들므로, 조회 경로가 걸러지면 자동으로 반영된다. 별도 조치가 필요 없다.

**Alternatives considered**:

- **읽기 경로만 집행하고 쓰기·검색·웹소켓은 후속** — 범위가 작다. 기각 이유: 그 상태는 격리처럼 보이지만 보안이 아니다. 명세 User Story 2가 이를 P2로 못박았다. 단계적으로 구현하되 부분 배포 시 그 사실을 명시한다.

---

## R8. 신규 서버 조회 경로

**Decision**: 조직 마스터 조회 경로 두 개를 새로 만든다. 제거된 ACL의 경로를 되살리지 않고, 이 화면이 필요로 하는 최소한만 정의한다.

```
GET /teams/{teamID}/org-units    본부·부서 목록 (활성만)
GET /teams/{teamID}/duties       직책 목록 (kind='duty', 활성만)
```

규칙 저장은 보드 패치(`PATCH /boards/{boardID}`)의 `properties`로 흐르므로 별도 엔드포인트를 만들지 않는다.

**Rationale**: 규칙을 별도 엔드포인트로 관리하면 보드 패치와 규칙 저장 사이에 정합성 문제가 생긴다. 규칙은 보드 문서의 일부이므로 보드 패치 경로를 그대로 쓴다. 마지막 변경자 기록은 그 패치 처리에서 서버가 채운다(FR-035).

**Alternatives considered**:

- **제거된 `/org/units`·`/org/positions` 복원** — 이름과 응답 형태를 그대로 쓸 수 있다. 기각 이유: 팀 스코프가 없고 `kind` 구분이 없어 이 화면 요구에 맞지 않는다. 무엇보다 그 설계는 의도대로 동작하지 않아 제거된 것이다.
- **규칙 전용 CRUD 엔드포인트** — 검증을 서버에 모을 수 있다. 기각 이유: 보드 패치와 이중 경로가 되어 정합성 비용이 는다.

---

## 미해결 항목

없다. 명세와 이 문서의 결정으로 Phase 1 설계를 시작할 수 있다.
