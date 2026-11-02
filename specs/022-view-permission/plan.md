# Implementation Plan: 뷰마다 권한 모드를 정한다 (관리자 · 공용 · 개인)

**Branch**: `022-view-permission` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-view-permission/spec.md`

## Summary

뷰 블록 `fields.accessMode`에 `everyone` · `admin` · `private` 중 하나를 저장한다. 값이
없으면 `everyone`이라 기존 뷰는 바뀌지 않는다. 서버가 세 가지를 강제한다. (1) 뷰 블록
쓰기 관문 — App 계층에 `requireViewWritePermission`을 두고 patch · delete · duplicate ·
undelete · upsert 삽입 여섯 경로가 모두 거친다. 관리자 뷰는 관리자(`PermissionManageBoardRoles`)만
구성을 바꾸되 `cardOrder`만 바꾸는 patch는 편집 권한자에게 연다. 개인 뷰는 만든 사람만
건드린다. (2) 개인 뷰 읽기 필터 — 카드 접근 권한(009)이 쓰는 `FilterBlocksForUser`와
`FilterBlockRecipients` 앞단에 "남의 개인 뷰 제거"를 끼운다. (3) 관리자 정리 API —
`GET/DELETE /boards/{boardID}/views/private[/{viewID}]`. 공용→개인 전환 때는 만든 사람 외의
구독자에게 ID만 담은 삭제 이벤트를 보내도록 ws 어댑터에 `BroadcastBlockDeleteExcept`를
더한다. webapp은 뷰 헤더 정렬 메뉴 뒤에 권한 메뉴를 붙이고, 잠긴 뷰에서는 기존
비활성·툴팁 패턴을 재사용하며, 공유 위젯 관리자 영역에 개인 뷰 목록 섹션을 더한다.

## Technical Context

**Language/Version**: Go 1.24.6 (server) + TypeScript 5.7 / React 19 (webapp)

**Primary Dependencies**: Gorilla Mux(API), Squirrel(store), Redux Toolkit, react-intl, Jest + React Testing Library, gomock + testify

**Storage**: 뷰 블록 `fields` JSON에 선택 키 하나(`accessMode`) 추가. DB 스키마 변경 없음, 마이그레이션 없음.

**Testing**: `make webapp-ci`(npm run check + test + check-types), `make server-lint`, `make server-test`(`go test -race ./...`). 회귀 판정은 실패 목록 diff(기준선은 구현 전 채취).

**Target Platform**: Mattermost 10.7.0+ 플러그인 (서버 + 브라우저 webapp)

**Project Type**: 단일 저장소 플러그인 — `server/`(plugin → api → app → store) + `webapp/`

**Performance Goals**: 블록 조회 · websocket 방송에 추가되는 판정은 블록당 맵 조회 두 번(모드 · 작성자)이라 측정 가능한 지연이 없어야 한다. 마지막 비개인 뷰 판정은 뷰 전환 · 삭제 때만 보드의 뷰 목록을 한 번 읽는다.

**Constraints**: 서버가 진실(FR-017·018). 기존 뷰(값 없음)의 동작 불변(FR-002·004·SC-003). `BoardView.fields` 외 upstream 데이터 구조 불변. 새 SCSS 파일 금지, 기존 위젯(`MenuWrapper`·`Menu.Text`·`Button`·`Switch`·`ConfirmationDialogBox`) 재사용. i18n은 `en.json`·`ko.json` 손 편집.

**Scale/Scope**: 서버 — 신규 파일 3(model · app · api) + 기존 파일 5 수정(blocks.go · boards_and_blocks.go · plugin_adapter.go · plugin_adapter_cluster.go · adapter.go). webapp — 신규 컴포넌트 2 + 유틸 1 + 훅 1, 기존 파일 8 수정. 테스트 colocated. 예상 접점 25~30 파일.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 패키지별 품질 게이트 | 통과 | server · webapp 모두 변경. `make server-lint` + `make server-test` + `make webapp-ci` 세 단계를 기준선 diff로 대조한다. 화면 동작 변경이므로 배포 후 [quickstart.md](quickstart.md)를 세 계정으로 훑은 결과를 완료 근거로 제시한다. |
| II. 레이어 경계·기존 패턴 | 통과 | 권한 판정은 App 계층(`requireViewWritePermission`), 라우팅은 API, 저장은 Store. 보드 복제의 개인 뷰 제외만 store `duplicateBoard`에 두는데, 그 함수가 이미 댓글을 같은 자리에서 거르므로 패턴 안이다. UI는 정렬 메뉴와 같은 `MenuWrapper`+`Menu.Text`, 공유 위젯의 기존 `.tabs-content`·`.user-items` 클래스, `ConfirmationDialogBox`를 그대로 쓴다. 신규 SCSS 파일 없음. |
| III. 타입·오류 엄격성 | 통과 | 모드 읽기는 알 수 없는 값을 `everyone`으로 돌려주는 전용 함수로 처리한다(`as any` 불필요). 서버 거절은 `model.NewErrPermission`/`NewErrBadRequest`. |
| IV. 동작 변경 시 테스트 동반 | 통과 | 서버: model(모드 읽기), app(쓰기 관문 표 · 필터 · 마지막 뷰 보호), api(관리자 엔드포인트 · 블록 조회 필터), ws(제외 대상 방송) colocated. webapp: `viewAccess.test.ts`, 권한 메뉴 · 개인 뷰 섹션 · viewHeader · viewTabs · 셀렉터 테스트. 실패를 먼저 확인한 뒤 통과시킨다. |
| V. i18n 동기화 | 통과 | 모드 이름 3 · 메뉴 라벨 · 안내 문구 2 · 섹션 제목/설명/빈 상태/확인 문구를 `en.json`·`ko.json`에 같은 커밋에서 추가한다. 키 목록은 [contracts/ui-surfaces.md](contracts/ui-surfaces.md). |
| VI. Upstream·라이선스 충실성 | 통과 | 라이선스 헤더 유지. `fields`에 선택 키 추가만 하므로 upstream 클라이언트는 무시하고 읽는다. plugin ID · API prefix 불변. |
| VII. DB 마이그레이션 규율 | 해당 없음 | 스키마 변경 없음. |
| VIII. 집중 브랜치 + PR | 통과 | `022-view-permission`에서 작업. 구현·검증 후 사용자 확인을 기다린 뒤 PR. |
| IX. Spec 주도 워크플로 | 통과 | specify → plan → tasks → implement 순서를 따르는 중. 구현 시 `test-driven-development` · `verification-before-completion`을 호출한다. |

Phase 1 설계 후 재점검: 위반 없음. 신규 시각 요소를 만들지 않고, 레이어를 건너뛰지
않으며, 데이터 호환을 유지한다. ws `Adapter` 인터페이스에 메서드 하나를 더하므로 mock이
있으면 `make generate`로 같은 커밋에서 재생성한다(원칙 I).

## Project Structure

### Documentation (this feature)

```text
specs/022-view-permission/
├── spec.md              # 기능 명세
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 설계 결정과 근거 (R1~R12)
├── data-model.md        # Phase 1 — 모드 · 전환 표 · 요약 모델
├── quickstart.md        # Phase 1 — 종단 검증 가이드
├── contracts/
│   ├── view-write-gate.md        # 뷰 블록 쓰기 관문 (FR-005~009 · 011 · 015~018)
│   ├── private-view-filter.md    # 개인 뷰 읽기 · 방송 필터 (FR-010 · 012~014 · 027 · 028)
│   ├── admin-private-views-api.md# 관리자 정리 엔드포인트 (FR-023~025)
│   └── ui-surfaces.md            # 화면 표면 · i18n 키 (FR-019~022 · 029)
└── tasks.md             # Phase 2 — /speckit-tasks가 생성
```

### Source Code (repository root)

```text
server/
├── model/
│   ├── view_access.go               # 신규 — ViewAccessMode, 읽기/판정 helper
│   └── view_access_test.go
├── app/
│   ├── view_access.go               # 신규 — requireViewWritePermission, 필터, 마지막 뷰 보호,
│   │                                #        GetPrivateViewsForBoard, DeletePrivateViewAsAdmin
│   ├── view_access_test.go
│   ├── blocks.go                    # Patch/Delete/Duplicate/Undelete/Insert 경로에 관문 호출,
│   │                                # FilterBlocksForUser 앞단 필터, 공용→개인 전환 방송
│   └── property_access.go           # FilterBlockRecipients 앞단 필터
├── api/
│   ├── views.go                     # 신규 — registerViewsRoutes, 관리자 엔드포인트 2개
│   ├── views_test.go
│   ├── api.go                       # registerViewsRoutes 등록
│   └── blocks_test.go               # 블록 조회에서 개인 뷰가 걸러지는 케이스 추가
├── ws/
│   ├── adapter.go                   # Adapter에 BroadcastBlockDeleteExcept 추가
│   ├── plugin_adapter.go            # 구현 — 수신자에서 제외 대상 제거
│   └── plugin_adapter_cluster.go    # ClusterMessage.ExcludeUsers
└── services/store/sqlstore/
    └── boards_and_blocks.go         # duplicateBoard — 남의 개인 뷰 제외

