# Research: 숨긴 보드를 사이드바에서 되찾는다

**작성**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

명세에는 `NEEDS CLARIFICATION`이 없다. 이 문서는 계획이 기대는 사실을 코드로 확인한
기록이다. 각 항목은 실제로 실행한 조회의 결과다.

## R1. 숨김 해제는 서버 경로가 이미 있고 실시간 전파까지 한다

**Decision**: 기존 `octoClient.unhideBoard(categoryID, boardID)`를 그대로 쓴다. 서버
변경 없음.

**근거**: `PUT /teams/{teamID}/categories/{categoryID}/boards/{boardID}/unhide`
(`server/api/categories.go` `handleUnhideBoard`)가 `app.SetBoardVisibility(..., true)`를
부르고, 그 함수가 저장 직후 `BroadcastCategoryBoardChange`로 `blockCategories` 웹소켓
이벤트(`hidden: false`)를 보낸다 (`server/app/category_boards.go:268-282`). 사이드바는
이미 이 이벤트를 `updateBoardCategories`로 받는다 (`sidebar.tsx`). 같은 계정의 다른 탭·
기기 반영(FR-014)은 새 코드 없이 충족된다.

`boardPage.tsx:298`의 자동 복구가 정확히 이 호출을 쓴다. 명세의 가정("보드 찾기로 열 때와
같은 동작")이 코드로 확인된다.

**Alternatives considered**: "모두 표시"용 일괄 엔드포인트 — 기각. 숨긴 보드는 한 자리
수이고 순차 호출로 충분하다(명세 가정). 서버를 건드리면 원칙 I의 Go 게이트까지 얹힌다.

## R2. 숨김 상태의 진실은 카테고리 메타데이터 하나다

**Decision**: 숨긴 보드는 `categoryBoards.boardMetadata`의 `hidden` 항목에서만 읽는다.

**근거**: `state.sidebar.hiddenBoardIDs`는 같은 메타데이터에서 파생된 값이고
(`store/sidebar.ts`), `workspace.tsx`·`boardPage.tsx`가 그것을 읽는다. `user.tsx:38`의
사용자 설정 `hiddenBoardIDs`는 카테고리 이전 시대의 잔재로 사이드바가 참조하지 않는다.
사이드바 렌더링은 이미 메타데이터의 `hidden`으로 보이는 보드를 거른다
(`categoryBoards.ts` `getVisibleCategoryBoards`).

**Alternatives considered**: 사용자 설정 값을 함께 본다 — 기각. 두 출처가 어긋날 때
어느 쪽이 맞는지 정할 근거가 없고, 사이드바 표시와 다른 답을 낼 수 있다.

## R3. 알림은 전역 2초이고 동작 버튼이 없다

**Decision**: `FlashMessage`에 선택 필드 둘을 더한다 — `action?: {label, onClick}`,
`durationMs?: number`. `FlashMessages`는 `durationMs`가 있으면 그것을, 없으면 지금처럼
`props.milliseconds`를 쓴다. 숨기기 알림만 5200ms를 지정한다 — `FlashMessages`가 `durationMs - 200`에 퇴장을 시작하므로 온전히 보이는 시간이 5초가 된다 (FR-008).

**근거**: `app.tsx:47`이 `<FlashMessages milliseconds={2000}/>` 하나를 전역으로 둔다.
`App`은 독립 실행(`main.tsx`)과 플러그인(`index.tsx:140`) 양쪽에서 렌더되므로 플러그인
모드에서도 이 알림이 뜬다. `FlashMessage`는 `{content, severity}`뿐이라 버튼을 넣을 자리가
없다. 컨테이너 `onClick`이 알림을 닫으므로 버튼은 전파를 막아야 한다.

**Alternatives considered**: 전역 시간을 5초로 올린다 — 기각. 다른 모든 알림의 동작이
바뀌고(원칙 II: 요청 없는 변경), 오류 알림이 화면을 오래 가린다. `content`에 버튼을
ReactNode로 끼워 넣는다 — 기각. 닫기 처리와 전파 차단이 호출부마다 반복되고 스타일이
갈라진다.

## R4. 접힘 행은 카테고리 Droppable 바깥, 보드 목록 바로 아래에 둔다

**Decision**: `sidebarCategory.tsx`에서 `</Droppable>` 닫힘 직후(현재 409행 부근),
모달들 앞에 행을 그린다. 표시 조건은 보드 목록과 같은 식
`!(collapsed || props.forceCollapse || snapshot.isDragging || props.draggedItemID === props.categoryBoards.id)`
을 재사용한다.

**근거**: 카테고리는 바깥 `Draggable` 안에 `Droppable`(보드 목록)을 품는 구조다. Droppable의
`innerRef` div 밖에 있는 요소는 hello-pangea가 드롭 위치 계산에 넣지 않는다. 016 직전
수정(e16cd220)이 드롭 인덱스를 `getVisibleCategoryBoards` 기준으로 고정했으므로, 행이
Draggable을 그리지 않는 한 FR-012·SC-005는 구조로 보장된다. 카테고리 접힘·끌기 중에는
보드 목록이 사라지므로 행도 같은 조건으로 사라진다 (FR-002, 경계 사례).

**Alternatives considered**: Droppable 안 `placeholder` 뒤에 둔다 — 기각. 드래그 중
자리표시자 아래에 행이 남아 시각적으로 흔들리고, 드롭 영역 높이에 끼어든다.

## R5. 사이드바의 시각 언어를 그대로 쓴다

**Decision**: 새 시각 요소를 만들지 않는다.

| 필요 | 이미 있는 것 |
|---|---|
| 흐린 하위 행 | `octo-sidebar-item subitem` (`sidebarCategory.scss:34`, 64% 불투명) |
| 더 흐린 안내 행 | `octo-sidebar-item subitem no-views` (40% 불투명, "보드가 존재하지 않음"이 쓴다) |
| 접힘/펼침 표시 | `ChevronRight`/`ChevronDown` — `sidebarCategory.tsx`가 이미 import |
| 숨김 표시 | `widgets/icons/hide.tsx` `HideIcon` (눈에 사선) |
| 다시 표시 버튼 | `widgets/buttons/iconButton.tsx` `IconButton` + `widgets/icons/show.tsx` `ShowIcon`, `title`로 접근 가능한 이름 |
| 모두 표시 버튼 | `widgets/buttons/button.tsx` `Button` (기존 위젯) |
| hover 때만 버튼 노출 | `sidebarBoardItem.scss:102-112`의 `.MenuWrapper { display: none }` + `:hover` 패턴 |

스타일은 `sidebarCategory.scss`의 `.SidebarCategory` 블록 안에 `.HiddenBoardsRow`를
더한다. 색·간격은 같은 파일의 CSS 변수와 값을 쓴다.

**Alternatives considered**: compass 아이콘의 eye-off — 기각. 같은 뜻의 아이콘이 이미
저장소에 있다.

## R6. 테스트 기반은 이미 갖춰져 있다

**Decision**: 기존 파일에 케이스를 더하고, 새 컴포넌트에는 colocated 테스트를 둔다.

**근거**:

- `flashMessages.test.tsx` — fake timer + 스냅샷. 동작 버튼·개별 시간 케이스를 더한다.
- `sidebarBoardItem.test.tsx` — `wrapRBDNDDroppable` + mock store로 항목을 그린다.
  숨기기 → 알림 → 실행 취소 → unhide 호출 케이스를 더한다. `octoClient`는 jest.mock.
- `sidebarCategory.test.tsx` — 카테고리 전체를 mock store로 그린다. 행 표시·빈 문구
  케이스를 더한다. 스냅샷 id가 밀리지 않도록 describe **끝**에 붙인다(저장소 메모).
- `categoryBoards.test.ts` — 순수 함수. `getHiddenCategoryBoards`를 같은 꼴로 더한다.
- `mutator.test.ts` — `octoClient`를 jest.mock 하고 dispatch 결과를 본다. `unhideBoard` 케이스를 더한다.
- `sidebar.test.tsx` — 기존 `dont show hidden boards`(178행)가 숨긴 보드 1개일 때 "No boards inside"를 기대한다. US3가 이 기대를 뒤집는다.
- `sidebarBoardDnd.test.tsx` — 016 직전 수정의 DnD 회귀 테스트. 그대로 통과해야 한다.

## R7. i18n 키

**Decision**: 키 6개. en.json은 `npm run i18n-extract`가 코드에서 뽑고, ko.json은 같은
변경에서 손으로 더한다.

| 키 | en | ko |
|---|---|---|
| `HiddenBoards.count` | `{count, plural, one {# hidden board} other {# hidden boards}}` | `숨긴 보드 {count}개` |
| `HiddenBoards.show` | `Show` | `다시 표시` |
| `HiddenBoards.showAll` | `Show all` | `모두 표시` |
| `HiddenBoards.showFailed` | `Couldn't show the board` | `보드를 다시 표시하지 못했습니다` |
| `HideBoard.hiddenNotice` | `“{title}” was hidden` | `“{title}” 보드를 숨겼습니다` |

따옴표는 굽은따옴표(“ ”)를 쓴다. ICU MessageFormat에서 곧은 작은따옴표는 이스케이프
문자라 `'{title}'`이 자리표시자로 해석되지 않는다(구현 중 실측).
| `HideBoard.undo` | `Undo` | `실행 취소` |

기존 키 `HideBoard.MenuOption`("보드 숨기기")과 `Sidebar.no-boards-in-category`는 그대로
둔다.

## R8. 숨긴 보드 목록은 `categoryBoards.ts`가 계산한다

**Decision**: `getHiddenCategoryBoards(category, boards): Board[]`를
`getVisibleCategoryBoards` 옆에 둔다. 메타데이터 순서를 따르고, `hidden`이면서 스토어에
있는 보드만, 템플릿은 뺀다.

**근거**: 016 직전 수정이 "화면 목록 계산은 이 모듈 하나"로 정리했다. 숨긴 목록도 같은
자리에서 같은 규칙(스토어에 없는 보드는 세지 않음, 템플릿 제외)을 따라야 경계 사례
("지워졌거나 권한을 잃은 보드는 세지 않는다")가 저절로 맞는다.

## R9. 지금 보고 있는 보드를 숨기면 화면이 이미 다른 보드로 옮겨진다

**Decision**: 실행 취소는 숨김만 해제하고 화면을 옮기지 않는다 (FR-009).

**근거**: `sidebarBoardItem.tsx:166-185`가 숨기는 보드가 현재 보드면 첫 번째 보이는
보드로 이동한다. `workspace.tsx:121·149`는 현재 보드가 숨김이면 아무것도 그리지 않는다.
실행 취소가 화면을 되돌리려면 이동 전 경로를 기억해야 하는데, 그사이 사용자가 다른 곳으로
갔을 수 있어 되돌릴 자리가 모호하다. 명세 US2-5가 이 결정을 못 박는다.

## R10. 실패는 응답으로만 알 수 있다

**Decision**: `octoClient.unhideBoard`가 돌려주는 `Response`의 `ok`를 확인한다. 실패면
스토어를 건드리지 않고 `severity: 'high'` 알림을 띄운다. 네트워크 예외도 같은 알림이다.

**근거**: `octoClient.hideBoard/unhideBoard`는 상태 코드와 무관하게 `Response`를 돌려준다
(`octoClient.ts:1300-1315`). 지금 `sidebarBoardItem.tsx:158`은 `hideBoard` 응답을 보지
않고 스토어를 갱신한다. 되찾기에서는 실패를 삼키면 SC-006을 어긴다.

## R11. 화면에서만 복구된 보드는 서버 카테고리에 없다

**Decision**: 검증은 카테고리에 실제로 속한 보드로 한다. 이 경계는 016 범위 밖이다.

**근거**: 016 직전 수정이 밝힌 대로, 공개 보드를 암묵적으로 보는 사용자는 카테고리에
없는 보드를 화면에서만 복구해 본다. 그런 보드를 숨기면 서버는 존재하지 않는 행을
갱신하려다 빈손으로 끝나고, 새로 열면 다시 보인다. 사이드바에서 순서를 한 번 바꾸면
직전 수정이 그 보드들을 서버 카테고리에 등록하므로, quickstart는 그 뒤에 확인한다.
