# Contract: 화면 표면 · i18n

**Spec**: [spec.md](../spec.md) | FR-019~FR-022, FR-029

화면은 서버가 거절할 조작을 사용자에게 내밀지 않고, 왜 못 하는지 알려 준다. 서버가
진실이고 화면은 같은 답을 한다.

## 입력 — `useViewAccess(view, sharedViewCount)`

```
mode, isAdmin(canManageBoard), isCreator(me.id === view.createdBy),
locked = mode === 'admin' && !isAdmin,
targets = accessModeTargets({mode, isAdmin, isCreator, isLastShared: sharedViewCount <= 1}),
canChange = targets에 현재 모드 외의 값이 있음
```

## 표면과 기대

| ID | 표면 | 공용 | 관리자 · 비관리자 | 관리자 · 관리자 | 개인 · 만든 사람 |
|---|---|---|---|---|---|
| U-01 | 뷰 헤더 — 속성 · 그룹화 · 필터 · 정렬 · 날짜 기준 메뉴 | 지금 그대로 | **비활성** + 툴팁 `ViewHeader.admin-only-view` | 활성 | 활성 |
| U-02 | 뷰 헤더 — **권한 메뉴 버튼** (정렬 뒤) | 라벨 "공용" | 라벨 "관리자", 비활성 + 툴팁 | 라벨 "관리자", 활성 | 라벨 "개인", 활성 |
| U-03 | 권한 메뉴 — 항목 | targets만 렌더. 관리자 항목은 isAdmin, 개인 항목은 isCreator && !isLastShared | (열리지 않음) | 공용 · 관리자 (+ 개인 if isCreator) | 공용 · 개인 (+ 관리자 if isAdmin) |
| U-04 | 권한 메뉴 — 현재 모드 표시 | 체크 아이콘 | — | 체크 | 체크 |
| U-05 | 뷰 탭 메뉴 — 이름 변경 | 있음 | **없음** | 있음 | 있음 |
| U-06 | 뷰 탭 메뉴 — 삭제 | 비개인 뷰 수 > 1 | **없음** | 비개인 뷰 수 > 1 | 있음 (개인 뷰는 보호 대상 아님) |
| U-07 | 뷰 탭 메뉴 — 복제 | 있음 | **있음** | 있음 | 있음 |
| U-08 | 새 카드 메뉴 — 기본 템플릿 지정 | 지금 그대로 | **비활성** | 활성 | 활성 |
| U-09 | 카드 끌기 · 열 안 순서 · 검색 · 그룹 접기 · 열 너비 | 지금 그대로 | **지금 그대로** | 지금 그대로 | 지금 그대로 |
| U-10 | 칸반 열 순서 끌기 · 열 숨기기 · 숨긴 열 보이기 | 지금 그대로 | **끌기 불가, 숨기기·보이기 항목 없음**(기존 `readonly \|\| !canEditProperties` 게이트에 `locked`를 합친다). 열 이름·색·삭제는 010의 판정 그대로 | 지금 그대로 | 지금 그대로 |
| U-14 | 보이는 뷰 목록에 없는 뷰 주소 · 마지막에 본 뷰 기억이 숨겨진 뷰 | 첫 번째 보이는 뷰로 리다이렉트 | 〃 | 〃 | 〃 |
| U-11 | 탭 목록 | 공용 · 관리자 · 내 개인 뷰만 | 〃 | 〃 (남의 개인 뷰 없음) | 〃 |
| U-12 | 공유 위젯 — 개인 뷰 섹션 | 관리자에게만. 이름 · 만든 사람 · 날짜 · 삭제. 비어 있으면 빈 상태 문구 | | | |
| U-13 | 개인 뷰 섹션 — 삭제 | `ConfirmationDialogBox` 확인 뒤 삭제, 목록 갱신 | | | |

**비관리자**는 보드 편집 권한이 있는 팀원이다. 보기 권한만 있는 사용자는 지금처럼 모든
구성 메뉴가 비활성이고 권한 메뉴도 비활성이다(targets 비어 있음).

## 전환 동작

- 권한 메뉴에서 항목을 고르면 `mutator.changeViewAccessMode(boardId, viewId, oldMode, newMode)`.
  낙관적 갱신 → patch → 실패 시 복구(정렬 메뉴와 같은 모양). undo 스택에 들어간다.
- 개인으로 바꾼 직후 만든 사람 화면은 그대로다. 다른 사용자의 탭은 websocket tombstone으로
  사라지고, 그 뷰를 보고 있었다면 첫 번째 보이는 뷰로 이동한다(U-14 — 이 기능이 더하는
  fallback. 지금 리다이렉트는 주소에 뷰가 없을 때만 동작하고 모르는 뷰 주소는 빈 화면이다).
- 서버 거절이 화면에 닿는 예외 경로(열어 둔 패널에서 저장 등)에서는 `mutator`의 거절
  플래시가 뜬다. 문구는 카드 전용이 아닌 중립 문구(`Mutator.edit-refused`)로 바꾸고
  메시지 ID로 정의한다. `sendFlashMessage`의 `content`가 `React.ReactNode`이므로 mutator.ts에서
  `React.createElement(FormattedMessage, …)`로 넘긴다.