webapp/src/
├── viewAccess.ts                    # 신규 — 모드 읽기, 전환 가능 목록, 잠금 판정 (Go와 쌍)
├── viewAccess.test.ts
├── blocks/boardView.ts              # fields.accessMode 타입 · createBoardView 복사
├── hooks/viewAccess.ts              # 신규 — useViewAccess(view): {mode, isAdmin, isCreator, locked, targets}
├── mutator.ts                       # changeViewAccessMode
├── octoClient.ts                    # getPrivateViews, deletePrivateView
├── store/views.ts                   # 목록 셀렉터에서 남의 개인 뷰 제거(방어)
├── pages/boardPage/
│   └── teamToBoardAndViewRedirect.tsx # 보이는 뷰 목록에 없는 viewId → 첫 뷰로 (FR-014 fallback 신설)
└── components/
    ├── kanban/
    │   ├── kanban.tsx                     # 숨긴 열 보이기 · 열 추가 영역에 locked 반영
    │   └── kanbanColumnHeader.tsx         # 열 끌기 · 숨기기 항목에 locked 반영
    ├── viewHeader/
    │   ├── viewHeaderAccessMenu.tsx       # 신규 — 권한 메뉴
    │   ├── viewHeaderAccessMenu.test.tsx
    │   ├── viewHeader.tsx                 # 메뉴 장착, 관리자 잠금 비활성 · 안내 문구
    │   ├── viewHeader.test.tsx
    │   ├── viewTabs.tsx                   # 이름 변경·삭제 숨김, 비개인 뷰 수로 canDelete, 사본 공용
    │   ├── viewTabs.test.tsx
    │   ├── viewTabMenu.tsx                # canRename prop
    │   ├── emptyCardButton.tsx            # 기본 템플릿 지정 비활성
    │   └── newCardButtonTemplateItem.tsx  # 기본 템플릿 지정 비활성
    └── shareBoard/
        ├── privateViewsSection.tsx        # 신규 — 관리자용 개인 뷰 목록
        ├── privateViewsSection.test.tsx
        ├── shareBoard.tsx                 # 섹션 장착
        └── shareBoard.scss                # 필요 시 기존 블록 안에 행 스타일 추가 (새 파일 없음)

