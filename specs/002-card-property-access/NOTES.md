# 진행 노트

이 기능의 **작업 상태와 미결 사항**을 기록한다. 명세·계획은 다른 파일이 갖고 있고, 여기엔 "지금 어디까지 왔고 무엇이 열려 있는가"만 둔다. 세션이 바뀌어도 이 파일과 `tasks.md`만 보면 이어갈 수 있어야 한다.

**최종 갱신**: 2026-08-03 (Phase 3 완료)

---

## 현재 지점

| 항목 | 값 |
|---|---|
| 브랜치 | `002-card-property-access` (`feat/permission` 기반, `c9d9cd1d`) |
| 완료 | **T001 ~ T035** (Phase 1~3 — Setup · Foundational · US1 MVP) |
| 다음 | **T036** (Phase 4 US2 — 우회 경로 차단) |
| 워킹트리 | Phase 3 미커밋 |

`tasks.md`의 `[X]` 표시가 정본이다. 이 표는 요약일 뿐이다.

### 실제로 작성된 코드

```
server/model/property_access.go              규칙·규칙집합 타입, 권한 등급, 잔재 키 목록
server/model/org.go                          OrgUnit·Duty·UserOrgProfile, 유효기간 판정
server/services/store/sqlstore/org_master.go 메인 서버 3개 테이블 읽기 전용 조회
server/services/store/store.go               인터페이스 메서드 3개 추가 (mockstore 재생성됨)
server/app/org_master.go                     조회 정규화·ID 중복 제거·유효기간 필터·조상 집합
server/app/property_access.go                평가기 골격 (관리자 우회·스위치·규칙 밖 카드)
server/api/org.go                            GET /teams/{teamID}/org-units · /duties
server/api/helper_test.go                    API 테스트 하네스 (mockstore + fake permissions)
webapp/src/blocks/board.ts                   대응 TS 타입 5종
```

Phase 3(US1)에서 더한 것:

```
server/app/property_access.go                조직 관문·카드조건 매칭·허용맵 선계산·규칙 검증·평가기 조립
server/app/boards.go                         규칙 저장 정규화(updatedBy/At 덮어쓰기)·잔재 키 제거
                                             prepareChannelPatch 추출 (PatchBoard gocyclo 해소)
server/app/blocks.go                         GetBlocksForUser·FilterBlocksForUser·FilterCardsForUser
server/api/boards.go                         규칙 수정에 ManageBoardRoles 게이트
server/api/blocks.go · cards.go              조회 3경로를 필터 진입점으로 전환
server/api/boards_test.go                    저장 계약 S-01~S-07
server/integrationtests/property_access_test.go  집행 계약 E-01·E-02·E-10~E-12
server/integrationtests/pluginteststore.go   조직 마스터 픽스처 (메인 서버 테이블은 테스트 DB에 없다)
webapp/src/octoClient.ts                     getOrgUnits · getDuties
webapp/src/store/orgMaster.ts                팀별 캐시 슬라이스 + 연쇄 셀렉터
webapp/src/components/shareBoard/propertyAccessSection.tsx   섹션 + 스위치 + 행 추가
webapp/src/components/shareBoard/propertyAccessRow.tsx       연쇄 셀렉터 6개 (MenuWrapper 재사용)
webapp/src/components/shareBoard/shareBoard.scss             .ShareBoardDialog 안에 스타일 추가
webapp/i18n/{en,ko}.json                     PropertyAccess.* 10개
```

**규칙을 켜면 조회 경로에서 카드가 걸러진다.** 다만 쓰기·검색·웹소켓은 아직 뚫려 있다 — US2(Phase 4) 전까지 배포하면 안 된다.

직책 가산(T047)·전체보기 하한(T052)은 아직 없다. 평가기의 `floor`는 항상 `none`이고 `dutyId` 매칭만 들어가 있다.

### 다음 세션이 알아야 할 것

- **API 계약 테스트는 `server/api/`에 일반 테스트로 쓴다.** `server/integrationtests/`는 `integration` 빌드 태그라 `make server-test`가 실행하지 않는다. 하네스는 `server/api/helper_test.go`의 `setupAPITestHelper`
- **`make generate`는 실패한다.** `ws/plugin_adapter.go`·`mmpermissions_test.go`가 go.mod에 없는 `mattermost-server/v6`를 참조한다. 다만 mockstore는 그 실패 전에 재생성되므로 `git diff mockstore/`로 확인하면 된다
- **회귀 판정은 실패 테스트 목록 diff로.** `server/app` 기존 실패 8건, `server/model` 1건, webapp 실패 스위트 57개. 개수는 진동한다
- **`server/integrationtests`는 이 환경에서 실행되지 않는다.** 두 겹의 선행 문제가 있다 — (1) 패키지가 `undefined: userAnonID`로 컴파일되지 않던 것을 이번에 고쳤고, (2) 그래도 모든 통합 테스트가 `no such table: TeamMembers`로 죽는다. 메인 서버 스키마가 없는 sqlite 테스트 DB의 한계이며 기존 테스트도 똑같이 죽는다. E-01·E-02·E-10~E-12는 작성만 되어 있고 **실행 검증되지 않았다**
- **통합 테스트를 돌리려면 `-tags 'json1 sqlite3 integration'`이 필요하다.** `json1` 없이는 마이그레이션이 `no such function: json_set`으로 죽는다
- **`shareBoard.test.tsx` 스냅샷 13개를 갱신했다.** 섹션을 삽입했으니 당연한 변화다. 이 스위트는 갱신 전후 모두 5건 실패(기존)

---

