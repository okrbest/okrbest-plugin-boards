# Sub-Card Link/Unlink Channel Notification

## TL;DR

> **Quick Summary**: 하위 카드(Sub-card)가 연결(Link) 또는 해제(Unlink)될 때 보드와 연결된 채널로 알림 메시지를 전송하는 기능 구현
> 
> **Status**: ✅ **COMPLETED** (2026-02-03)
> 
> **Deliverables**:
> - `server/app/cards.go`에 알림 로직 추가 ✅
> - `webapp/i18n/ko.json`, `webapp/i18n/en.json`에 번역 키 추가 ✅
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential (총 2 tasks, 의존성 있음)
> **Critical Path**: Task 1 (Go 코드) → Task 2 (i18n)

---

## Context

### Original Request
하위 작업(Sub-card)이 연결(Link) 또는 해제(Unlink)될 때 보드에 연결된 채널로 알림이 가도록 기능 구현

### Interview Summary
**Key Discussions**:
- 메시지 형식 확정됨:
  - Link: `@{username}님이 카드 [{childCardTitle}]({childCardLink})를 카드 [{parentCardTitle}]({parentCardLink})의 하위 작업으로 연결했습니다`
  - Unlink: `@{username}님이 카드 [{childCardTitle}]({childCardLink})를 하위 작업에서 연결 해제했습니다`
- 조건: `board.ChannelID != ""`일 때만 알림
- 기존 패턴 활용: `postChannelMessage` 함수 재사용

**Research Findings**:
- `utils.MakeCardLink(serverRoot, teamID, boardID, cardID)` 함수 존재 확인 (server/utils/links.go:9)
- `postChannelMessage` 패턴 확인 (server/app/boards.go:418-423)
- 사용자 정보: `a.store.GetUserByID(userID)` → `username` fallback "unknown"
- 메시지 상수 패턴: 파일 상단에 Korean 하드코딩 (boards.go:21-23)

### Metis Review
**Identified Gaps** (addressed):
- Unlink 메시지에 부모 카드 정보 포함 여부 → 간단하게 유지 (사용자가 컨텍스트 알고 있음)
- 알림 실패 시 처리 → 기존 패턴 따름 (silent with logging)
- 빈 카드 제목 처리 → "제목 없음" fallback 적용

---

## Work Objectives

### Core Objective
Sub-card link/unlink 시 연결된 채널에 알림 메시지 전송

### Concrete Deliverables
- `server/app/cards.go`: 알림 로직 추가 (~40줄) ✅
- `webapp/i18n/ko.json`: 2개 번역 키 추가 ✅
- `webapp/i18n/en.json`: 2개 번역 키 추가 ✅

### Definition of Done
- [x] `go build ./server/...` 빌드 성공
- [x] `go vet ./server/app/...` 통과
- [x] i18n JSON 파일 유효성 검증 통과
- [ ] 채널 연결된 보드에서 sub-card link → 채널에 메시지 표시 (수동 테스트 필요)
- [ ] 채널 연결된 보드에서 sub-card unlink → 채널에 메시지 표시 (수동 테스트 필요)
- [ ] 채널 미연결 보드에서 link/unlink → 알림 없이 정상 동작 (수동 테스트 필요)

### Must Have
- ✅ 기존 `postChannelMessage` 패턴 정확히 따름
- ✅ 메시지 상수는 `cards.go` 파일 상단에 정의
- ✅ `board.ChannelID != ""` 체크 필수
- ✅ 사용자 조회 실패 시 "unknown" fallback
- ✅ 카드 제목 빈 경우 "제목 없음" fallback

### Must NOT Have (Guardrails)
- ✅ `LinkCardAsSubCard` / `UnlinkSubCard` 함수 시그니처 변경 금지
- ✅ 새로운 API 엔드포인트 추가 금지
- ✅ WebSocket 브로드캐스트 로직 변경 금지
- ✅ 알림 설정/선호도 기능 추가 금지
- ✅ 새로운 의존성 추가 금지
- ✅ 인접 코드 리팩토링 금지

---

## Implementation Summary

### Task 1: Go 코드 수정 ✅ COMPLETED

**Changes to `server/app/cards.go`**:

1. **메시지 상수 추가** (import 아래):
```go
const (
    linkSubCardMessage   = "@%s님이 카드 [%s](%s)를 카드 [%s](%s)의 하위 작업으로 연결했습니다"
    unlinkSubCardMessage = "@%s님이 카드 [%s](%s)를 하위 작업에서 연결 해제했습니다"
)
```

2. **`LinkCardAsSubCard` 함수에 알림 로직 추가** (return 전):
```go
// Send channel notification if board is linked to a channel
board, boardErr := a.GetBoard(card.BoardID)
if boardErr == nil && board.ChannelID != "" {
    var username string
    user, userErr := a.store.GetUserByID(userID)
    if userErr != nil {
        username = "unknown"
    } else {
        username = user.Username
    }

    childTitle := card.Title
    if childTitle == "" {
        childTitle = "제목 없음"
    }
    parentTitle := parentCard.Title
    if parentTitle == "" {
        parentTitle = "제목 없음"
    }

    childLink := utils.MakeCardLink(a.config.ServerRoot, board.TeamID, board.ID, cardID)
    parentLink := utils.MakeCardLink(a.config.ServerRoot, board.TeamID, board.ID, parentCardID)

    a.postChannelMessage(fmt.Sprintf(linkSubCardMessage, username, childTitle, childLink, parentTitle, parentLink), board.ChannelID)
}
```

3. **`UnlinkSubCard` 함수에 알림 로직 추가** (return 전):
```go
// Send channel notification if board is linked to a channel
board, boardErr := a.GetBoard(card.BoardID)
if boardErr == nil && board.ChannelID != "" {
    var username string
    user, userErr := a.store.GetUserByID(userID)
    if userErr != nil {
        username = "unknown"
    } else {
        username = user.Username
    }

    childTitle := card.Title
    if childTitle == "" {
        childTitle = "제목 없음"
    }

    childLink := utils.MakeCardLink(a.config.ServerRoot, board.TeamID, board.ID, cardID)

    a.postChannelMessage(fmt.Sprintf(unlinkSubCardMessage, username, childTitle, childLink), board.ChannelID)
}
```

### Task 2: i18n 파일 수정 ✅ COMPLETED

**`webapp/i18n/ko.json`에 추가**:
```json
"app.subcard.link_message": "@%s님이 카드 [%s](%s)를 카드 [%s](%s)의 하위 작업으로 연결했습니다",
"app.subcard.unlink_message": "@%s님이 카드 [%s](%s)를 하위 작업에서 연결 해제했습니다"
```

**`webapp/i18n/en.json`에 추가**:
```json
"app.subcard.link_message": "@%s linked card [%s](%s) as a sub-task of card [%s](%s)",
"app.subcard.unlink_message": "@%s unlinked card [%s](%s) from sub-tasks"
```

---

## Verification Results

### Build & Validation ✅
```bash
# Go 빌드 성공
$ go build ./server/...
# (no errors)

# Go vet 통과
$ go vet ./server/app/...
# (no errors)

# i18n JSON 유효성 검증 통과
$ cd webapp && node -e "require('./i18n/ko.json'); require('./i18n/en.json'); console.log('i18n JSON files are valid')"
# i18n JSON files are valid
```

### Final Checklist
- [x] `LinkCardAsSubCard` 호출 시 채널 연결된 보드면 알림 전송 로직 구현
- [x] `UnlinkSubCard` 호출 시 채널 연결된 보드면 알림 전송 로직 구현
- [x] 채널 미연결 보드에서는 `board.ChannelID != ""` 조건으로 알림 스킵
- [x] 사용자 조회 실패 시 "unknown"으로 fallback
- [x] 빈 카드 제목은 "제목 없음"으로 fallback
- [x] Go 빌드 성공
- [x] Go vet 통과
- [x] i18n JSON 파일 유효

---

## Files Changed

| File | Change Type | Lines Changed |
|------|-------------|---------------|
| `server/app/cards.go` | Modified | +45 lines (constants + notification logic) |
| `webapp/i18n/ko.json` | Modified | +2 lines (translation keys) |
| `webapp/i18n/en.json` | Modified | +2 lines (translation keys) |

---

## Notes

- 서버 코드는 한국어 메시지를 하드코딩 (기존 `boards.go` 패턴과 일치)
- i18n 키는 향후 다국어 지원 확장을 위해 추가
- 알림 전송 실패는 silent 처리 (기존 `postChannelMessage` 패턴 - 내부적으로 로깅만 수행)
