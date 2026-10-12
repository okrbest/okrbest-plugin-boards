# Data Model: "본인" 필터 토큰

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

서버·DB 변경이 없다. 기존 뷰 필터 구조(`FilterClause.values: string[]`)에 예약 값 하나가 더해질 뿐이다.

## ME_FILTER_VALUE

| 항목 | 값 |
|---|---|
| 값 | `'me'` (상수 `ME_FILTER_VALUE`, `cardFilter.ts` export) |
| 저장 위치 | `BoardView.fields.filter` 안 `FilterClause.values` 배열 — 기존 뷰 patch 경로 그대로 |
| 충돌 | 없음 — Mattermost user ID는 26자 영숫자 |
| 적용 속성 | filterValueType `person`: person, multiPerson, createdBy, updatedBy |
| 적용 조건 | includes, notIncludes (값 배열을 쓰는 조건 전부). isEmpty/isNotEmpty는 값을 안 쓰므로 무관 |

## 풀이 규칙 (resolveMe)

```text
resolveMe(filterGroup, meId):
  그룹을 재귀 순회한 사본을 만든다
  각 FilterClause.values에서 'me' → meId 치환
  원본 filterGroup(뷰 데이터)은 불변
```

- 치환은 **읽기 경로**에서만 일어난다. 뷰에 저장되는 값은 항상 `'me'`다.
- `meId`가 없으면(비로그인 공개 화면) 치환하지 않는다 → `'me'`는 어떤 카드 값과도 일치하지 않아 includes에서 제외, notIncludes에서 통과. 화면은 깨지지 않는다 (spec Assumptions).
- 같은 clause에 `'me'`와 실제 ID가 섞여 있으면 둘 다 각자 의미대로 평가된다 (OR — 기존 includes 의미).

## 상태 전이

```text
[필터 패널 "본인" 체크]   → values에 'me' 추가 (뷰 patch — 전 사용자 공유)
[필터 패널 "본인" 해제]   → values에서 'me' 제거
[사용자 A가 카드 목록 렌더] → resolveMe(filter, A.id) 사본으로 평가
[사용자 B가 같은 뷰 렌더]  → resolveMe(filter, B.id) 사본으로 평가 — 뷰 데이터 불변
```
