# Quickstart: 속성 기준 카드 접근 권한 검증

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contracts**: [contracts/](contracts/)

기능이 끝에서 끝까지 동작하는지 확인하는 실행 가이드다. 구현 코드는 담지 않는다 — 그건 `tasks.md`와 구현 단계의 몫이다.

---

## 사전 조건

| 항목 | 확인 |
|---|---|
| Mattermost 개발 서버 구동 중 | `http://localhost:8065` 응답 |
| 로컬 모드 소켓 열림 | `ServiceSettings.EnableLocalMode=true`, `/var/tmp/mattermost_local.socket` 존재 |
| 플러그인 업로드 허용 | `PluginSettings.Enable=true`, `PluginSettings.EnableUploads=true` |
| 조직 마스터 데이터 | `OrgUnits`에 본부·부서, `PositionDefinitions`에 `kind='duty'` 행이 있다 |
| 테스트 계정 | 아래 4종. 조직 정보를 `props`에 채워둔다 |

### 필요한 계정

조직 정보는 메인 서버의 조직 관리 화면에서 설정한다(`UserOrgProfiles`). 로컬 DB 기준 이미 조직 15명·직책 9명이 등록돼 있으므로 대부분 그대로 쓸 수 있다.

| 역할 | 소속(`PrimaryOrgUnitID`) | 직책(`PrimaryDutyID`) | 용도 |
|---|---|---|---|
| 전략본부 본부장 | 전략 산하 부서 | 본부장 | 관문 통과 + 직책 가산 + 전체보기 하한 |
| 전략본부 팀장 | 전략 산하 부서 | 팀장 | 관문 통과, 가산 없음 |
| 생산본부 본부장 | 생산 산하 부서 | 본부장 | 관문 차단 + 전체보기 하한 |
| 조직정보 없는 사용자 | (행 없음) | — | 미등록자 차단 |

계정은 보드 멤버(편집자)로 등록한다. 보드 관리자 계정은 별도로 하나 둔다.

현재 등록 상태 확인:

```bash
PW=$(docker inspect mattermost-postgres --format '{{range .Config.Env}}{{println .}}{{end}}' \
     | grep POSTGRES_PASSWORD | cut -d= -f2)
docker exec -e PGPASSWORD="$PW" mattermost-postgres psql -U mmuser -d mattermost_test -c "
  select u.username, o.name as org, d.name as duty, p.effectivefrom, p.effectiveto
  from userorgprofiles p
  join users u on u.id = p.userid
  left join orgunits o on o.id = p.primaryorgunitid
  left join positiondefinitions d on d.id = p.primarydutyid
  order by u.username;"
```

---

## 자동 검증

### 서버 단위·통합 테스트

```bash
make server-lint
make server-test
```

`server-test`는 CI가 집행하지 않으므로 **로컬에서 반드시 실행하고 출력을 완료 근거로 제시한다**(constitution 원칙 I).

기대: `server/app/property_access_test.go`의 판정표 케이스가 모두 통과. 판정표는 [research.md](research.md) R6에 있다.

### webapp 테스트

```bash
make webapp-ci
```

기대: 신규 컴포넌트 테스트(`propertyAccessSection.test.tsx`, `propertyAccessRow.test.tsx`)와 기존 스위트가 통과. 기존 실패 목록 대비 신규 실패 0건.

---

## 수동 검증

### 배포

```bash
export MM_DEBUG=1
cd webapp && npm run debug        # 또는 npm run debug:watch 로 켜두기
cd .. && make deploy-from-watch
```

배포 후 브라우저 하드 리프레시. 번들 경로에 콘텐츠 해시가 박혀 있어 새로고침 전에는 이전 번들이 뜬다.

### 시나리오 1 — 조직 기준 격리 (User Story 1)

1. 보드 관리자로 보드를 열고 **공유**를 클릭한다.
2. 멤버 목록 아래 **속성 기준 접근 권한** 섹션이 보인다. 스위치는 꺼져 있다.
3. 행을 추가한다: `속성명=C-Level`, `속성값=전략`, `본부=전략`, `권한=열람자`.
4. 스위치를 켜고 저장한다.
5. 팝업을 닫았다 다시 열어 규칙이 그대로 있는지 확인한다. → **US1-7**

