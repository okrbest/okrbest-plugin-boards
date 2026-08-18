# Research: 속성 편집을 관리자에게만 열지 보드가 정한다

**작성**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

명세에는 `NEEDS CLARIFICATION`이 없다. 이 문서는 계획이 기대는 사실을 코드로 확인한
기록이다. 각 항목은 실제로 실행한 조회의 결과다.

## R1. 카드 속성을 바꾸는 요청 경로는 정확히 둘이다

**Decision**: `PATCH /boards/{boardID}`와 `PATCH /boards-and-blocks` 두 곳에서 같은
판정을 한다.

**근거**: `model.BoardPatch`를 받는 핸들러를 전수 조회했다.

| 경로 | 핸들러 | 무엇이 지나가나 |
|---|---|---|
| `PATCH /boards/{boardID}` | `server/api/boards.go` `handlePatchBoard` | 속성 추가, 옵션 편집 |
| `PATCH /boards-and-blocks` | `server/api/boards_and_blocks.go` `handlePatchBoardsAndBlocks` | 속성 삭제, 유형 변경 |

두 번째를 빠뜨리면 **속성 삭제와 유형 변경이 그대로 통과한다.** 이 조작들은 보드와
카드를 함께 고쳐야 해서 묶음 경로를 쓴다. FR-011이 존재하는 이유가 이것이다.

**Alternatives considered**: 한 경로만 막고 나머지는 화면으로 가린다 — 기각. FR-010이
화면을 거치지 않은 요청도 같은 답을 받으라고 못 박는다.

**범위 밖으로 확인한 것**:

- `server/app/import.go` — 가져오기가 보드를 만들 때 속성을 채운다. 보드 생성 경로라
  FR-015에 따라 건드리지 않는다.
- `server/app/onboarding.go` — 환영 보드를 만들며 app 레이어에서 직접 패치한다. 사용자
  요청이 아니므로 API 관문의 영향을 받지 않고, 받아서도 안 된다.

## R2. 판정 자리는 API 레이어다

**Decision**: 관문을 `server/api/`에 둔다.

**근거**: 같은 파일에 선례가 둘 있다. `handlePatchBoard`가 카드 접근 규칙을
(`patchTouchesPropertyAccess`) 그리고 OKR 보드 토글을 (`patchTouchesOkrBoard`) API
레이어에서 막는다. 보드 패치의 권한 판정은 이미 이 레이어에 산다.

app 레이어에 두면 `onboarding.go`의 내부 패치까지 잡힌다 — R1이 짚은 대로 그건 잡으면
안 되는 호출이다.

두 핸들러 모두 `package api`라 헬퍼 하나를 공유할 수 있다.

**Alternatives considered**: `app.PatchBoard`에서 판정 — 기각. 내부 호출과 사용자 요청을
가르지 못한다.

## R3. 설정 조회 비용이 없다

**Decision**: 관문이 보드를 읽어 잠금 여부를 본다.

**근거**: `handlePatchBoardsAndBlocks`는 판정 지점 바로 뒤에서 이미 `a.app.GetBoard(boardID)`를
호출한다(`server/api/boards_and_blocks.go:250`). `handlePatchBoard`도 이웃한
`applyPropertyAccessPatch` 경로에서 보드를 읽는다. 추가 조회 한 번이 늘 뿐이고 보드에는
캐시 계층이 없다(플러그인 store에 board 캐시가 없음을 확인했다).

## R4. 토글 UI는 기존 패턴을 그대로 쓴다

**Decision**: `webapp/src/components/shareBoard/okrBoardSection.tsx`와 같은 모양의 섹션을
하나 더 만든다. `Switch` 위젯 + `BoardPermissionGate`.

