---
description: 뷰(View) 관련 Q&A - 칸반, 테이블, 캘린더, 갤러리
globs: ["webapp/src/components/kanban/**", "webapp/src/components/table/**", "webapp/src/components/calendar/**", "webapp/src/components/gallery/**", "webapp/src/components/viewHeader/**"]
---

# 뷰 (Views) 도메인

## 개요

뷰는 카드를 시각화하는 방식입니다. Block 타입 중 하나이며, 같은 카드를 다양한 방식으로 표시할 수 있습니다.

## 뷰 타입

| 뷰 | viewType | 컴포넌트 | 설명 |
|----|----------|---------|------|
| Kanban | `board` | `webapp/src/components/kanban/` | 칸반 보드 |
| Table | `table` | `webapp/src/components/table/` | 테이블/스프레드시트 |
| Calendar | `calendar` | `webapp/src/components/calendar/` | 캘린더 |
| Gallery | `gallery` | `webapp/src/components/gallery/` | 갤러리/그리드 |

## 관련 파일

| 영역 | 파일 |
|------|------|
| 뷰 헤더 | `webapp/src/components/viewHeader/` |
| 뷰 메뉴 | `webapp/src/components/viewMenu.tsx` |
| 필터 | `webapp/src/cardFilter.ts` |
| 정렬 | `webapp/src/viewModel.ts` |
| Redux | `webapp/src/store/views.ts` |

## 뷰 구조

```typescript
{
  id: string
  boardId: string
  parentId: string  // 보드 ID
  type: "view"
  title: string
  fields: {
    viewType: "board" | "table" | "calendar" | "gallery"
    groupById: string      // 그룹핑 프로퍼티 ID (Kanban용)
    sortOptions: SortOption[]    // 정렬 옵션
    filter: FilterGroup         // 필터 조건
    visiblePropertyIds: string[] // 표시할 프로퍼티
    visibleOptionIds: string[]   // 표시할 옵션 (Kanban 컬럼)
    hiddenOptionIds: string[]    // 숨길 옵션
    collapsedOptionIds: string[] // 접힌 컬럼
    cardOrder: string[]          // 수동 카드 순서
    columnWidths: Record<string, number> // 컬럼 너비 (Table용)
    dateDisplayPropertyId: string // 날짜 프로퍼티 (Calendar용)
  }
}
```

## 필터링

### 필터 구조

```typescript
interface FilterGroup {
  operation: "and" | "or"
  filters: FilterClause[]
}

interface FilterClause {
  propertyId: string
  condition: FilterCondition
  values: string[]
}
```

### 필터 조건

| 조건 | 설명 |
|------|------|
| `includes` | 값 포함 |
| `notIncludes` | 값 미포함 |
| `isEmpty` | 비어있음 |
| `isNotEmpty` | 비어있지 않음 |
| `is` | 정확히 일치 |
| `isNot` | 일치하지 않음 |
| `contains` | 텍스트 포함 |
| `notContains` | 텍스트 미포함 |

## 정렬

```typescript
interface SortOption {
  propertyId: string
  reversed: boolean  // 내림차순
}
```

특수 프로퍼티:
- `__title` - 카드 제목으로 정렬
- `__createdTime` - 생성 시간으로 정렬

## Kanban 뷰

### 그룹핑

`groupById`로 지정된 select/multiselect 프로퍼티로 카드를 컬럼별 그룹화:

```
┌─────────┬─────────┬─────────┐
│ To Do   │ In Prog │ Done    │
├─────────┼─────────┼─────────┤
│ Card A  │ Card B  │ Card D  │
│ Card C  │         │ Card E  │
└─────────┴─────────┴─────────┘
```

### 드래그앤드롭

카드를 다른 컬럼으로 드래그하면:
1. 카드의 해당 프로퍼티 값 변경
2. `cardOrder` 배열 업데이트

## Table 뷰

### 컬럼 관리

```typescript
fields: {
  visiblePropertyIds: ["prop-1", "prop-2", "prop-3"],
  columnWidths: {
    "prop-1": 200,
    "prop-2": 150
  }
}
```

### 인라인 편집

테이블 셀 클릭 시 인라인 에디터로 값 수정.

## Calendar 뷰

### 날짜 프로퍼티

`dateDisplayPropertyId`로 지정된 날짜 프로퍼티를 기준으로 카드 배치:

```typescript
fields: {
  dateDisplayPropertyId: "prop-due-date"
}
```

## Gallery 뷰

카드를 그리드 형태로 표시. 카드의 이미지가 있으면 썸네일 표시.

## 뷰 API

뷰는 Block API를 통해 관리됩니다:

- `POST /api/v2/boards/{boardId}/blocks` – 뷰 생성
- `PATCH /api/v2/boards/{boardId}/blocks/{viewId}` – 뷰 수정
- `DELETE /api/v2/boards/{boardId}/blocks/{viewId}` – 뷰 삭제

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