| 계정 | `C-Level=전략` 카드 | 기대 | 대응 |
|---|---|---|---|
| 전략본부 팀장 | 목록에 보임 | 열람 가능 | US1-1 |
| 생산본부 팀장 | 목록에 없음 | — | US1-2 |
| 조직정보 없는 사용자 | 목록에 없음 | — | US1-3 |
| 보드 관리자 | 목록에 보임 | 전체 접근 | US1-4 |

6. `C-Level`이 비어 있거나 `생산`인 카드는 **모든 계정에서 보드 권한대로** 보인다. → **US1-5**
7. 스위치를 끄면 모든 계정에서 모든 카드가 다시 보인다. → **US1-6**

### 시나리오 2 — 우회 경로 차단 (User Story 2)

브라우저 개발자 도구 콘솔에서 세션을 그대로 쓰되 화면을 거치지 않고 요청한다.

```js
// 권한 없는 카드 ID로 수정 시도 — 403 이어야 한다
await fetch(`/plugins/focalboard/api/v2/boards/${boardId}/blocks/${cardId}`, {
  method: 'PATCH',
  headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest'},
  body: JSON.stringify({title: 'should not work'}),
}).then((r) => r.status)
```

| 확인 | 기대 | 대응 |
|---|---|---|
| 권한 없는 카드 수정 | `403` | US2-1 |
| 권한 없는 카드 삭제 | `403` | US2-2 |
| 열람자 권한 카드 수정 | `403` | US2-3 |
| 그 카드 제목 단어로 검색 | 결과에 없음 | US2-4 |
| 다른 사용자가 그 카드 수정 시 WS 프레임 | 도착하지 않음 | US2-5 |
| 보드 CSV 내보내기 | 그 카드 없음 | US2-6 |
| 블록 조회 응답에 그 카드의 댓글·설명 | 없음 | US2-7 |

WS 확인은 개발자 도구 Network → WS 탭에서 프레임을 보거나, 페이지에서 소켓 메시지를 수집해 `custom_focalboard_` 이벤트를 세어 확인한다.

### 시나리오 3 — 직책 가산 (User Story 3)

시나리오 1의 규칙에 행을 하나 더한다: `속성명=C-Level`, `속성값=전략`, `직책=본부장`, `권한=편집자`.

| 계정 | 기대 | 대응 |
|---|---|---|
| 전략본부 본부장 | 편집 가능 | US3-1 |
| 전략본부 팀장 | 열람만 | US3-2 |
| 생산본부 본부장 | 규칙 권한 없음(전체보기 하한으로 열람은 가능) | US3-3 |

### 시나리오 4 — 전체보기 하한 (User Story 4)

`fullvisibility`가 켜진 직책(본부장) 계정으로 확인한다.

| 확인 | 기대 | 대응 |
|---|---|---|
| 조직 관문에 막힌 카드 | 열람 가능 | US4-1 |
| 규칙이 편집자를 주는 카드 | 편집 가능(하한이 권한을 낮추지 않음) | US4-2 |
| 애초에 멤버가 아닌 보드 | 여전히 진입 불가 | US4-3 |

### 시나리오 5 — 마지막 변경자 (User Story 5)

1. 관리자 A로 규칙을 저장한다.
2. 관리자 B로 공유 팝업을 연다. → 섹션 헤더에 "마지막 변경: A · 날짜"가 보인다. **US5-2**
3. 규칙을 한 번도 저장하지 않은 다른 보드에서는 그 표시가 없다. **US5-1**

---

## 데이터 확인

DB에서 규칙 저장 결과를 직접 볼 때:

```bash
PW=$(docker inspect mattermost-postgres --format '{{range .Config.Env}}{{println .}}{{end}}' \
     | grep POSTGRES_PASSWORD | cut -d= -f2)
docker exec -e PGPASSWORD="$PW" mattermost-postgres psql -U mmuser -d mattermost_test \
  -c "select properties from focalboard_boards where id='<boardID>';"
```

확인 항목:

- `propertyAccess.updatedBy`가 세션 사용자 ID다 (클라이언트가 보낸 값이 아니다)
- 잔재 키 `card_acl_rules`·`card_acl_enabled`·`card_acl_org_map`·`board_owner_user_id`가 없다

---

## 완료 판정

- [ ] `make server-lint`·`make server-test`·`make webapp-ci` 통과 출력을 근거로 제시했다
- [ ] 시나리오 1~5의 모든 행이 기대대로 나왔다
- [ ] 시나리오 2에서 클라이언트를 거치지 않은 요청이 전부 막혔다 (SC-002)
- [ ] 규칙 조건 밖 카드의 동작이 도입 전과 같다 (SC-004)
