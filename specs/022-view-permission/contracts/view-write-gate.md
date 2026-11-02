# Contract: 뷰 블록 쓰기 관문

**Spec**: [spec.md](../spec.md) | FR-005~FR-009, FR-011, FR-015~FR-018, FR-026

## 대상 경로

뷰 블록을 바꿀 수 있는 요청 경로 전부. 여섯이다. 모두 App 계층의 같은 함수
`requireViewWritePermission`을 거친다(R3).

| # | 경로 | App 진입점 | 이 경로로 오는 조작 |
|---|---|---|---|
| P1 | `PATCH /boards/{boardID}/blocks/{blockID}` | `PatchBlockAndNotify` | 뷰 구성 변경, 이름 변경, 모드 변경, 카드 순서 변경 |
| P2 | `PATCH /boards/{boardID}/blocks` | `PatchBlocksAndNotify` | 위와 같음(배치) |
| P3 | `DELETE /boards/{boardID}/blocks/{blockID}` | `DeleteBlockAndNotify` | 뷰 삭제 |
| P4 | `POST /boards/{boardID}/blocks/{blockID}/duplicate` | `DuplicateBlock` | 뷰 복제(서버 경로) |
| P5 | `POST /boards/{boardID}/blocks/{blockID}/undelete` | `UndeleteBlock` | 지운 뷰 복원 |
| P6 | `POST /boards/{boardID}/blocks` (기존 ID) | `InsertBlocksAndNotify` | 같은 ID로 다시 넣기(upsert) |

API 계층의 `PermissionManageBoardCards` 검사는 그대로 남는다. 이 관문은 그 뒤에 더해진다.
`stored.Type != "view"`면 관문은 아무것도 하지 않는다 — 카드 · 댓글 · 본문은 009의 판정만
받는다.

## 판정

```
mode     = ViewAccessModeOf(stored)
isAdmin  = HasPermissionToBoard(userID, board.ID, ManageBoardRoles)
isOwner  = stored.createdBy == userID
```

### 1단계 — 현재 모드의 뷰를 건드릴 수 있는가

| mode | 통과 조건 | 아니면 |
|---|---|---|
| everyone | 항상 (API가 이미 편집 권한을 확인했다) | — |
| admin | isAdmin, **또는** op == patch 이고 IsCardOrderOnlyPatch(patch), **또는** op == duplicate (복제는 구성을 바꾸지 않는다 — 사본은 공용이 된다) | 403 |
| private | isOwner | 403 |

### 2단계 — 목표 모드를 고를 수 있는가 (op == patch 이고 patch가 `accessMode`를 바꿀 때만)

```
after = ViewAccessModeOf(projectPatch(stored, patch))
if after == mode → 통과
if after == admin   && !isAdmin → 403
if after == private && !isOwner → 403
if after == private && IsLastSharedView(board, stored) → 400
```

`accessMode`를 `deletedFields`로 지우는 patch는 `after == everyone`으로 읽는다.

### 3단계 — 마지막 비개인 뷰 보호 (op == delete 일 때)

```
if mode != private && IsLastSharedView(board, stored) → 400
```

`IsLastSharedView`: `GetBlocksWithType(board.ID, "view")` 중 `deleteAt == 0 && mode != private`인
것이 그 뷰 하나뿐이다.

### op별 보충

- **duplicate (P4)**: 1단계만. 관리자 뷰는 누구나(편집 권한자) 복제할 수 있고, 개인
  뷰는 isOwner만. 통과하면 복사 뒤 사본 뷰의 `accessMode`를 지워 공용으로 만든다
  (FR-026, 표 G-13).
- **undelete (P5)**: `stored`는 히스토리의 마지막 항목. 1단계만.
- **upsert (P6)**: store에 같은 ID의 뷰가 있을 때 `stored`는 그 블록. 1단계 + 2단계
  (들어오는 블록의 모드를 `after`로 본다). 새 ID면 관문 없음 — 새 뷰의 `accessMode`가
  `admin`이면 isAdmin을 요구하고, `private`이면 그대로 허용(createdBy는 서버가 요청자로
  채운다).

## 응답

| 상황 | 코드 | 비고 |
|---|---|---|
| 통과 | 200 | 기존 응답 그대로 |
| 권한 부족 | 403 | `model.NewErrPermission` |
| 마지막 비개인 뷰 | 400 | `model.NewErrBadRequest` |

배치(P2)는 하나라도 거절되면 전체를 거절한다(기존 규칙).

## 계약 검증 케이스

| ID | mode | 요청자 | op / patch | 기대 | FR |
|---|---|---|---|---|---|
| G-01 | 없음(everyone) | editor | patch filter | 200 | FR-004 |
| G-02 | everyone | editor | delete | 200 | FR-004 |
| G-03 | admin | editor | patch filter | 403 | FR-006 |
| G-04 | admin | editor | patch title | 403 | FR-006 |
| G-05 | admin | editor | delete | 403 | FR-007 |
| G-06 | admin | editor | patch `{cardOrder}`만 | 200 | FR-008 |
| G-07 | admin | editor | patch `{cardOrder, sortOptions}` | 403 | FR-008 |
| G-08 | admin | admin | patch filter / delete | 200 | FR-006·007 |
| G-09 | admin | editor | patch accessMode→everyone | 403 | FR-015 |
| G-10 | everyone | editor(비관리자) | patch accessMode→admin | 403 | FR-015 |
| G-11 | everyone | admin | patch accessMode→admin | 200 | FR-015 |
| G-12 | everyone | 만든 사람 아닌 editor | patch accessMode→private | 403 | FR-015 |
| G-13 | admin | editor | duplicate | 200, 사본 accessMode 없음 | FR-009·026 |
| G-14 | everyone | 만든 사람 | patch accessMode→private | 200 | FR-015 |
| G-15 | everyone(마지막 비개인) | 만든 사람 | patch accessMode→private | 400 | FR-016 |
| G-16 | everyone(마지막 비개인) | admin | delete | 400 | FR-016 |
| G-17 | private | 만든 사람 | patch / delete | 200 | FR-011 |
| G-18 | private | 다른 editor | patch / delete / duplicate / undelete / upsert | 403 | FR-011 |
| G-19 | private | admin(만든 사람 아님) | patch / delete (일반 경로) | 403 | FR-011·012 |
| G-20 | private | 만든 사람이면서 admin | patch accessMode→admin | 200 | FR-015 |
| G-21 | 값이 `"locked"`(모르는 값) | editor | patch filter | 200 | FR-003 |
| G-22 | admin | editor | patch (카드 블록, 뷰 아님) | 관문 무관, 009 판정만 | FR-018 |

G-01 · G-02 · G-21 · G-22가 회귀 방지의 핵심이다. 이 기능은 모드를 정하지 않은 뷰와 뷰가
아닌 블록을 한 톨도 바꾸지 않아야 한다(US2 · SC-003).