## 설계 정정 이력

구현 착수 후 전제가 뒤집혀 문서 6개를 되돌렸다. 커밋 `439e4da0`.

**조직 정보 출처가 `users.props`가 아니라 메인 서버 소유 `UserOrgProfiles` 테이블이다.**

| | 정정 전 | 정정 후 |
|---|---|---|
| 사용자 조직 출처 | `users.props` | `UserOrgProfiles` (팀 스코프) |
| 직책 바인딩 | `PositionDefinitions.code` | `PositionDefinitions.id` |
| 규칙 필드 | `dutyCode` | **`dutyId`** (세 축 모두 id) |
| 직책/직위 분리 | code 접두사 추론 | 컬럼으로 이미 분리 |
| 유효기간 | 없음 | `EffectiveFrom`/`EffectiveTo` 반영 |
| 직책 커버리지 | "1명뿐, 사실상 무효" | **9명** (본부장 3·팀장 6) |

근거는 `research.md` R5·R5.1에 있다. 메인 서버 API를 부르지 않고 DB를 직접 읽기로 확정했다.

---

## 배포 상태 — 주의

**현재 Mattermost에 배포된 번들은 이 브랜치 것이 아니다.**

```
focalboard_11614dccd7965a58_bundle.js   ← feat/permission의 development 모드 빌드
```

**Phase 3에서 UI가 생겼으므로 이제 재배포가 필요하다.** 공유 팝업 멤버 목록 아래에 "속성 기준 카드 접근 권한" 섹션이 나와야 한다. quickstart.md 시나리오 1~5 수동 검증(T062)은 재배포 후에 한다.

배포 방법은 `quickstart.md`의 "배포" 절 참조. 요약하면 `MM_DEBUG=1` + `npm run debug:watch`를 켜두면 저장할 때마다 자동 배포된다(약 11초).

---

## 결정·미결 사항

### 1. ~~constitution 커밋 분리~~ — 결정됨 (2026-08-03)

`e4b225ac`(constitution 1.1.0)를 **이 브랜치에 둔 채 함께 병합한다.** 이 기능의 `/speckit-analyze`에서 나온 개정이라 맥락이 같고, 분리 이득이 작다는 판단이다.

### 2. ~~조직 정보 미등록 사용자~~ — 해소됨 (2026-08-03)

**근거 오류였다.** 분모를 팀 멤버가 아닌 전체 사용자로 잡았고 거기에 봇 5개가 섞여 있었다. 재검증 결과:

```
활성 사용자 20 = 봇 5 + 사람 15
kkv 팀 멤버(봇 제외) 15 / UserOrgProfiles 보유 15 / 누락 0
```

`PrimaryDutyID`가 빈 6명도 결손이 아니다 — 직책은 전원이 갖는 값이 아니고, Boards 설계에서도 직책은 관문이 아니라 가산 조건이다(FR-018).

**실사용 전환 전에 필요한 데이터 작업은 없다.** `docs/upstream-org-role-requests.md` 요청 4는 철회했다.

### 3. ~~기능 플래그 대응~~ — 결정됨 (2026-08-03)

`EnableOrgRoleManagement`가 꺼져도 **Boards는 규칙 평가를 계속한다.** 플래그를 읽지 않는다.

접근 제어가 설정 플래그로 열리는 fail-open을 피하고, 판정에 쓰는 조직 데이터는 플래그와 무관하게 DB에 그대로 있기 때문이다. 규칙을 끄려면 보드별 스위치(`propertyAccess.enabled`)를 쓴다.

관련 과제 없음.

### 4. US3·US4 검증 조건

직책 가산(US3)과 전체보기 하한(US4)을 검증하려면 아래 계정이 필요하다. `UserOrgProfiles` 기준으로 이미 존재한다.

| 필요 | 현황 |
|---|---|
| 전략본부 본부장 | 본부장 3명 중 소속 확인 필요 |
| 전략본부 팀장 | 팀장 6명 중 소속 확인 필요 |
| 생산본부 본부장 | 동일 |
| 조직정보 없는 사용자 | **팀 안에는 없다.** 팀 미소속 계정을 쓰거나 검증용 프로필을 임시로 비운다 |

확인 쿼리는 `quickstart.md`의 "필요한 계정" 절에 있다.

---

## 남은 작업 규모

```
Phase 4  US2 (P2)       T036 ~ T044    9건   쓰기 403·검색·웹소켓
Phase 5  US3 (P3)       T045 ~ T049    5건   직책 가산
Phase 6  US4 (P4)       T050 ~ T053    4건   전체보기 하한
Phase 7  US5 (P5)       T054 ~ T056    3건   마지막 변경자
Phase 8  Polish         T057 ~ T063    7건   정합성·성능·품질 게이트
                                     ─────
                                      28건
```

**US1만 배포하면 보안이 성립하지 않는다.** 화면에서만 격리되고 API·검색·실시간 경로로 샌다. US1과 US2는 함께 배포한다. 상세는 `tasks.md`의 "Implementation Strategy".

---

## 재개 방법

```bash
git switch 002-card-property-access
/speckit-implement
```

`.specify/feature.json`과 `CLAUDE.md`의 SPECKIT 블록이 이 디렉터리를 가리키므로 별도 설정이 필요 없다. `tasks.md`의 첫 `[ ]` 과제부터 이어가면 된다.

구현 규율은 superpowers가 런타임에 집행한다 — 실패 테스트 우선, 증거 기반 완료 선언. 테스트 기존 실패 수는 개인 메모리의 "webapp 테스트 baseline" 항목 참조(전체 145건 실패가 정상).
