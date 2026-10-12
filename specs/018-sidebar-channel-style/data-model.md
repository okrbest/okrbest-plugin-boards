# Data Model: 사이드바 표시 상태

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

서버·DB 변경이 없다. 유일한 데이터는 브라우저 localStorage의 표시 상태 하나다.

## 사이드바 표시 상태 (SidebarHiddenState)

| 항목 | 값 |
|---|---|
| 저장소 | localStorage (`UserSettings` 경유) |
| 키 | `sidebarHidden_<userId>` |
| 값 | `'true'` \| 없음 (없으면 보임) |
| 범위 | 사용자 × 브라우저. 서버 비동기화 |
| 접근자 | `UserSettings.getSidebarHidden(userId)` / `UserSettings.setSidebarHidden(userId, hidden)` |

### 규칙

- 읽기 실패·키 없음 → `false`(보임). 저장 실패는 조용히 무시한다 — 그 세션의 토글 동작은 유지되고 보존만 안 된다.
- `hidden === false`일 때는 키를 지운다(`removeItem`) — 기본값과 같은 상태를 값으로 남기지 않는다.
- 쓰기는 사용자가 토글 버튼을 눌렀을 때만. 창 폭에 따른 자동 숨김/해제는 쓰지 않는다 (research R6).

### 상태 전이

```text
[보임] --숨기기 클릭--> [숨김, 저장 true]
[숨김] --보이기 클릭--> [보임, 키 삭제]
[보임] --창 폭 < 768px--> [자동 숨김, 저장 안 함]
[자동 숨김] --창 폭 >= 768px--> [보임, 저장 안 함]
[숨김(저장됨)] --창 폭 변화--> [숨김 유지] (사용자 선택 우선, FR-004)
[임의 상태] --새로고침/재방문--> [저장값 복원, 없으면 보임]
```

### 컴포넌트 상태와의 관계

`sidebar.tsx`의 기존 state 두 개를 유지한다.

- `userHidden`: 사용자가 명시적으로 숨겼는가. **초기값을 저장값에서 복원**하고, 토글 때 저장과 함께 갱신한다.
- `isHidden`: 실제 렌더 상태. `userHidden`이 참이면 참, 아니면 창 폭 규칙을 따른다.
