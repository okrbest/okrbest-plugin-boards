# Implementation Plan: 표 뷰 개인 화면 제어 분리

**Branch**: `021-per-user-view-state` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-per-user-view-state/spec.md`

## Summary

표 뷰의 그룹 펼치기/접기(`collapsedOptionIds`)와 열 너비(`columnWidths`)는 지금 공유 뷰 블록에 저장되어 `mutator.updateBlock` → 서버 patch → websocket 방송을 거쳐 같은 보드를 보는 모든 사용자의 화면을 바꾼다. 이 두 값을 **webapp 전용 로컬 상태(Redux 슬라이스 + localStorage 지속)**로 옮겨 조작한 사용자의 화면에만 적용한다. 서버·DB·API는 변경하지 않는다. 뷰에 이미 저장된 값은 개인 상태가 없을 때의 초기 기본값으로 계속 쓴다. 통합 지점이 [table.tsx](../../webapp/src/components/table/table.tsx) 하나로 모이므로, 거기서 개인 상태를 병합한 뷰 객체를 하위 컴포넌트에 내려보내면 자식 컴포넌트는 손대지 않아도 된다.

## Technical Context

**Language/Version**: TypeScript 5.7 (webapp 전용 — server 변경 없음)

**Primary Dependencies**: React 19, Redux Toolkit(`webapp/src/store/`), Jest + React Testing Library

**Storage**: 브라우저 localStorage (`webapp/src/userSettings.ts`의 `UserSettings` 패턴을 따름 — 서버 저장 없음)

**Testing**: `make webapp-ci` (`npm run check` + `npm run test` + `npm run check-types`), colocated `*.test.tsx`

**Target Platform**: Mattermost 플러그인 webapp (브라우저)

**Project Type**: 단일 저장소 플러그인의 webapp 패키지

**Performance Goals**: 접기/너비 조작의 화면 반영은 로컬 상태 갱신이므로 즉시. 서버 왕복이 사라져 기존보다 빨라진다.

**Constraints**: 공유 뷰 구성(그룹 숨김·정렬·필터·표시 속성·계산식)의 동기화 동작은 회귀 없이 유지해야 한다. upstream 데이터 구조(`BoardView.fields`)는 바꾸지 않는다.

**Scale/Scope**: webapp의 표 뷰 컴포넌트 묶음(`webapp/src/components/table/`)과 신규 Redux 슬라이스 1개, UserSettings 키 1개. 예상 접점 파일 6~8개.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 패키지별 품질 게이트 | 통과 | webapp만 변경. `make webapp-ci` 3단계를 기준선 diff로 대조한다. 화면 동작 변경이므로 빌드·배포 후 quickstart.md 수동 검증을 완료 근거로 제시한다. |
| II. 레이어 경계·기존 패턴 | 통과 | 상태는 Redux Toolkit 슬라이스로 관리(기존 패턴). 새 UI 요소 없음 — 기존 버튼·그립의 동작 대상만 바꾼다. 신규 SCSS 없음. |
| III. 타입·오류 엄격성 | 통과 | `as any`·`@ts-ignore` 불필요. localStorage 접근은 기존 `UserSettings` 모듈의 try 패턴을 따른다. |
| IV. 동작 변경 시 테스트 동반 | 통과 | 슬라이스 단위 테스트 + table 컴포넌트 테스트를 colocated로 추가. 기존 테스트 중 공유 뷰 전제가 깨지는 것은 의도 확인 후 갱신. |
| V. i18n 동기화 | 해당 없음 | 사용자 표시 문자열 추가·변경 없음. |
| VI. Upstream·라이선스 충실성 | 통과 | `BoardView.fields` 구조·plugin ID·라이선스 헤더 불변. 뷰에 저장된 기존 값은 삭제하지 않아 upstream 클라이언트와의 데이터 호환을 유지한다. |
| VII. DB 마이그레이션 규율 | 해당 없음 | DB 변경 없음. |
| VIII. 집중 브랜치 + PR | 통과 | 브랜치 `021-per-user-view-state`에서 작업. 구현·검증 후 사용자 확인을 기다린 뒤 PR. |
| IX. Spec 주도 워크플로 | 통과 | specify → plan → tasks → implement 순서를 따르는 중. |

Phase 1 설계 후 재점검: 위반 없음. 신규 시각 요소를 도입하지 않고, 서버 레이어를 건드리지 않으며, 데이터 구조 호환을 유지한다.

## Project Structure

### Documentation (this feature)

```text
specs/021-per-user-view-state/
├── spec.md              # 기능 명세
├── plan.md              # 이 파일
├── research.md          # Phase 0 산출물 — 설계 결정과 근거
├── data-model.md        # Phase 1 산출물 — 개인 뷰 표시 상태 모델
├── quickstart.md        # Phase 1 산출물 — 종단 검증 가이드
└── tasks.md             # Phase 2 산출물 (/speckit-tasks가 생성)
```

contracts/는 만들지 않는다 — 서버 API·외부 인터페이스 변경이 없는 webapp 내부 변경이다.

### Source Code (repository root)

```text
webapp/src/
├── store/
│   ├── viewLocalState.ts          # 신규 — 개인 뷰 표시 상태 슬라이스
│   ├── viewLocalState.test.ts     # 신규 — 슬라이스 단위 테스트
│   └── index.ts                   # 슬라이스 등록
├── userSettings.ts                # UserSettingKey.ViewLocalState 키 추가
└── components/table/
    ├── table.tsx                  # 병합 지점 — hideGroup·resizeColumn을 로컬 액션으로 전환
    ├── table.test.tsx             # 전파 차단·시드 동작 테스트 추가
    ├── tableGroupHeaderRow.tsx    # 접기 버튼의 readonly 차단 해제
    ├── tableGroupHeaderRow.test.tsx
    ├── tableHeader.tsx            # 열 너비 그립을 편집 권한과 분리
    └── tableHeader.test.tsx
