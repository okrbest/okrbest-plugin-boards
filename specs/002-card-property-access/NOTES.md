# 진행 노트

이 기능의 **작업 상태와 미결 사항**을 기록한다. 명세·계획은 다른 파일이 갖고 있고, 여기엔 "지금 어디까지 왔고 무엇이 열려 있는가"만 둔다. 세션이 바뀌어도 이 파일과 `tasks.md`만 보면 이어갈 수 있어야 한다.

**최종 갱신**: 2026-08-03

---

## 현재 지점

| 항목 | 값 |
|---|---|
| 브랜치 | `002-card-property-access` (`feat/permission` 기반, `c9d9cd1d`) |
| 완료 | **T001 ~ T003** (Phase 1 Setup) |
| 다음 | **T004** (Phase 2 Foundational) |
| 워킹트리 | clean |

`tasks.md`의 `[X]` 표시가 정본이다. 이 표는 요약일 뿐이다.

### 실제로 작성된 코드

```
server/model/property_access.go    신규 — 규칙·규칙집합 타입, 권한 등급, 잔재 키 목록
server/model/org.go                신규 — OrgUnit·Duty·UserOrgProfile, 유효기간 판정
webapp/src/blocks/board.ts         수정 — 대응 TS 타입 5종 추가
```

Go 빌드 통과, `board.ts` 타입 오류 0. **동작 코드는 아직 없다** — 타입 정의뿐이다.

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

아직 서버 기능이 없어 재배포해도 보이는 변화가 없으므로 그대로 뒀다. **Phase 3에서 UI가 나오면 그때 재배포한다.**

배포 방법은 `quickstart.md`의 "배포" 절 참조. 요약하면 `MM_DEBUG=1` + `npm run debug:watch`를 켜두면 저장할 때마다 자동 배포된다(약 11초).

---

## 미결 사항

### 1. constitution 커밋이 이 브랜치에 섞여 있다

`e4b225ac` (constitution 1.1.0 — 원칙 II에 UI 일관성 규칙 추가)이 기능 브랜치에 있다. 이 기능의 `/speckit-analyze`에서 나온 개정이라 맥락은 맞지만, constitution 원칙 VIII(한 변경 = 한 관심사)로 보면 별도 브랜치가 맞다.

**`feat/permission` 병합 시 분리할지 결정 필요.**

### 2. 조직 정보 미등록 사용자

활성 사용자 20명 중 `UserOrgProfiles` 행이 없는 사용자가 5명, `PrimaryDutyID`가 빈 사용자가 6명이다.

FR-021에 따라 조직 정보가 없는 사용자는 규칙이 걸린 카드에 접근할 수 없다(의도된 동작). **실사용 전환 전에 메인 서버 쪽에서 채워야 한다.**

`docs/upstream-org-role-requests.md` 요청 4 참조. 5건 중 이것만 필수다.

### 3. US3·US4 검증 조건

직책 가산(US3)과 전체보기 하한(US4)을 검증하려면 아래 계정이 필요하다. `UserOrgProfiles` 기준으로 이미 존재한다.

| 필요 | 현황 |
|---|---|
| 전략본부 본부장 | 본부장 3명 중 소속 확인 필요 |
| 전략본부 팀장 | 팀장 6명 중 소속 확인 필요 |
| 생산본부 본부장 | 동일 |
| 조직정보 없는 사용자 | 5명 존재 |

확인 쿼리는 `quickstart.md`의 "필요한 계정" 절에 있다.

---

## 남은 작업 규모

```
Phase 2  Foundational   T004 ~ T013   10건   조직 조회(store·app·api) + 평가기 골격
Phase 3  US1 (P1) MVP   T014 ~ T035   22건   규칙 저장·판정·읽기 집행·UI
Phase 4  US2 (P2)       T036 ~ T044    9건   쓰기 403·검색·웹소켓
Phase 5  US3 (P3)       T045 ~ T049    5건   직책 가산
Phase 6  US4 (P4)       T050 ~ T053    4건   전체보기 하한
Phase 7  US5 (P5)       T054 ~ T056    3건   마지막 변경자
Phase 8  Polish         T057 ~ T063    7건   정합성·성능·품질 게이트
                                     ─────
                                      60건
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
