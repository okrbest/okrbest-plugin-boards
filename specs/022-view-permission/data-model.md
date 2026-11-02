# 데이터 모델: 뷰마다 권한 모드를 정한다

DB 스키마 변경은 없다. 모델은 뷰 블록의 JSON 필드 하나와, 그것을 읽는 규칙, 전환 표,
관리자 목록 요약 셋이다. Go와 TypeScript가 같은 규칙을 각자 들고 테스트로 어긋남을 막는다.

## 뷰 권한 모드 (ViewAccessMode)

```
ViewAccessMode = 'everyone' | 'admin' | 'private'
```

| 값 | 화면 이름 (ko / en) | 뜻 |
|---|---|---|
| `everyone` | 공용 / Everyone | 보드 접근자 모두 보고, 편집 권한자 모두 구성을 바꾼다. 기본값 |
| `admin` | 관리자 / Admins | 모두 보되 관리자만 구성을 바꾼다 |
| `private` | 개인 / Private | 만든 사람만 보고 바꾼다 |

### 저장 위치

```
BoardView.fields.accessMode?: ViewAccessMode     // 선택. 없으면 everyone
```

- Go: `block.Fields["accessMode"]`. TS: `view.fields.accessMode`.
- `createBoardView(block)`는 다른 필드처럼 값을 복사한다. 복사하지 않으면 뷰 patch 때
  `createPatchesFromBlocks`가 키를 지운다.

### 읽기 규칙 (양쪽 동일)

```
ViewAccessModeOf(block):
    v = block.fields.accessMode
    if v == 'admin'   → admin
    if v == 'private' → private
    otherwise         → everyone     // 없음, 'everyone', 문자열 아님, 모르는 값 전부
```

반쯤 이해한 값을 잠금이나 숨김으로 읽지 않는다(FR-003).

### 파생 판정

```
ViewHiddenFrom(block, userID)  = block.type == 'view' && mode == private && block.createdBy != userID
ViewConfigLocked(mode, isAdmin) = mode == admin && !isAdmin
IsCardOrderOnlyPatch(patch)     = patch.title == nil && patch.parentId == nil && patch.schema == nil
                                  && patch.type == nil && len(patch.deletedFields) == 0
                                  && keys(patch.updatedFields) == {'cardOrder'}
```

## 모드 전환 표

전환은 **현재 모드를 건드릴 권한**과 **목표 모드를 고를 권한**을 둘 다 요구한다(FR-015).

| 모드 | 건드릴 권한 | 고를 권한 |
|---|---|---|
| `everyone` | 보드 편집 권한(`ManageBoardCards`) | 항상 |
| `admin` | 관리자(`ManageBoardRoles`) | 관리자 |
| `private` | 만든 사람(`createdBy == userID`) | 만든 사람 |

여기에 **마지막 비개인 뷰 보호**가 겹친다(FR-016): 보드의 `DeleteAt == 0 && mode != private`인
뷰가 하나뿐이고 그 뷰가 대상이면 `→ private` 전환과 삭제를 거절한다.

### webapp이 보여 줄 항목 (`accessModeTargets`)

입력: `{mode, isAdmin, isCreator, isLastShared}` → 출력: 고를 수 있는 모드 집합.

```
canTouch = (mode == everyone) || (mode == admin && isAdmin) || (mode == private && isCreator)
if !canTouch → {}            // 버튼 비활성 + 안내
targets = {everyone}
if isAdmin                       → + admin
if isCreator && !isLastShared    → + private
```

현재 모드도 목록에 남겨 체크 표시로 보여 준다. `targets == {현재 모드}`면 바꿀 것이 없으므로
버튼을 비활성으로 보여 준다(FR-021).

### 서버 판정 입력

```
requireViewWritePermission(userID, stored, patch, board, op)
    stored : 저장된(또는 히스토리의) 뷰 블록 — 모드 · createdBy의 출처
    patch  : op == patch 일 때만. 모드 변경 여부 · cardOrder-only 여부를 본다
    op     : patch | delete | duplicate | undelete | upsert
```

판정 표는 [contracts/view-write-gate.md](contracts/view-write-gate.md).

## 관리자용 개인 뷰 요약 (PrivateViewSummary)

```
PrivateViewSummary = {
    id:        string   // 뷰 블록 ID
    title:     string
    createdBy: string   // 사용자 ID. 표시 이름은 webapp이 getUsersList로 조회
    createAt:  number   // ms epoch
}
```

구성(필터 · 정렬 · 표시 속성)은 싣지 않는다(FR-023). `GET /boards/{boardID}/views/private`의
응답이고 webapp 컴포넌트의 로컬 상태로만 쓴다 — Redux 슬라이스를 만들지 않는다
(열 때마다 새로 읽는 관리 화면이다).

## 공용 → 개인 전환 tombstone

```
Block{ id, boardId, updateAt: now, deleteAt: now }      // 그 외 비어 있음
수신자 = getUserIDsForTeamAndBoard(team, board) − {createdBy}
```

기존 `BroadcastBlockDelete`와 같은 모양이다. webapp은 `deleteAt !== 0`인 블록을 `updateViews`로
넘겨 스토어에서 지운다. 현재 뷰였다면 이 기능이 더하는 리다이렉트 fallback(FR-014 — 보이는
뷰 목록에 현재 뷰가 없으면 첫 번째 보이는 뷰로)이 첫 뷰로 보낸다. 지금 코드에는 이 fallback이
없어 모르는 뷰 주소는 빈 화면이 된다.

클러스터: `ClusterMessage.ExcludeUsers []string`을 더해 다른 노드의
`sendBoardMessageSkipCluster`도 같은 제외를 적용한다.

## webapp 훅 출력 (`useViewAccess`)

```
useViewAccess(view, sharedViewCount) → {
    mode:       ViewAccessMode
    isAdmin:    boolean      // canManageBoard capability
    isCreator:  boolean      // me.id === view.createdBy
    locked:     boolean      // ViewConfigLocked(mode, isAdmin)
    targets:    ViewAccessMode[]
    canChange:  boolean      // targets.length > 0 && targets가 현재 모드만은 아님
}
```

소비자: 권한 메뉴, 뷰 헤더(메뉴 비활성), 뷰 탭 메뉴(이름 변경 · 삭제 숨김, canDelete),
기본 템플릿 항목.

## 기존 모델과의 관계

- `Block.CreatedBy`: 서버가 삽입 때 세션 사용자로 채운다(`sqlstore/blocks.go:304`). 새 저장
  항목이 없다.
- 021의 개인 로컬 상태(`viewLocalState`)와 독립이다. 그 값들은 서버에 가지 않으므로 이
  기능의 관문과 만나지 않는다.
- 009의 `FilterBlocksForUser` · `FilterBlockRecipients`에 앞단 판정으로 끼어든다. 카드
  규칙의 evaluator는 건드리지 않는다.
- 010의 `AdminOnlyCardPropertiesKey`와는 자리가 다르다(보드 속성 vs 뷰 필드). 관리자
  판정(`ManageBoardRoles`)만 공유한다.
