# Contract: 규칙 저장과 집행

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

규칙은 보드 문서의 일부다. 전용 CRUD 경로를 만들지 않고 기존 보드 패치 경로를 쓴다(research.md R8).

기준 경로: `/plugins/focalboard/api/v2`

---

## 1. 규칙 저장 — PATCH /boards/{boardID}

기존 보드 패치 경로에 `properties.propertyAccess`를 실어 보낸다.

### 요청 본문 (관련 부분만)

```jsonc
{
  "updatedProperties": {
    "propertyAccess": {
      "enabled": true,
      "rules": [
        {
          "id": "r1",
          "propertyId": "clevel-prop-id",
          "propertyValueId": "strategy-option-id",
          "divisionId": "e178154ru3g88gotpw4op7h9jr",
          "departmentId": "",
          "dutyCode": "",
          "permission": "viewer"
        }
      ]
    }
  }
}
```

### 권한

호출자가 그 보드의 멤버 역할을 관리할 수 있어야 한다(FR-002). 아니면 `403`.

### 서버 처리

| 동작 | 근거 |
|---|---|
| `updatedBy`를 **세션 사용자 ID로 덮어쓴다** | FR-035 — 클라이언트가 보낸 값을 신뢰하지 않는다 |
| `updatedAt`을 **서버 시각으로 덮어쓴다** | FR-035 |
| 검증 실패 시 `400` | data-model.md §1.2 검증 규칙 |
| 잔재 키 4개를 제거한 뒤 저장한다 | data-model.md §1.3 |

### 응답 `200`

갱신된 보드. `properties.propertyAccess`에 서버가 채운 `updatedBy`·`updatedAt`이 포함된다.

### 오류

| 코드 | 조건 |
|---|---|
| `400` | `propertyId`·`propertyValueId`·`permission` 누락, 또는 조직·직책 세 축이 모두 빔, 또는 `permission`이 허용 값이 아님 |
| `403` | 멤버 역할 관리 권한 없음 |

---

## 2. 집행 계약

아래는 API 응답 형태가 아니라 **동작 계약**이다. 각 경로가 평가기 판정에 따라 무엇을 하는지 규정한다.

| 경로 | 판정 결과 | 동작 | FR |
|---|---|---|---|
| `GET /boards/{id}/blocks` | `none` | 그 카드와 **부모가 그 카드인 모든 블록**을 응답에서 제거 | FR-025, FR-026 |
| `GET /boards/{id}/cards` | `none` | 응답에서 제거 | FR-025 |
| `POST /boards/{id}/cards/by-ids` | `none` | 응답에서 제거 (요청한 id여도 반환하지 않음) | FR-025 |
| `PATCH /boards/{id}/blocks/{blockID}` | `editor` 미만 | `403` | FR-027 |
| `DELETE /boards/{id}/blocks/{blockID}` | `editor` 미만 | `403` | FR-027 |
| `POST /boards/{id}/blocks` | — | 보드 권한으로 허용. 규칙을 적용하지 않음 | FR-032 |
| 검색 | `none` | 결과에서 제거 | FR-028 |
| WS `UPDATE_BLOCK`/`DELETE_BLOCK` | `none` | 그 수신자에게 전송하지 않음 | FR-029 |

**자식 블록 판정**: 블록의 `parentId`가 카드이면 그 카드의 판정을 따른다. 카드가 제거되면 자식도 제거된다.

**규칙 스위치가 꺼져 있으면** 위 집행을 전혀 수행하지 않는다. 모든 카드가 보드 권한을 따른다.

---

## 3. 계약 테스트 항목

### 저장

| # | 검증 |
|---|---|
| S-01 | 멤버 역할 관리 권한이 없는 사용자의 규칙 저장이 `403`으로 거부된다 |
| S-02 | 클라이언트가 보낸 `updatedBy`가 무시되고 세션 사용자로 덮어써진다 |
| S-03 | 클라이언트가 보낸 `updatedAt`이 무시되고 서버 시각으로 덮어써진다 |
| S-04 | 조직·직책 세 축이 모두 빈 규칙 저장이 `400`으로 거부된다 |
| S-05 | `permission`이 허용 값이 아니면 `400`으로 거부된다 |
| S-06 | 저장 후 보드 `properties`에서 잔재 키 4개가 사라진다 |
| S-07 | 규칙을 저장한 뒤 보드를 다시 조회하면 규칙이 그대로 돌아온다 |

### 집행

| # | 검증 |
|---|---|
| E-01 | 권한 없는 카드가 블록 조회 응답에 없다 |
| E-02 | 그 카드의 자식 블록(설명·댓글·첨부)도 응답에 없다 |
| E-03 | 권한 없는 카드의 수정 요청이 `403`이다 |
| E-04 | 열람자 권한만 있는 카드의 수정 요청이 `403`이다 |
| E-05 | 권한 없는 카드의 삭제 요청이 `403`이다 |
| E-06 | 카드 생성은 보드 권한으로 성공한다 |
| E-07 | 권한 없는 카드가 검색 결과에 없다 |
| E-08 | 권한 없는 카드의 변경이 그 사용자에게 실시간으로 전달되지 않는다 |
| E-09 | 같은 변경이 권한 있는 사용자에게는 전달된다 |
| E-10 | 보드 관리자에게는 위 어느 것도 걸리지 않는다 |
| E-11 | 스위치가 꺼져 있으면 위 어느 것도 걸리지 않는다 |
| E-12 | 규칙 조건에 해당하지 않는 카드는 도입 전과 동일하게 동작한다 |
