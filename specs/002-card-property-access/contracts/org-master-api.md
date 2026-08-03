# Contract: 조직 마스터 조회 API

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) R8

공유 팝업의 본부·부서·직책 셀렉터를 채우기 위한 **읽기 전용** 경로 두 개. 조직 마스터는 이 플러그인 밖에서 관리되며 이 API는 조회만 제공한다.

기준 경로: `/plugins/focalboard/api/v2`

---

## GET /teams/{teamID}/org-units

팀의 조직 단위(본부·부서) 목록.

### 요청

| 항목 | 값 |
|---|---|
| 인증 | 세션 필요 |
| 경로 변수 | `teamID` — 팀 ID |
| 쿼리 | 없음 |

### 권한

호출자가 해당 팀을 볼 수 있어야 한다. 아니면 `403`.

### 응답 `200`

```json
[
  {"id": "e178154ru3g88gotpw4op7h9jr", "name": "전략", "type": "division",   "parentId": ""},
  {"id": "qc8xmpmihigy9nisoj5qyw785e", "name": "경영개선팀", "type": "department", "parentId": "e178154ru3g88gotpw4op7h9jr"}
]
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 규칙의 `divisionId`·`departmentId`에 저장할 값 |
| `name` | string | 셀렉터 표시명 |
| `type` | string | `division`(본부) 또는 `department`(부서) |
| `parentId` | string | 상위 조직 id. 최상위면 빈 문자열 |

**정렬**: `type` 오름차순(division 먼저), 그 안에서 `name` 오름차순.

**필터**: `active=true`인 행만 반환한다.

### 오류

| 코드 | 조건 |
|---|---|
| `403` | 팀 접근 권한 없음 |
| `500` | 조회 실패 |

조직 마스터 테이블이 없거나 비어 있으면 빈 배열 `[]`을 반환한다. 오류가 아니다.

---

## GET /teams/{teamID}/duties

팀의 직책 목록.

### 요청

| 항목 | 값 |
|---|---|
| 인증 | 세션 필요 |
| 경로 변수 | `teamID` — 팀 ID |
| 쿼리 | 없음 |

### 권한

호출자가 해당 팀을 볼 수 있어야 한다. 아니면 `403`.

### 응답 `200`

```json
[
  {"code": "ceo-2",  "name": "CEO",    "rank": 0, "fullVisibility": true},
  {"code": "duty",   "name": "고문",   "rank": 1, "fullVisibility": false},
  {"code": "duty-2", "name": "본부장", "rank": 2, "fullVisibility": true},
  {"code": "duty-3", "name": "팀장",   "rank": 3, "fullVisibility": false}
]
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `code` | string | 규칙의 `dutyCode`에 저장할 값. 사용자 `position_codes`와 대조된다 |
| `name` | string | 셀렉터 표시명 |
| `rank` | number | 정렬 기준. 작을수록 상위 |
| `fullVisibility` | boolean | 보드 전체보기 여부 |

**정렬**: `rank` 오름차순, 동률이면 `name` 오름차순.

**필터**: `kind='duty'` **그리고** `active=true`인 행만 반환한다. `kind='position'`(직위)은 **반환하지 않는다** (FR-024).

### 오류

`org-units`와 동일.

---

## 계약 테스트 항목

| # | 검증 |
|---|---|
| C-01 | 팀 접근 권한이 없는 사용자의 요청이 `403`으로 거부된다 |
| C-02 | `org-units` 응답이 `division`과 `department`를 모두 포함하고 `parentId`로 연결된다 |
| C-03 | `org-units`가 `active=false` 행을 반환하지 않는다 |
| C-04 | `duties` 응답에 `kind='position'` 행이 하나도 없다 |
| C-05 | `duties`가 `active=false` 행을 반환하지 않는다 |
| C-06 | `duties`의 `fullVisibility`가 마스터 값과 일치한다 |
| C-07 | 마스터 테이블이 비어 있을 때 `[]`을 반환하고 `500`이 아니다 |