webapp/i18n/en.json, ko.json           # 신규 키
```

**Structure Decision**: 기존 플러그인 구조를 그대로 쓴다. 서버는 009(카드 접근 권한)가
닦아 둔 App 계층 require 함수와 사용자별 필터 자리에 뷰 판정을 더하고, 010(속성 편집
잠금)이 쓰는 Go/TS 쌍 모델 패턴(`card_property_lock.go` / `cardPropertyLock.ts`)을
`view_access.go` / `viewAccess.ts`로 복제한다. webapp은 정렬 메뉴 · 공유 위젯 섹션의
기존 컴포넌트 모양을 그대로 따른다.

## 설계 개요

세부 결정과 근거는 [research.md](research.md), 모델은 [data-model.md](data-model.md),
경계는 `contracts/`에 있다. 핵심 구조만 요약한다.

1. **모드는 뷰 블록 `fields.accessMode`** (R1). Go `model.ViewAccessModeOf(block)`과 TS
   `viewAccessMode(view)`가 같은 규칙으로 읽는다. 세 값 외는 전부 `everyone`.
2. **쓰기 관문은 App 계층 한 함수** (R3). `requireViewWritePermission(userID, stored, patch, board, op)`가
   `PatchBlockAndNotify` · `PatchBlocksAndNotify` · `DeleteBlockAndNotify` · `DuplicateBlock` ·
   `UndeleteBlock` · `InsertBlocksAndNotify`(기존 ID upsert)에서 호출된다. 판정 표는
   [contracts/view-write-gate.md](contracts/view-write-gate.md).
3. **`cardOrder` 예외** (R4). `updatedFields`의 키가 `cardOrder` 하나뿐이고 `title`·`deletedFields`가
   비어 있으면 관리자 뷰라도 편집 권한자에게 연다.
4. **개인 뷰 필터는 두 앞단** (R5). `FilterBlocksForUser`와 `FilterBlockRecipients`에서
   카드 규칙 조기 반환보다 앞에 `model.ViewHiddenFrom(block, userID)`를 건다.
5. **공용→개인 전환 방송** (R6). 전환 patch 뒤 `BroadcastBlockChange`(필터가 만든 사람에게만
   보냄)와 `BroadcastBlockDeleteExcept(teamID, viewID, boardID, creator)`(ID만 담은
   tombstone을 나머지에게)를 함께 보낸다. 클러스터 메시지에 `ExcludeUsers`를 실어
   다른 노드도 같은 제외를 적용한다.
6. **마지막 비개인 뷰 보호** (R7). 전환 · 삭제 판정 때 `store.GetBlocksWithType(boardID, "view")`를
   읽어 삭제되지 않은 비개인 뷰 수를 센다. 1이고 대상이 그 뷰면 거절.
7. **보드 복제 · 내보내기** (R8). `duplicateBoard`가 댓글을 거르는 자리에서 남의 개인 뷰도
   거른다. 내보내기는 이미 사용자별 필터를 타므로 변경 없음.
8. **관리자 정리 API** (R9). `api/views.go`에 두 엔드포인트. 삭제는 관문을 건너뛰는 내부
   삭제 경로(`deleteBlockUnchecked`)를 호출하고 방송은 그대로 탄다.
9. **webapp** (R10·R11). `viewAccess.ts`가 전환 가능 목록과 잠금 여부를 계산하고
   `useViewAccess` 훅이 현재 사용자 · 보드 권한과 묶는다. 권한 메뉴 · 헤더 비활성 ·
   탭 메뉴 · 기본 템플릿 항목 · 칸반 열 헤더 · 개인 뷰 섹션이 모두 이 훅을 읽는다. 목록
   셀렉터는 남의 개인 뷰를 한 번 더 거른다. 뷰 복제 사본은 `accessMode`를 지운다.
10. **뷰 fallback 신설** (R10b, 분석 C1). 지금 리다이렉트는 주소에 viewId가 없을 때만
    동작하고, 모르는 viewId면 workspace가 `null`을 그린다. `teamToBoardAndViewRedirect.tsx`에
    "보이는 뷰 목록에 현재 viewId가 없으면(lastViewId 포함) 첫 번째 보이는 뷰로
    `navigate(replace)`"를 더한다. 개인 뷰 주소 직접 접근과 공용→개인 전환 tombstone 두
    경우를 모두 덮는다.

## Complexity Tracking

위반 없음 — 기재할 항목이 없다.

`ws.Adapter` 인터페이스 확장은 새 패턴이 아니라 기존 `BroadcastBlockDelete`의 변형이고,
`ClusterMessage.ExcludeUsers`는 이미 있는 `EnsureUsers`와 대칭이다.
