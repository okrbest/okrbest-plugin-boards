# [Boards] 필터 사용 허들 낮추기 - 설계 문서

## 개요

보드 상단 필터 기능의 UX를 개선한다. 기존의 "필터 추가 → 속성 선택 → 조건 선택 → 값 입력" 흐름을
"속성 선택 → 값 체크" 흐름으로 단순화하여 사용 허들을 낮춘다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 조건 | includes 기본 + 고급 모드 토글 |
| 조합 로직 | 속성 내 OR, 속성 간 AND |
| 비선택형 속성 | 타입별 다른 UI 제공 |
| 저장 | 기존 BoardView.fields.filter 서버 저장 유지 |
| 패널 형태 | Popover (현재와 유사) |
| 접근 방식 | 기존 컴포넌트 완전 교체 (접근 A) |

## 섹션 1: 컴포넌트 구조

```
ViewHeader
└── Button "Filter" (기존 유지)
    └── FilterPanel (NEW - 팝오버 컨테이너)
        ├── FilterPropertyList (NEW - 좌측 패널)
        │   ├── 헤더: "필터 항목"
        │   └── PropertyItem[] (속성 목록)
        │       ├── 활성 표시 (좌측 파란 바 + 배경색)
        │       └── 속성명 + 활성 필터 수 뱃지
        │
        └── FilterValuePanel (NEW - 우측 패널)
            ├── 검색 입력란 (속성값 검색)
            ├── [고급 모드 토글] → 조건 선택 드롭다운
            └── 값 목록 (속성 타입별 렌더링)
                ├── select/multiSelect → 체크박스 + 컬러칩 + 레이블
                ├── person/createdBy/updatedBy → 체크박스 + 아바타 + 이름
                ├── checkbox → "체크됨" / "미체크" 두 항목
                ├── text/number/email/url/phone → 검색 입력란 (contains 방식)
                └── date/createdTime/updatedTime → 날짜 범위 피커
```

### 교체되는 기존 파일

- `filterComponent.tsx` → `FilterPanel.tsx`
- `filterEntry.tsx` → `FilterPropertyList.tsx` + `FilterValuePanel.tsx`
- `filterValue.tsx` → 타입별 렌더링이 `FilterValuePanel` 내부로 통합

### 유지되는 파일

- `dateFilter.tsx` — 날짜 피커 재사용
- `multipersonFilterValue.tsx` — person 값 렌더링 로직 참조
- `cardFilterValue.tsx` — card 타입 참조

## 섹션 2: 데이터 흐름

### 체크박스 토글 → FilterGroup 변환

사용자가 체크박스를 클릭하면 내부적으로 기존 FilterGroup/FilterClause 구조로 변환한다.

```
사용자 액션:
  담당자: [강감찬 ✓, 이하민 ✓]
  우선순위: [높음 ✓]

→ 내부 FilterGroup:
{
  operation: 'and',
  filters: [
    { propertyId: 'assignee-id', condition: 'includes', values: ['강감찬-id', '이하민-id'] },
    { propertyId: 'priority-id', condition: 'includes', values: ['높음-id'] }
  ]
}
```

### 변환 규칙

| 사용자 액션 | FilterClause 생성 |
|---|---|
| select/multiSelect 값 체크 | `{ condition: 'includes', values: [checkedIds...] }` |
| person 값 체크 | `{ condition: 'includes', values: [userIds...] }` |
| checkbox 체크됨/미체크 선택 | `{ condition: 'isSet' }` 또는 `{ condition: 'isNotSet' }` |
| text 검색어 입력 | `{ condition: 'contains', values: ['searchText'] }` |
| date 범위 선택 | `{ condition: 'isAfter', values: ['startDate'] }` + `{ condition: 'isBefore', values: ['endDate'] }` |

### 저장 타이밍

- 체크박스 토글 즉시 `mutator.changeViewFilter()` 호출
- 기존 undo/redo 지원 유지
- WebSocket으로 다른 사용자에게 실시간 동기화

### 기존 필터와의 호환

- 새 UI 진입 시 기존 FilterClause[]를 파싱하여 체크박스 상태로 역변환
- `includes` 조건 → 해당 값 체크 표시
- `notIncludes`, `isEmpty` 등 고급 조건 → 고급 모드 표시로 전환
- 파싱 불가능한 복잡한 중첩 FilterGroup → "고급 필터가 적용되어 있습니다" 안내 + 기존 UI 폴백

## 섹션 3: UI 상세 동작

### 좌측 패널 (FilterPropertyList)

