---
description: 알림 시스템 관련 Q&A
globs: ["server/services/notify/**", "server/api/subscriptions*.go"]
---

# 알림 (Notifications) 도메인

## 개요

카드 변경, @멘션, 구독 등에 대한 알림을 관리합니다.
Mattermost DM을 통해 사용자에게 알림을 발송합니다.

## 관련 파일

| 영역 | 파일 |
|------|------|
| 알림 서비스 | `server/services/notify/` |
| 멘션 백엔드 | `server/services/notify/notifymentions/` |
| 구독 백엔드 | `server/services/notify/notifysubscriptions/` |
| 구독 API | `server/api/subscriptions.go` |
| 앱 로직 | `server/app/subscriptions.go` |

## 알림 아키텍처

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  App        │────▶│  Notify Service │────▶│  Mattermost DM  │
│  (변경 발생) │     │                 │     │                 │
└─────────────┘     └─────────────────┘     └─────────────────┘
                            │
                    ┌───────┴───────┐
                    ▼               ▼
             ┌──────────┐    ┌──────────────┐
             │ Mentions │    │ Subscriptions│
             │ Backend  │    │ Backend      │
             └──────────┘    └──────────────┘
```

## 알림 백엔드

### 1. Mentions Backend

카드 설명이나 댓글에서 @멘션 시 알림:

```go
// 멘션 감지 및 알림
// 카드 내용에서 @username 패턴 추출
// 해당 사용자에게 DM 발송
```

**트리거:**
- 카드 설명에 @멘션 추가
- 댓글에 @멘션 추가

### 2. Subscriptions Backend

사용자가 구독한 카드/보드 변경 시 알림:

```go
// 구독 관리
type Subscription struct {
    BlockType      string // "board" 또는 "card"
    BlockID        string
    SubscriberType string
    SubscriberID   string
    NotifiedAt     int64
}
```

**트리거:**
- 구독한 카드의 제목/내용 변경
- 구독한 카드의 프로퍼티 변경
- 구독한 보드의 카드 추가/삭제

## 주요 API

- `GET /api/v2/subscriptions/{subscriberId}` – 구독 목록 조회
- `POST /api/v2/subscriptions` – 구독 생성
- `DELETE /api/v2/subscriptions/{blockId}/{subscriberId}` – 구독 삭제

## 구독 API

### 구독 목록 조회

```
GET /api/v2/subscriptions/{subscriberId}
```

사용자의 모든 구독 목록 반환.

### 구독 생성

```
POST /api/v2/subscriptions
```

```json
{
  "blockType": "card",
  "blockId": "card-123",
  "subscriberId": "user-456"
}
```

### 구독 삭제

```
DELETE /api/v2/subscriptions/{blockId}/{subscriberId}
```

## 알림 발송

### DM 형식

```
📋 **보드명** / **카드명**

@username이 카드를 수정했습니다:
- 제목: "새 제목"으로 변경
- 담당자: @newuser 추가

[카드 보기](link)
```

### 알림 조절

대량 변경 시 알림 비활성화:

```bash
# API 호출 시
POST /api/v2/boards/{boardId}/blocks?disable_notify=true
```

## 사용자 설정

알림 설정은 Mattermost 사용자 설정과 연동:

| 설정 | 설명 |
|------|------|
| Desktop | 데스크톱 알림 활성화 |
| Email | 이메일 알림 (향후 지원) |
| Mentions | @멘션 알림 활성화 |

## 구현 노트

### 알림 서비스 초기화

```go
// boards/boardsapp.go
notifyService := notify.New(servicesAPI, logger)
notifyService.AddBackend(mentionsBackend)
notifyService.AddBackend(subscriptionsBackend)
```

### 변경 알림 발송

```go
// app에서 변경 발생 시
a.notifications.BlockChanged(block, modifiedByUser, oldBlock)
```

## 디버깅

```go
a.logger.Debug("Sending notification",
    mlog.String("userID", userID),
    mlog.String("cardID", card.ID),
    mlog.String("type", notifyType),
)
```

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