```

**Structure Decision**: 기존 webapp 구조를 그대로 쓴다. 신규 파일은 Redux 슬라이스와 그 테스트 2개뿐이고, 나머지는 기존 파일 수정이다. 서버(`server/`)는 변경하지 않는다.

## 설계 개요

세부 결정과 근거는 [research.md](research.md), 상태 모델은 [data-model.md](data-model.md)에 있다. 핵심 구조만 요약한다.

1. **개인 상태 슬라이스** (`store/viewLocalState.ts`): `(userId, viewId)` 키로 접힌 그룹 목록과 열 너비 맵을 담는다. 액션 디스패치 시 localStorage(`UserSettings`)에도 기록하고, 스토어 초기화 시 복원한다.
2. **병합 지점은 table.tsx 하나**: `activeView`에 개인 상태를 덮어쓴 사본을 만들어 하위 컴포넌트와 `ColumnResizeProvider`에 내려보낸다. 자식 컴포넌트(`tableGroup`, `tableRows`, `tableRowExpandable`, `calculationRow` 등)는 수정하지 않는다.
3. **쓰기 경로 전환**: `hideGroup`과 `resizeColumn`이 `mutator.updateBlock` 대신 로컬 액션을 디스패치한다. 서버 저장·websocket 방송·undo 스택 기록이 모두 사라진다 (FR-003).
4. **읽기 전용 허용**: 접기 버튼의 `readonly` 차단([tableGroupHeaderRow.tsx:79](../../webapp/src/components/table/tableGroupHeaderRow.tsx#L79))을 제거하고, 열 너비 그립([tableHeader.tsx:90](../../webapp/src/components/table/tableHeader.tsx#L90))의 렌더 조건을 편집 권한과 분리한다 (FR-006). 정렬 메뉴 등 공유 구성 컨트롤의 권한 게이트는 그대로 둔다.
5. **시드**: 개인 상태가 없으면 뷰에 저장된 값을 그대로 보여 준다. 접기는 첫 토글 때 공유 값을 복사한 뒤 수정하고, 열 너비는 열 단위로 덮어쓴다 (FR-005).

## Complexity Tracking

위반 없음 — 기재할 항목이 없다.
