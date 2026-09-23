# Contract: 숨김 해제 흐름 F-01~F-05

**Spec**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) R1·R3·R10

## F-01. 숨김 해제 함수 하나

세 진입점(다시 표시, 모두 표시, 실행 취소)이 같은 함수 `mutator.unhideBoard`를 쓴다.
`boardPage.tsx:298`의 자동 복구(보드 열기)는 같은 호출을 이미 하고 있으므로 이번 범위에서
바꾸지 않는다.

```
unhideCategoryBoard(categoryID, boardID) → Promise<boolean>
  1. octoClient.unhideBoard(categoryID, boardID)
  2. response.ok 가 아니면 → false (스토어 건드리지 않음)
  3. dispatch(updateBoardCategories([{boardID, categoryID, hidden: false}]))
  4. → true
```

웹소켓 `blockCategories` 이벤트가 곧 같은 갱신을 한 번 더 보낸다. `updateBoardCategories`는
이미 있는 항목의 `hidden`만 바꾸므로 두 번 적용해도 결과가 같다.

## F-02. 실패는 전이하지 않고 알린다

| 상황 | 결과 |
|---|---|
| 응답 4xx/5xx | `false`. 호출부가 `HiddenBoards.showFailed` 알림(high)을 띄운다 |
| 네트워크 예외 | 같다. 예외를 삼키지 않고 `Utils.logError`로 남긴 뒤 `false` |

## F-03. 모두 표시는 순차, 실패는 모아서 한 번

```
for board of hiddenBoards (메타데이터 순서):
    ok = await unhideCategoryBoard(categoryID, board.id)
    if (!ok) failed.push(board)
if (failed.length > 0) 알림 한 번 (high)
```

성공한 보드는 즉시 돌아온다(각 호출이 스토어를 갱신). 실패한 보드는 행에 남는다.

## F-04. `FlashMessage.action`

| 규칙 | 내용 |
|---|---|
| 렌더 | `action`이 있을 때만 `<button class="FlashMessages__action">`을 내용 뒤에 그린다. 없으면 마크업이 지금과 같다(기존 스냅샷 보존) |
| 클릭 | `event.stopPropagation()` → `action.onClick()` → 알림 닫기(기존 fade-out 경로) |
| 접근성 | 버튼의 접근 가능한 이름은 `action.label` |

## F-05. `FlashMessage.durationMs`

| 규칙 | 내용 |
|---|---|
| 타이머 | `setTimeout(handleFadeOut, (message.durationMs ?? props.milliseconds) - 200)` |
| 교체 | 새 메시지가 오면 앞 타이머를 지운다(기존 동작). 앞 메시지가 5초짜리여도 새 메시지의 시간이 적용된다 |
| 기본 | `durationMs`가 없으면 전역 값. 다른 알림의 표시 시간은 바뀌지 않는다 |
