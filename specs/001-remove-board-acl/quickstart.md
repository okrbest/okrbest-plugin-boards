# 검증 가이드: 보드 접근 권한(ACL) 및 소유자 개념 제거

**Feature**: `001-remove-board-acl` | **Date**: 2026-08-01

구현이 끝났다고 선언하기 전에 실행할 검증 절차다. 상세 스키마는 [contracts/board-permissions-api.md](contracts/board-permissions-api.md), 엔티티 변화는 [data-model.md](data-model.md)를 참조한다.

## 전제

- Node 20.11 (`.nvmrc`), Go 1.24.6 (`Makefile`의 `GOTOOLCHAIN` 핀이 자동 적용)
- 형제 디렉터리에 `mattermost` 저장소 클론 (`../mattermost`)
- 수동 시나리오 검증에는 MySQL 또는 PostgreSQL 백엔드의 개발 서버가 필요하다

## 0단계: 기준선 확보 (작업 시작 전 필수)

이 브랜치는 접근 권한과 무관한 실패를 이미 다수 갖고 있다. 완료 판정은 절대 통과가 아니라 **델타**로 한다. 착수 전에 반드시 기준선을 남긴다.

```bash
cd webapp
NODE_ENV=test npx jest 2>&1 | grep -E "^(FAIL|PASS) src/|^  ● " | sort -u > /tmp/before-jest.txt
npx tsc 2>&1 | grep "error TS" | sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/before-tsc.txt

cd ../server
go test -tags 'json1 sqlite3' -count=1 ./... 2>&1 | grep -E "^(FAIL|--- FAIL)" | sort -u > /tmp/before-server.txt
```

기준선을 잃으면 SC-005를 판정할 수 없다.

## 1단계: 품질 게이트

변경이 닿은 패키지만 실행한다(constitution 원칙 I). 이번 작업은 양쪽 모두 닿는다.

```bash
make webapp-ci     # npm run check + npm run test + npm run check-types
make server-lint   # golangci-lint
make server-test   # go test -race ./...  (CI 미집행 — 로컬 실행 필수)
```

`make server-test`는 사전 실패로 인해 전체 통과하지 않는다. 아래 2단계의 델타 비교로 판정한다.

## 2단계: 델타 비교 (SC-005)

```bash
cd webapp
NODE_ENV=test npx jest 2>&1 | grep -E "^(FAIL|PASS) src/|^  ● " | sort -u > /tmp/after-jest.txt
npx tsc 2>&1 | grep "error TS" | sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/after-tsc.txt

cd ../server
go test -tags 'json1 sqlite3' -count=1 ./... 2>&1 | grep -E "^(FAIL|--- FAIL)" | sort -u > /tmp/after-server.txt

# 신규 실패만 출력 — 전부 비어 있어야 한다
comm -13 /tmp/before-jest.txt /tmp/after-jest.txt
comm -13 /tmp/before-tsc.txt /tmp/after-tsc.txt
comm -13 /tmp/before-server.txt /tmp/after-server.txt
```

**기대**: 세 명령 모두 출력 없음. 반대 방향(`comm -23`)의 감소는 정상이며, 접근 권한 기능을 검증하던 항목이 사라진 결과다.

## 3단계: 잔재 확인 (SC-006)

```bash
grep -rin "acl\|orgunit\|position_code\|is_ceo\|has_acl_entries\|isowner\|board_owner\|transferboardownership" \
  server/ webapp/src/
```

**기대**: `webapp/src/svg/error-illustration.tsx` 한 파일만 나온다. base64 이미지 데이터에 우연히 포함된 문자열이며 코드가 아니다. 그 외 결과가 있으면 제거가 덜 끝난 것이다.

## 4단계: 되돌리기 스크립트 규약 (SC-007)

CI의 `down-migrations` 잡과 동일한 검사를 로컬에서 재현한다.

```bash
echo 'SELECT 1;' > /tmp/downmigration
for file in server/services/store/sqlstore/migrations/*.down.sql; do
  diff -Bw /tmp/downmigration "$file" || echo "위반: $file"
done
```

**기대**: 출력 없음. 작업 전에는 000047이 위반으로 잡힌다 — 이 검사가 통과로 바뀌는 것이 FR-018의 완료 증거다.

## 5단계: 라우트 확인

플러그인을 배포한 뒤 확인한다.

```bash
make deploy
```

| 요청 | 기대 |
|---|---|
| `GET /plugins/focalboard/api/v2/boards/{boardID}/permissions/me` | 200, `isOwner` 필드 없음 |
| `GET /plugins/focalboard/api/v2/boards/{boardID}/acl` | 404 |
| `PUT /plugins/focalboard/api/v2/boards/{boardID}/acl` | 404 |
| `POST /plugins/focalboard/api/v2/boards/{boardID}/acl/entries` | 404 |
| `GET /plugins/focalboard/api/v2/org/units` | 404 |
| `GET /plugins/focalboard/api/v2/org/positions` | 404 |
| `GET /plugins/focalboard/api/v2/boards/{boardID}/permissions/preview?userID=x` | 404 |
| `PUT /plugins/focalboard/api/v2/boards/{boardID}/owner` | 404 |

