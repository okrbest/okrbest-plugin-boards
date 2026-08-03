# 진행 노트

이 기능의 **작업 상태와 미결 사항**을 기록한다. 명세·계획은 다른 파일이 갖고 있고, 여기엔 "지금 어디까지 왔고 무엇이 열려 있는가"만 둔다. 세션이 바뀌어도 이 파일과 `tasks.md`만 보면 이어갈 수 있어야 한다.

**최종 갱신**: 2026-08-03 (Phase 8 코드 완료 — T062·T063만 남음)

---

## 현재 지점

| 항목 | 값 |
|---|---|
| 브랜치 | `002-card-property-access` (`feat/permission` 기반, `c9d9cd1d`) |
| 완료 | **T001 ~ T061** (Phase 1~8 — 코드·테스트 전량) |
| 다음 | **T062** 수동 검증(배포 필요) · **T063** 브랜치 정리 |
| 워킹트리 | Phase 7~8 미커밋 |

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

Phase 4(US2)에서 더한 것:

```
server/app/blocks.go                         requireCardEditPermission — 수정·삭제·배치 패치 가드
                                             deletedBlockMessage — 삭제 알림이 판정 가능하도록 블록 동봉
server/app/property_access.go                FilterBlockRecipients — 브로드캐스트 1건당 조회 1회
server/ws/adapter.go                         BlockAccessFilter 인터페이스 (ws는 app을 import 못 한다)
server/ws/plugin_adapter.go                  수신자별 필터 + 수신자 ID 중복 제거
server/boards/boardsapp.go                   기동 시 필터 등록
server/api/cards.go                          GET /cards/{id}·/subcards 조회 구멍 차단
server/api/blocks_test.go                    E-01~E-06·E-10·E-11 (기본 게이트에서 실행됨)
server/ws/property_access_test.go            E-08·E-09 페이로드/필터 경로
webapp/src/store/cards.test.ts               E-07 (검색은 클라이언트 필터)
webapp/src/csvExporter.test.ts               FR-030 내보내기
```

**여기까지가 보안이 성립하는 지점이다.** 조회·쓰기·검색·실시간·내보내기 전 경로가 같은 판정을 지난다.

Phase 5~8에서 더한 것:

```
server/app/property_access.go                전체보기 하한(fullVisibility) + 카드당 맵 할당 제거
server/model/property_access_test.go         저장 형태 왕복·복제 생존·검증 경계
server/app/property_access_test.go           US3·US4 판정표 전량 + 깨진 참조 + SC-006 벤치마크
server/api/blocks_test.go                    US4-3 (전체보기가 보드 진입을 주지 않음)
webapp/.../propertyAccessSection.tsx         마지막 변경자·시각 표시
webapp/i18n/{en,ko}.json                     PropertyAccess.lastUpdated
```

판정표(research.md R6) 아홉 행이 전부 테스트로 고정됐다.

### Phase 4에서 확인된 사실

- **서버에 카드 검색 경로가 없다.** `server/api/search.go`는 보드만 검색한다. 카드 검색은 `webapp/src/store/cards.ts`의 `searchFilterCards`가 이미 로드된 카드에 대해 수행하므로, 조회 필터링이 그대로 FR-028을 만족한다. T042는 서버 구현 대신 확인 + 카드 조회 구멍 차단으로 대체했다
- **삭제 알림은 블록 ID만 실어 보내던 것을 블록 전체로 바꿨다.** `BroadcastBlockDelete`가 만들던 메시지에는 속성값이 없어 필터가 판정할 수 없었다. 와이어 포맷은 그대로다 — 삭제는 원래부터 `deleteAt`이 붙은 블록 변경으로 나간다
- **남은 구멍 1개**: `GET /cards/{cardID}/subcards/count`는 개수만 돌려주며 필터를 지나지 않는다. 내용이 아니라 숫자만 새므로 막지 않았다. 막으려면 COUNT 질의를 전건 조회로 바꿔야 한다 — 실사용에서 문제가 되면 그때 바꿀 것

### Phase 8에서 확인된 사실

- **SC-006 여유가 크다.** 규칙 100개 보드에서 카드당 판정 52.6 ns/op(규칙 없음 0.75 ns/op). 카드 1,000개면 53µs로, 목록 표시 시간의 0.1% 미만이다. 측정하다 카드당 맵 할당을 발견해 제거했다(195 → 53 ns/op)
- **`server/services/store/sqlstore` 테스트 4건도 기존 실패다.** 기능 착수 커밋(`e3285af8`)에서도 같은 4건이 죽는다 — `TestCheckForMismatchedCollation`·`TestSQLStore`·`TestConcatenationSelector`·`TestElementInColumn`

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
T062  quickstart.md 시나리오 1~5 수동 검증   ← 배포 후에만 가능
T063  feat/permission 선형 병합 정리        ← 사용자 판단
                                     ─────
                                       2건
```

**코드는 전부 끝났다.** 남은 두 건은 사람이 해야 하는 일이다 — 배포 후 시나리오 확인과 브랜치 정리.

---

## 재개 방법

```bash
git switch 002-card-property-access
/speckit-implement
```

`.specify/feature.json`과 `CLAUDE.md`의 SPECKIT 블록이 이 디렉터리를 가리키므로 별도 설정이 필요 없다. `tasks.md`의 첫 `[ ]` 과제부터 이어가면 된다.

구현 규율은 superpowers가 런타임에 집행한다 — 실패 테스트 우선, 증거 기반 완료 선언. 테스트 기존 실패 수는 개인 메모리의 "webapp 테스트 baseline" 항목 참조(전체 145건 실패가 정상).