- 관리자로 바꾼 직후 팀원 화면은 websocket 갱신으로 메뉴가 비활성으로 바뀐다.

## 뷰 복제 사본

`handleDuplicate`가 만드는 사본은 `fields.accessMode`를 지운다(공용). 원본이 개인 뷰여도
사본은 공용이다 — 만든 사람이 의도한 조작이고 다시 개인으로 바꿀 수 있다.

## 새 뷰

`handleAddView`는 바꾸지 않는다. `accessMode` 없음 = 공용.

## i18n 키 (en.json · ko.json 동시 추가)

| 키 | en | ko |
|---|---|---|
| `ViewHeader.access` | Access | 권한 |
| `ViewHeader.access-everyone` | Everyone | 공용 |
| `ViewHeader.access-admin` | Admins | 관리자 |
| `ViewHeader.access-private` | Private | 개인 |
| `ViewHeader.access-cannot-change` | You can't change who may edit this view. | 이 뷰의 권한은 바꿀 수 없습니다. |
| `ViewHeader.admin-only-view` | Only board admins can change this view. | 이 뷰는 관리자만 수정할 수 있습니다. |
| `PrivateViews.title` | Private views | 개인 뷰 |
| `PrivateViews.description` | Views only their creator can see. Delete the ones left behind by people who are gone. | 만든 사람만 볼 수 있는 뷰입니다. 떠난 사람이 남긴 뷰를 여기서 정리합니다. |
| `PrivateViews.empty` | No private views on this board. | 이 보드에는 개인 뷰가 없습니다. |
| `PrivateViews.createdBy` | Created by {name} on {date} | {name}이(가) {date}에 만듦 |
| `PrivateViews.delete` | Delete | 삭제 |
| `PrivateViews.confirm-delete` | Delete the private view "{title}"? Its creator will lose it. | 개인 뷰 "{title}"을(를) 지우시겠습니까? 만든 사람의 화면에서도 사라집니다. |
| `Mutator.edit-refused` | You don't have permission to edit this item. | 이 항목을 편집할 권한이 없습니다. |

ICU 곧은따옴표는 이스케이프하거나 굽은따옴표로 쓴다(i18n 메모). `i18n-extract`는 쓰지
않고 손으로 추가한다.

## 계약 검증 케이스 (webapp 테스트)

| ID | 컴포넌트 | 상황 | 기대 |
|---|---|---|---|
| W-01 | `viewAccess.test.ts` | 모드 읽기 — 없음 · everyone · admin · private · 모르는 값 | everyone · everyone · admin · private · everyone |
| W-02 | `viewAccess.test.ts` | `accessModeTargets` 조합 표(위 U-03) | 표와 일치 |
| W-03 | `viewHeaderAccessMenu.test.tsx` | 비관리자 · 공용 뷰 · 만든 사람 아님 | 버튼 비활성, 툴팁 있음 |
| W-04 | 〃 | 관리자 · 공용 뷰 | 공용 · 관리자 항목, 개인 없음 |
| W-05 | 〃 | 만든 사람 · 공용 뷰 · 비개인 뷰 2개 | 공용 · 개인 항목 |
| W-06 | 〃 | 만든 사람 · 공용 뷰 · 비개인 뷰 1개 | 개인 항목 없음 |
| W-07 | 〃 | 항목 클릭 | `mutator.changeViewAccessMode` 호출 |
| W-08 | `viewHeader.test.tsx` | 비관리자 · 관리자 뷰 | 속성 · 그룹화 · 필터 · 정렬 비활성, 툴팁 = admin-only-view |
| W-09 | `viewHeader.test.tsx` | 관리자 · 관리자 뷰 | 모두 활성 |
| W-10 | `viewTabs.test.tsx` | 비관리자 · 관리자 뷰 · 탭 메뉴 | 이름 변경 · 삭제 없음, 복제 있음 |
| W-11 | `viewTabs.test.tsx` | 공용 1 + 내 개인 1 | 공용 뷰 탭 메뉴에 삭제 없음 |
| W-12 | `viewTabs.test.tsx` | 복제 | insertBlock에 넘긴 뷰에 accessMode 없음 |
| W-13 | `store/views.test.ts` | A의 개인 뷰, me = B | `getCurrentBoardViews`에서 제외 |
| W-14 | `privateViewsSection.test.tsx` | 관리자 | 목록 렌더, 삭제 클릭 → 확인 → `deletePrivateView` 호출 |
| W-15 | 〃 | 비관리자 | 렌더 없음 |
| W-16 | 〃 | 빈 목록 | 빈 상태 문구 |
| W-17 | `kanbanColumnHeader.test.tsx` · `kanban.test.tsx` | 비관리자 · admin 뷰 | 열 헤더 `draggable` 아님, 메뉴에 숨기기 없음(이름·색·삭제는 010 판정대로), 숨긴 열 보이기 없음 |
| W-18 | `teamToBoardAndViewRedirect.test.tsx` | 주소의 viewId가 보이는 뷰 목록에 없음 · lastViewId가 숨겨진 뷰 | 첫 번째 보이는 뷰로 `navigate(replace)` |