- 표시 대상: `board.cardProperties` 중 `canFilter === true`인 속성만
- 정렬: 보드에 정의된 속성 순서(index) 유지
- 활성 표시: 해당 속성에 필터값이 1개 이상 설정된 경우
  - 좌측 파란 세로 바 + 배경색 하이라이트
  - 속성명 옆에 필터 수 뱃지 (예: `담당자 (2)`)
- 초기 선택: 패널 오픈 시 첫 번째 속성 자동 선택
- 필터 적용 중인 속성이 있을 경우: 해당 속성을 초기 선택

### 우측 패널 (FilterValuePanel)

**select/multiSelect 타입:**
- 검색 입력란 (속성값 필터링)
- 체크박스 목록: IPropertyOption[]에서 가져온 옵션들
- 각 항목: 체크박스 + 컬러칩(option.color) + 레이블(option.value)
- "할당되지 않음" 항목: 해당 속성값이 비어있는 카드를 필터링 (내부적으로 isEmpty 조건)

**person/createdBy/updatedBy 타입:**
- 검색 입력란 (사용자명 필터링)
- 보드의 카드에 실제 할당된 사용자 목록 추출
- 각 항목: 체크박스 + 아바타 + 사용자명
- "할당되지 않음" 항목 포함

**checkbox 타입:**
- 두 개의 항목만 표시: 체크됨 / 미체크
- 검색 입력란 불필요

**text/number/email/url/phone 타입:**
- 검색 입력란 하나만 표시 (contains 조건)
- 입력 후 Enter 또는 디바운스(300ms)로 필터 적용

**date/createdTime/updatedTime 타입:**
- 기존 DateFilter 컴포넌트 재사용
- 날짜 범위 피커 형태

### 고급 모드 토글

- 우측 패널 상단에 작은 토글/링크: "고급 필터"
- 활성화 시 조건 드롭다운 노출 (includes → notIncludes, isEmpty, isNotEmpty 등)
- 속성의 filterValueType에 따라 사용 가능한 조건 목록 결정

### 필터 초기화

- 모든 체크 해제 시 해당 속성의 FilterClause 제거
- 모든 속성에서 필터가 없으면 FilterGroup.filters = [] → 필터 미적용 상태
- ViewHeader의 필터 버튼 active 상태도 해제

### 예외 UI

| 상황 | 표현 |
|---|---|
| 속성에 값 없음 | 우측 패널에 "선택 가능한 값이 없습니다" |
| 필터 결과 0건 | 보드 영역에 "조건에 맞는 카드가 없습니다" |
| canFilter 속성 없음 | 좌측 패널에 "필터 가능한 속성이 없습니다" |

## 섹션 4: 스타일링 및 파일 구조

### 새 파일 구조

```
webapp/src/components/viewHeader/
├── filterPanel/
│   ├── filterPanel.tsx
│   ├── filterPanel.scss
│   ├── filterPropertyList.tsx
│   ├── filterPropertyList.scss
│   ├── filterValuePanel.tsx
│   ├── filterValuePanel.scss
│   └── index.ts
```

### BEM 네이밍

```
.FilterPanel
  ├── .FilterPanel__content

  ├── .FilterPropertyList
  │   ├── .FilterPropertyList__header
  │   └── .FilterPropertyList__item
  │       ├── --active
  │       ├── --has-filter
  │       └── .FilterPropertyList__badge

  └── .FilterValuePanel
      ├── .FilterValuePanel__search
      ├── .FilterValuePanel__advanced
      ├── .FilterValuePanel__list
      │   └── .FilterValuePanel__item
      │       └── --checked
      └── .FilterValuePanel__empty
```

### 팝오버 크기

- 전체: width 520px, max-height 400px
- 좌측 패널: width 180px, 스크롤 가능
- 우측 패널: flex 1, 스크롤 가능

### 삭제되는 파일

- filterComponent.tsx / filterComponent.scss
- filterEntry.tsx / filterEntry.scss

### 수정되는 파일

- viewHeader.tsx — FilterComponent import를 FilterPanel로 변경

### i18n 키 추가

```
FilterPanel.title: "필터 항목"
FilterPanel.search-placeholder: "검색..."
FilterPanel.advanced-filter: "고급 필터"
FilterPanel.no-values: "선택 가능한 값이 없습니다"
FilterPanel.no-properties: "필터 가능한 속성이 없습니다"
FilterPanel.unassigned: "할당되지 않음"
FilterPanel.checked: "체크됨"
FilterPanel.unchecked: "미체크"
```
