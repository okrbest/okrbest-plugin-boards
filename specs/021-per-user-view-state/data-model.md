# 데이터 모델: 표 뷰 개인 화면 제어 분리

서버·DB 변경은 없다. 모델은 전부 webapp 안에 있다.

## 개인 뷰 표시 상태 (ViewLocalState)

사용자 × 뷰 조합마다 하나 존재하는 화면 조정 값의 묶음. Redux 슬라이스가 원본이고 localStorage가 지속 사본이다.

```
ViewLocalState = {
    collapsedOptionIds?: string[]              // 접힌 그룹 ID 목록. 없으면 "개인 상태 없음" — 공유 값 사용
    columnWidths?: Record<string, number>      // 열 ID → 개인 너비(px). 열 단위 부분 덮어쓰기
}
```

### 슬라이스 형태

```
viewLocalState: {
    byKey: Record<string, ViewLocalState>      // 키: `${userId}:${viewId}`
}
```

- `userId`: 현재 로그인 사용자 ID. 비로그인(공유 링크)은 빈 문자열로 대체하고 지속하지 않는다.
- `viewId`: BoardView 블록 ID. 보드·뷰가 다르면 키가 달라 서로 영향이 없다 (FR-008).

### 액션

| 액션 | 효과 |
|---|---|
| `toggleCollapsedOption(key, optionId, seed)` | 개인 목록이 없으면 `seed`(공유 값)를 복사해 만든 뒤 `optionId`를 토글한다 |
| `setColumnWidth(key, columnId, width)` | 해당 열의 개인 너비를 기록한다 |
| `hydrate(byKey)` | 스토어 초기화 시 localStorage에서 복원한다 |

모든 쓰기 액션은 성공 후 localStorage에 동기 기록한다(실패는 조용히 무시 — 메모리 상태로만 동작).

### 병합 규칙 (selector / table.tsx)

| 필드 | 개인 상태 있음 | 개인 상태 없음 |
|---|---|---|
| `collapsedOptionIds` | 개인 목록으로 전체 대체 | 뷰에 저장된 공유 값 |
| `columnWidths` | `{...공유, ...개인}` (열 단위) | 공유 값 |

병합 결과는 `activeView`의 사본으로 만들어 table.tsx 하위에만 전달한다. **공유 뷰를 저장하는 어떤 경로에도 병합된 사본이 흘러들면 안 된다** — 뷰 설정 메뉴·복제 등은 스토어의 원본 뷰를 쓴다.

## 지속 저장 (localStorage)

`UserSettings`에 키 하나를 추가한다.

```
UserSettingKey.ViewLocalState = 'viewLocalState'
값: JSON.stringify(byKey)       // 슬라이스의 byKey 전체
```

- `LastViewId`(뷰별 JSON 맵) 선례와 같은 구조다.
- 읽기·쓰기 실패(시크릿 모드, 용량 초과)는 try/catch로 삼키고 기능은 메모리로 동작한다.
- 서버로 전송하지 않는다. 다른 기기·브라우저와 공유되지 않는다 (spec Assumptions).

## 기존 모델과의 관계

| 모델 | 변경 | 비고 |
|---|---|---|
| `BoardView.fields.collapsedOptionIds` | 구조 불변, **화면 쓰기 중단** | 기존 저장값은 시드(초기 기본값)로만 읽는다 |
| `BoardView.fields.columnWidths` | 구조 불변, **화면 쓰기 중단** | 동일 |
| `BoardView.fields.hiddenOptionIds` 등 나머지 | 불변 | 공유 구성 — 기존 동기화 유지 (FR-007) |
| undo 스택 (`mutator`) | 두 조작이 더 이상 진입하지 않음 | FR-003 |

## 상태 전이

```
(개인 상태 없음)
   │ 그룹 접기 토글            │ 열 너비 드래그 확정
   ▼                           ▼
공유 값 복사 + 토글 적용       해당 열만 개인 값 기록
   │                           │
   ▼                           ▼
(개인 상태 있음) ── 재방문 ──▶ localStorage에서 복원 ──▶ 병합 렌더
```

개인 상태를 비우는 전이는 이번 범위에 없다(초기화 UI 미제공). 필요해지면 키 삭제 액션 하나로 추가할 수 있다.
