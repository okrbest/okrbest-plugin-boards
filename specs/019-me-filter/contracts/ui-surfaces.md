# Contract: 필터 "본인" — 흐름 F-01~F-05 · 화면 U-01~U-05

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Research**: [research.md](../research.md)

각 항목은 테스트 하나에 대응한다. F-계열은 `cardFilter.ts`·`store/cards.ts`, U-계열은 `filterValuePanel.tsx`가 담당한다.

## 풀이 흐름 (`cardFilter.ts`)

| ID | Given | Then | 근거 |
|---|---|---|---|
| F-01 | values에 `'me'`가 든 clause, meId='user-a' | `resolveMe` 결과 사본의 values에서 'me'가 'user-a'로 바뀐다. **원본은 불변** | FR-002 |
| F-02 | 중첩 FilterGroup 안의 clause에 'me' | 재귀 치환된다 | FR-002 |
| F-03 | 'me' + 실제 ID가 섞인 values | 'me'만 치환되고 실제 ID는 그대로 | FR-004 |
| F-04 | 치환된 필터로 includes 평가 — 단일(person)·배열(multiPerson) 값 카드 | 내 카드만 통과. notIncludes면 내 카드만 제외 | FR-004, US1 |
| F-05 | meId 없음(비로그인) | 치환 생략 — 'me'는 includes에서 아무 카드와도 일치하지 않고(전부 제외), notIncludes에서는 아무 카드도 거르지 않는다(전부 통과). 오류가 나지 않는다 | Assumptions |

## 적용 지점 (`store/cards.ts`)

| ID | Given | Then | 근거 |
|---|---|---|---|
| F-06 | 'me' 필터가 걸린 뷰를 사용자 A로 렌더 | A가 해당하는 카드만 선택된다. 같은 상태를 B로 렌더하면 B의 카드만 | FR-003, US2, SC-002 |

## 필터 패널 (`filterValuePanel.tsx` PersonFilterPanel)

| ID | Given | Then | 근거 |
|---|---|---|---|
| U-01 | 사용자 선택형 속성(4종 중 any)의 값 패널 열림 | 목록 맨 위에 "본인" 항목(체크박스)이 있다. 실제 사용자 목록은 그 아래 | FR-001 |
| U-02 | "본인" 클릭 | clause.values에 `'me'`가 추가(뷰 patch)되고 체크 표시. 다시 클릭하면 제거 | FR-002 |
| U-03 | values에 'me'가 저장된 뷰로 패널 열기 | "본인"이 체크 상태로 그려진다 — 사용자 이름이 아니다 | FR-005 |
| U-04 | 검색창에 "본인" 또는 "me" 입력 | 현재 UI 로케일과 무관하게 두 표기 모두 "본인" 항목이 결과에 남는다. 다른 검색어면 사라진다 | FR-006 |
| U-05 | "본인" + 사용자 1명 체크 | 둘 다 체크로 표시되고 values에 ['me', <id>] | FR-004 |

## 회귀 계약

| ID | Given | Then | 근거 |
|---|---|---|---|
| R-01 | 실제 사용자만 선택한 기존 필터 | 동작 불변 — cardFilter 기존 테스트 전부 통과 | FR-008, SC-004 |
| R-02 | select/date 등 다른 속성 유형 필터 | 영향 없음 | FR-008 |