응답 헤더에 `X-Boards-Debug-*`가 하나도 없어야 한다.

## 6단계: 삭제 권한 시나리오 (SC-001 ~ SC-003)

User Story 1의 인수 시나리오를 실제 서버에서 확인한다.

| # | 준비 | 실행 | 기대 |
|---|---|---|---|
| 1 | 사용자 A가 보드 생성, 사용자 B를 관리자로 추가 | B가 보드 삭제 | 성공 |
| 2 | 사용자 C를 편집자로 추가 | C가 보드 삭제 | 거부 |
| 3 | 사용자 D를 댓글 작성자로, E를 열람자로 추가 | 각자 보드 삭제 | 모두 거부 |
| 4 | 팀 관리자 F를 보드 멤버로 추가 | F가 보드 삭제 | 성공 |
| 5 | 생성자 계정을 비활성화 | 남은 관리자가 삭제 | 성공 |

**추가 기록 항목**: 보드 멤버가 **아닌** 팀 관리자의 삭제 시도 결과를 기록한다. `main`은 허용하지만 현재 구현은 명시적 멤버십을 요구한다(spec의 Assumptions 참조). 이번 범위 밖이지만 실제 동작을 남겨 후속 과제 판단 근거로 삼는다.

## 7단계: 공유 화면 (SC-004)

보드 관리자 계정으로 보드 공유 화면을 연다.

| 확인 | 기대 |
|---|---|
| 부서·직위 권한 등록 영역 | 없음 |
| 소유권 이전 영역 | 없음 |
| 멤버 초대 | 정상 동작 |
| 멤버 역할 변경 | 정상 동작 |
| 이전에 소유자였던 멤버의 행 | 다른 멤버와 동일하게 역할 변경 메뉴 노출 |
| 링크 공유 | 정상 동작 |

## 8단계: 보드 조회 범위 (SC-008)

응답 시간을 재는 대신 조회 구조를 확인한다. 접근 권한 확장은 팀 전체 보드를 후보로 끌어와 항목별로 평가하는 방식이었다. 그 경로가 사라졌는지를 코드로 판정하면 결정적이며, 환경에 따라 흔들리는 시간 측정이 필요 없다.

| 확인 | 기대 |
|---|---|
| `server/app/boards.go`의 목록·검색 함수 | 확장 없이 원본 결과를 반환 |
| `server/services/store/sqlstore/board.go` | 팀 전체 보드 조회 메서드 부재 |
| `server/services/store/store.go`의 `Store` 인터페이스 | 팀 전체 보드 조회 선언 부재 |

세 항목은 T037·T039·T040 완료로 자동 충족된다. 별도 작업이 아니라 확인 절차다.

운영에서 체감 지연이 보고되면 그때 조사한다. 이 변경은 처리를 덜어내기만 하므로 느려질 구조적 경로가 없다.

## 9단계: 마이그레이션 적용

MySQL 또는 PostgreSQL 백엔드에서 확인한다. SQLite 경로는 마이그레이션 000045의 기존 결함으로 체인이 끊겨 도달하지 못한다([research.md](research.md) R-004).

| 확인 | 기대 |
|---|---|
| 000048 적용 | 오류 없이 완료 |
| `boards` 테이블 | `has_acl_entries` 컬럼 없음 |
| `boards_history` 테이블 | `has_acl_entries` 컬럼 없음 |
| `boards` 인덱스 목록 | `idx_boards_team_id_has_acl_entries` 없음 |
| 기존 보드 데이터 | 손실 없음 |
| `boards.properties` | `board_acl_entries` 등 잔여 키가 남아 있어도 무방 (FR-014) |

## 배포 전 영향 파악 (User Story 3)

배포 **전에** 실행한다. 배포 후에는 조회 경로가 사라진다.

| 조사 | 방법 |
|---|---|
| 접근 권한이 등록된 보드 | `boards` 테이블에서 `has_acl_entries = true`인 행 |
| 영향받는 사용자 | 해당 보드의 접근 권한 항목에 걸린 부서·직위에 속한 사용자 |
| 전체공개 직위 보유자 | 직위 마스터에서 전체공개 플래그가 설정된 직위의 보유자 |

산출 결과로 결정한다 — 해당 사용자를 보드 멤버로 직접 추가할지, 접근 상실을 공지할지.

## 완료 선언 조건

constitution 원칙 I에 따라 아래 근거를 **출력과 함께** 제시한 뒤에만 완료를 선언한다.

- [ ] 2단계 델타 비교 세 명령 모두 출력 없음
- [ ] 3단계 잔재 확인이 `error-illustration.tsx` 외 0건
- [ ] 4단계 되돌리기 규약 검사 통과
- [ ] `make webapp-ci` 통과
- [ ] `make server-lint` 통과
- [ ] 6단계 시나리오 5건 모두 기대대로 동작
- [ ] 7단계 공유 화면 확인 완료
- [ ] 9단계 마이그레이션 적용 확인 완료