**근거**: 헌법 원칙 II는 새 시각 언어 도입을 금지하고 같은 화면·같은 역할의 기존
컴포넌트를 차용하라고 한다. 공유 위젯에는 이미 같은 역할(보드 단위 켜기/끄기)의 섹션이
있고, `tabs-content` 클래스와 `text-heading2`·`text-light` 조합을 쓴다. 새 SCSS 파일을
만들지 않는다.

i18n 선례도 같다 — `OkrBoard.title`·`OkrBoard.description` 두 키가 en/ko 양쪽에 있다.

## R5. 옵션 편집만 골라 감출 수 있다

**Decision**: `ValueSelector`에 넘기는 옵션 편집 콜백만 조건부로 전달한다.

**근거**: `webapp/src/widgets/valueSelector.tsx`의 `onCreate`·`onChangeColor`·
`onDeleteOption`·`onStartRename`·`onReorderOption`이 전부 선택적 prop이고, 위젯이 콜백
없으면 해당 조작을 렌더링하지 않는다(`props.onChangeColor && (...)` 형태). 값 고르기
(`onChange`)와 값 비우기(`onDeleteValue`)는 별개 prop이라 그대로 남는다.

새 컴포넌트도 새 분기 UI도 필요 없다 — FR-013(값 고르는 자리는 그대로)이 공짜로 지켜진다.

**Alternatives considered**: 잠금 상태를 `readOnly`로 넘긴다 — 기각. `readOnly`는 값
고르기까지 막아 FR-013을 깬다.

## R6. 화면 표면은 다섯이다

**Decision**: 아래 다섯 곳이 FR-012의 대상이다.

| 표면 | 파일 | 현재 게이트 |
|---|---|---|
| 표 헤더 메뉴(속성 추가·삭제) | `webapp/src/components/table/tableHeaderMenu.tsx` | **없음** |
| 카드 상세 속성(추가·이름/유형·삭제) | `webapp/src/components/cardDetail/cardDetailProperties.tsx` | `ManageBoardProperties` |
| select 값 입력(옵션 편집) | `webapp/src/properties/select/select.tsx` | `readOnly`만 |
| multiselect 값 입력(옵션 편집) | `webapp/src/properties/multiselect/multiselect.tsx` | `readOnly`만 |
| 칸반 열 머리·열 추가(옵션 편집) | `webapp/src/components/kanban/kanbanColumnHeader.tsx`, `kanban.tsx` | `ManageBoardProperties` |

표 헤더 메뉴에 게이트가 없다는 것은 조회로 확인했다. 잠금과 무관하게 이 자리는 새로
감싸야 한다.

## R7. 기존 권한 상수를 그대로 쓴다

**Decision**: 잠금이 켜졌을 때 요구하는 등급은 카드 접근 규칙·OKR 보드 토글과 같은
바(Manage 등급)다.

**근거**: `server/model/board_permissions.go`의 `RequiredPermissionLevel`이 여러 권한
상수를 같은 Manage 등급으로 접는다. 이 저장소는 "보드 관리자만"을 표현할 때
`PermissionManageBoardRoles`를 이미 두 번 썼다(접근 규칙, OKR 토글). 세 번째도 같은
것을 쓰면 바가 하나로 유지된다.

보드 멤버가 아닌 시스템관리자는 이 등급에 닿지 못하지만, 그 사용자는 지금도 보드 패치
관문(`PermissionManageBoardProperties`)에서 먼저 막혀 보드를 수정할 수 없다. 이 기능이
그 자리를 새로 열지 않는다 — 명세 Assumptions에 적힌 그대로다.

**Alternatives considered**: 새 권한 상수 신설 — 기각. 해석 결과가 같아 이름만 늘어난다.

## R8. 마이그레이션이 필요 없다

**Decision**: DB 마이그레이션을 만들지 않는다.

**근거**: 설정은 `board.properties` JSON 자리에 산다. 값이 없으면 꺼짐이고(FR-002),
기존 보드는 전부 값이 없다. 헌법 원칙 VII의 마이그레이션 규율이 적용될 스키마 변경이
없다.
