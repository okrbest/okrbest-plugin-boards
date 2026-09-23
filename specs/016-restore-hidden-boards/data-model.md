# Data Model: 숨긴 보드를 사이드바에서 되찾는다

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

새로 저장하는 것은 없다. 이미 있는 값을 읽는 규칙과 화면이 잠시 들고 있는 상태만 적는다.

## 숨긴 보드 (읽기 전용 파생)

카테고리 정보 `CategoryBoards.boardMetadata[]`의 항목 `{boardID, hidden}` 중 `hidden`이
참인 것. 서버가 소유하고 웹소켓으로 갱신한다 (R1·R2).

**화면이 세는 규칙** (`getHiddenCategoryBoards`, R8):

| 조건 | 포함 |
|---|---|
| `hidden === true` | 예 |
| 보드가 스토어(`getMySortedBoards`)에 있다 | 예 — 없으면 지워졌거나 권한을 잃은 것 |
| `board.isTemplate` | 아니오 |
| 화면에서만 복구된 보드(카테고리 메타데이터에 없음) | 해당 없음 — 메타데이터가 없으니 `hidden`도 없다 |

순서는 메타데이터 순서 그대로. 되찾으면 `hidden`만 거짓이 되고 자리는 그대로다 (SC-004).

**상태 전이**

```
보임 ──(숨기기: hideBoard → hidden=true)──▶ 숨김
숨김 ──(다시 표시 / 모두 표시 / 실행 취소 / 보드 열기: unhideBoard → hidden=false)──▶ 보임
```

네 진입점이 모두 같은 함수를 부른다 (F-01). 실패하면 전이하지 않는다 (F-02).

## 접힘 행 펼침 상태 (화면 지역 상태)

| 필드 | 타입 | 기본 | 수명 |
|---|---|---|---|
| `expanded` | boolean | `false` | 카테고리 컴포넌트가 살아 있는 동안. 새로 열면 초기화 (FR-003) |

카테고리마다 따로 둔다. 저장하지 않는다. 숨긴 보드가 0개가 되면 행과 함께 사라진다.

## 알림 (`FlashMessage` 확장, R3)

```ts
type FlashMessage = {
    content: React.ReactNode
    severity: 'low' | 'normal' | 'high'
    action?: {label: string, onClick: () => void}   // 신규, 선택
    durationMs?: number                             // 신규, 선택
}
```

| 필드 | 규칙 |
|---|---|
| `action` | 있으면 내용 옆에 버튼 하나. 누르면 `onClick`을 실행한 뒤 알림을 닫는다. 컨테이너 클릭(닫기)으로 번지지 않는다 |
| `durationMs` | 있으면 이 알림만 그 시간 동안. 없으면 `FlashMessages`의 `milliseconds`(전역 2000) |

한 번에 하나만 보인다 — 새 알림이 오면 앞 알림의 타이머를 지우고 바꾼다(기존 동작, FR-010).

**숨기기 알림의 값**: `content` = `“{title}” 보드를 숨겼습니다`, `severity: 'low'`,
`action.label` = `실행 취소`, `durationMs` = `5200` — 퇴장 200ms를 빼고 온전히 5초 보인다 (F-05).

**실패 알림의 값**: `content` = `보드를 다시 표시하지 못했습니다`, `severity: 'high'`,
`action`·`durationMs` 없음.
