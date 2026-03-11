# 뷰 드롭다운 → 탭 UI 전환 설계

## 개요

뷰 전환과 뷰 관리를 명확히 구분하기 위해 기존 드롭다운 방식의 뷰 선택 UI를 탭(Tab) 구조로 변경한다. 사용자가 현재 상태, 가능한 행동, 행동 결과를 즉시 이해할 수 있도록 개선한다.

## 결정 사항

| 항목 | 결정 |
|------|------|
| 뷰 타입 범위 | 기존 4가지(board, table, gallery, calendar) 유지 |
| 관리 메뉴 진입 | 활성 탭 클릭 시 드롭다운 |
| 탭 오버플로우 | 가로 스크롤 (`overflow-x: auto`) |

## 컴포넌트 구조

### 변경 전

```
ViewHeader
  ├─ Editable (뷰 제목)
  ├─ MenuWrapper
  │   ├─ IconButton (▾)
  │   └─ ViewMenu (드롭다운)
  │       ├─ 뷰 목록
  │       ├─ 복제/삭제
  │       └─ 뷰 추가 서브메뉴
  ├─ 필터/정렬/검색...
```

### 변경 후

```
ViewHeader
  ├─ ViewTabs (신규)
  │   ├─ ViewTab × N
  │   │   ├─ 아이콘 + 이름
  │   │   └─ (활성 탭) ▲ + 메뉴
  │   └─ AddViewButton (+)
  │       └─ 뷰 타입 선택 메뉴
  ├─ 필터/정렬/검색...
```

## 신규 컴포넌트

### ViewTabs (`components/viewHeader/viewTabs.tsx`)

탭 컨테이너. 뷰 목록을 가로로 나열하고, 오버플로우 시 가로 스크롤 처리. 우측 끝에 + 버튼 고정.

**Props:**
- `board: Board`
- `activeView: BoardView`
- `views: BoardView[]`
- `readonly: boolean`

### ViewTab (`components/viewHeader/viewTab.tsx`)

개별 뷰 탭. 뷰 타입 아이콘 + 이름 표시. 활성/비활성 상태에 따른 스타일 분기.

**Props:**
- `view: BoardView`
- `isActive: boolean`
- `readonly: boolean`
- `onClick: () => void` (비활성: 뷰 전환, 활성: 메뉴 토글)
- `onRename: (newTitle: string) => void`
- `onDuplicate: () => void`
- `onDelete: () => void`

### ViewTabMenu (`components/viewHeader/viewTabMenu.tsx`)

활성 탭 클릭 시 표시되는 관리 메뉴.

**메뉴 항목:**
- 이름 바꾸기 — 탭 텍스트를 인라인 편집 모드로 전환
- 뷰 복제 — 현재 뷰 복제 후 새 탭으로 전환
- 뷰 삭제 — 삭제 후 다음 뷰로 전환 (마지막 뷰 삭제 불가)

## 탭 동작 명세

| 액션 | 동작 |
|------|------|
| 비활성 탭 클릭 | 해당 뷰로 전환 (URL 네비게이션) |
| 활성 탭 클릭 | 관리 메뉴 토글 |
| + 버튼 클릭 | 뷰 타입 선택 메뉴 → 신규 뷰 생성 → 자동 전환 |
| 이름 바꾸기 | 탭 텍스트를 인라인 편집 모드로 전환 |
| 뷰 복제 | 현재 뷰 복제 → 새 탭 추가 및 전환 |
| 뷰 삭제 | 삭제, 다음 뷰로 자동 전환 (마지막 뷰 삭제 불가) |

## 시각적 스타일

- **활성 탭:** 배경색(테마 기반) + 하단 border 강조 + bold + 테마 컬러 텍스트 + ▲ 아이콘
- **비활성 탭:** 투명 배경 + 연한 텍스트
- **호버:** 배경색 살짝 표시
- **+ 버튼:** 원형, 탭 영역 우측 고정
- **스크롤:** `overflow-x: auto`, 스크롤바 기본 브라우저 스타일

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `viewHeader.tsx` | ViewMenu/Editable 제거, ViewTabs 삽입 |
| `viewTabs.tsx` (신규) | 탭 컨테이너, 스크롤 처리, + 버튼 |
| `viewTab.tsx` (신규) | 개별 탭 렌더링, 활성/비활성 스타일 |
| `viewTabMenu.tsx` (신규) | 이름 바꾸기/복제/삭제 메뉴 |
| `viewTabs.scss` (신규) | 탭 스타일 (BEM 네이밍) |
| `viewMenu.tsx` | 뷰 추가 로직만 남기고 리팩토링 또는 제거 |

## 변경하지 않는 것

- Redux store (`views.ts`) — 기존 상태 관리 그대로 사용
- Mutator 호출 — 기존 `insertBlock`/`deleteBlock`/`changeBlockTitle` 그대로
- URL 네비게이션 기반 뷰 전환 로직 — `showView()` 재사용
- 뷰 타입 아이콘 — 기존 `iconForViewType()` 재사용
- 권한 체크 — `BoardPermissionGate` 그대로 사용
- 뷰 타입 — 기존 4가지(board, table, gallery, calendar) 유지
