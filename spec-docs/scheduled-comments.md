# 댓글 예약 발송 기능 설계

## 개요

카드 댓글에 예약 발송 기능을 추가하여 지정된 시간에 자동으로 댓글이 게시되도록 합니다.

### 목표
- 사용자가 특정 날짜/시간에 댓글이 자동 게시되도록 예약
- 예약된 댓글 조회, 수정, 취소 기능
- 예약 시간 도달 시 @멘션 알림 트리거

### 비목표
- 반복 예약 (매주, 매일 등)
- 다른 블록 타입의 예약 발송

---

## 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend                               │
│  ┌─────────────────┐    ┌─────────────────────────────┐      │
│  │ CommentsList    │───▶│ ScheduledCommentPicker      │      │
│  │ (예약 버튼 추가)│    │ (날짜/시간 선택 UI)         │      │
│  └─────────────────┘    └─────────────────────────────┘      │
└───────────────────────────────┬──────────────────────────────┘
                                │
                    POST /blocks (with scheduledAt field)
                                │
┌───────────────────────────────▼──────────────────────────────┐
│                        Backend                                │
│  ┌─────────────────┐    ┌─────────────────────────────┐      │
│  │ API Handler     │───▶│ App Layer                   │      │
│  │ (예약 댓글 API) │    │ (예약 댓글 조회/발송)       │      │
│  └─────────────────┘    └──────────────┬──────────────┘      │
│                                        │                      │
│  ┌─────────────────┐    ┌──────────────▼──────────────┐      │
│  │ Scheduler       │───▶│ Store (예약 댓글 쿼리)      │      │
│  │ (1분 주기 체크) │    │                             │      │
│  └─────────────────┘    └─────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

---

## 데이터 모델

### 접근 방식

댓글은 기존 `Block` 타입(`type: 'comment'`)으로 구현되어 있으므로, `Block.Fields`에 예약 정보를 저장합니다.

### Block.Fields 확장

```go
// 예약 관련 필드 상수 (server/model/block.go)
const (
    BlockFieldScheduledAt     = "scheduledAt"     // Unix 밀리초 타임스탬프
    BlockFieldScheduledStatus = "scheduledStatus" // pending | sent | cancelled
)
```

```json
{
  "id": "comment_block_id",
  "type": "comment",
  "parentId": "card_id",
  "boardId": "board_id",
  "title": "예약된 댓글 내용",
  "fields": {
    "scheduledAt": 1706700000000,
    "scheduledStatus": "pending"
  },
  "createdBy": "user_id",
  "createAt": 1706600000000,
  "updateAt": 1706600000000,
  "deleteAt": 0
}
```

### 예약 상태 (scheduledStatus)

| 상태 | 설명 |
|------|------|
| `pending` | 예약됨, 발송 대기 중 |
| `sent` | 발송 완료 |
| `cancelled` | 예약 취소됨 |

### 예약된 댓글 조회 조건

예약된 댓글(아직 발송되지 않은)은 일반 댓글 목록에서 제외합니다:

```sql
-- 일반 댓글 조회 (기존 로직 수정)
SELECT * FROM focalboard_blocks
WHERE type = 'comment'
  AND parent_id = :cardId
  AND delete_at = 0
  AND (
    fields->>'scheduledStatus' IS NULL 
    OR fields->>'scheduledStatus' = 'sent'
  )
ORDER BY create_at DESC;

-- 예약된 댓글 조회 (새로운 쿼리)
SELECT * FROM focalboard_blocks
WHERE type = 'comment'
  AND parent_id = :cardId
  AND delete_at = 0
  AND fields->>'scheduledStatus' = 'pending'
ORDER BY CAST(fields->>'scheduledAt' AS BIGINT) ASC;
```

---

## API 설계

### 기존 API 동작 변경

#### POST /api/v2/boards/{boardID}/blocks

예약 댓글 생성 시 `fields`에 예약 정보 포함:

```json
{
  "type": "comment",
  "parentId": "{cardId}",
  "title": "댓글 내용",
  "fields": {
    "scheduledAt": 1706700000000,
    "scheduledStatus": "pending"
  }
}
```

### 새로운 API 엔드포인트

#### GET /api/v2/me/scheduled-comments

현재 사용자의 모든 예약된 댓글 조회

**Response:**
```json
{
  "comments": [
    {
      "id": "block_id",
      "type": "comment",
      "parentId": "card_id",
      "boardId": "board_id",
      "title": "댓글 내용",
      "fields": {
        "scheduledAt": 1706700000000,
        "scheduledStatus": "pending"
      },
      "createAt": 1706600000000,
      "card": {
        "id": "card_id",
        "title": "카드 제목"
      },
      "board": {
        "id": "board_id",
        "title": "보드 제목"
      }
    }
  ]
}
```

#### DELETE /api/v2/boards/{boardID}/blocks/{blockID}/schedule

예약 취소 (scheduledStatus를 cancelled로 변경)

**Response:**
```json
{
  "id": "block_id",
  "fields": {
    "scheduledAt": 1706700000000,
    "scheduledStatus": "cancelled"
  }
}
```

#### POST /api/v2/boards/{boardID}/blocks/{blockID}/send-now

예약된 댓글 즉시 발송

**Response:**
```json
{
  "id": "block_id",
  "fields": {
    "scheduledAt": 1706700000000,
    "scheduledStatus": "sent"
  }
}
```

---

## 서버 구현

### Phase 1: 데이터 모델

#### 1-1. Block 필드 상수 추가

**파일:** `server/model/block.go`

```go
const (
    // 기존 상수들...
    BlockFieldScheduledAt     = "scheduledAt"
    BlockFieldScheduledStatus = "scheduledStatus"
)

// 예약 상태 상수
const (
    ScheduledStatusPending   = "pending"
    ScheduledStatusSent      = "sent"
    ScheduledStatusCancelled = "cancelled"
)
```

### Phase 2: Store 레이어

#### 2-1. Store 인터페이스 추가

**파일:** `server/services/store/store.go`

```go
type Store interface {
    // 기존 메서드들...
    
    // 예약 댓글 관련
    GetScheduledComments(beforeTime int64) ([]*model.Block, error)
    GetScheduledCommentsByUser(userID string) ([]*model.Block, error)
    GetScheduledCommentsForCard(cardID string) ([]*model.Block, error)
}
```

#### 2-2. SQLStore 구현

**파일:** `server/services/store/sqlstore/scheduled_comments.go` (새 파일)

```go
package sqlstore

import (
    "github.com/mattermost/mattermost-plugin-boards/server/model"
    sq "github.com/Masterminds/squirrel"
)

// GetScheduledComments returns all scheduled comments that should be sent
func (s *SQLStore) GetScheduledComments(beforeTime int64) ([]*model.Block, error) {
    query := s.getQueryBuilder().
        Select(s.blockFields("")...).
        From(s.tablePrefix + "blocks").
        Where(sq.Eq{"type": model.TypeComment}).
        Where(sq.Eq{"delete_at": 0}).
        Where(sq.Eq{s.jsonExtract("fields", "scheduledStatus"): model.ScheduledStatusPending}).
        Where(sq.LtOrEq{s.jsonExtractInt("fields", "scheduledAt"): beforeTime})
    
    rows, err := query.Query()
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    return s.blocksFromRows(rows)
}

// GetScheduledCommentsByUser returns all pending scheduled comments for a user
func (s *SQLStore) GetScheduledCommentsByUser(userID string) ([]*model.Block, error) {
    query := s.getQueryBuilder().
        Select(s.blockFields("")...).
        From(s.tablePrefix + "blocks").
        Where(sq.Eq{"type": model.TypeComment}).
        Where(sq.Eq{"created_by": userID}).
        Where(sq.Eq{"delete_at": 0}).
        Where(sq.Eq{s.jsonExtract("fields", "scheduledStatus"): model.ScheduledStatusPending}).
        OrderBy(s.jsonExtractInt("fields", "scheduledAt") + " ASC")
    
    rows, err := query.Query()
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    return s.blocksFromRows(rows)
}

// GetScheduledCommentsForCard returns pending scheduled comments for a card
func (s *SQLStore) GetScheduledCommentsForCard(cardID string) ([]*model.Block, error) {
    query := s.getQueryBuilder().
        Select(s.blockFields("")...).
        From(s.tablePrefix + "blocks").
        Where(sq.Eq{"type": model.TypeComment}).
        Where(sq.Eq{"parent_id": cardID}).
        Where(sq.Eq{"delete_at": 0}).
        Where(sq.Eq{s.jsonExtract("fields", "scheduledStatus"): model.ScheduledStatusPending}).
        OrderBy(s.jsonExtractInt("fields", "scheduledAt") + " ASC")
    
    rows, err := query.Query()
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    return s.blocksFromRows(rows)
}
```

### Phase 3: App 레이어

**파일:** `server/app/scheduled_comments.go` (새 파일)

```go
package app

import (
    "github.com/mattermost/mattermost-plugin-boards/server/model"
    "github.com/mattermost/mattermost/server/public/shared/mlog"
)

// ProcessScheduledComments processes all scheduled comments that are due
func (a *App) ProcessScheduledComments() error {
    now := model.GetMillis()
    
    comments, err := a.store.GetScheduledComments(now)
    if err != nil {
        return err
    }
    
    a.logger.Debug("Processing scheduled comments",
        mlog.Int("count", len(comments)),
    )
    
    for _, comment := range comments {
        if err := a.sendScheduledComment(comment); err != nil {
            a.logger.Error("Failed to send scheduled comment",
                mlog.String("blockID", comment.ID),
                mlog.Err(err),
            )
            continue
        }
    }
    
    return nil
}

// sendScheduledComment marks a comment as sent and triggers notifications
func (a *App) sendScheduledComment(comment *model.Block) error {
    // Update status to sent
    patch := &model.BlockPatch{
        UpdatedFields: map[string]interface{}{
            model.BlockFieldScheduledStatus: model.ScheduledStatusSent,
        },
    }
    
    updatedComment, err := a.PatchBlockAndNotify(
        comment.ID,
        patch,
        comment.CreatedBy,
        false, // disableNotify = false to trigger mentions
    )
    if err != nil {
        return err
    }
    
    // Broadcast via WebSocket
    a.blockChangeNotifier.Enqueue(func() error {
        a.wsAdapter.BroadcastBlockChange(comment.BoardID, *updatedComment)
        return nil
    })
    
    a.logger.Info("Scheduled comment sent",
        mlog.String("blockID", comment.ID),
        mlog.String("boardID", comment.BoardID),
        mlog.String("cardID", comment.ParentID),
    )
    
    return nil
}

// CancelScheduledComment cancels a scheduled comment
func (a *App) CancelScheduledComment(blockID, userID string) (*model.Block, error) {
    block, err := a.GetBlockByID(blockID)
    if err != nil {
        return nil, err
    }
    
    // Verify it's a scheduled comment
    if block.Type != model.TypeComment {
        return nil, model.NewErrBadRequest("block is not a comment")
    }
    
    status, _ := block.Fields[model.BlockFieldScheduledStatus].(string)
    if status != model.ScheduledStatusPending {
        return nil, model.NewErrBadRequest("comment is not scheduled or already sent")
    }
    
    // Verify ownership
    if block.CreatedBy != userID {
        return nil, model.NewErrForbidden("can only cancel own scheduled comments")
    }
    
    patch := &model.BlockPatch{
        UpdatedFields: map[string]interface{}{
            model.BlockFieldScheduledStatus: model.ScheduledStatusCancelled,
        },
    }
    
    return a.PatchBlock(blockID, patch, userID)
}

// SendScheduledCommentNow immediately sends a scheduled comment
func (a *App) SendScheduledCommentNow(blockID, userID string) (*model.Block, error) {
    block, err := a.GetBlockByID(blockID)
    if err != nil {
        return nil, err
    }
    
    // Verify it's a pending scheduled comment
    if block.Type != model.TypeComment {
        return nil, model.NewErrBadRequest("block is not a comment")
    }
    
    status, _ := block.Fields[model.BlockFieldScheduledStatus].(string)
    if status != model.ScheduledStatusPending {
        return nil, model.NewErrBadRequest("comment is not scheduled")
    }
    
    // Verify ownership
    if block.CreatedBy != userID {
        return nil, model.NewErrForbidden("can only send own scheduled comments")
    }
    
    if err := a.sendScheduledComment(block); err != nil {
        return nil, err
    }
    
    return a.GetBlockByID(blockID)
}

// GetMyScheduledComments returns all scheduled comments for a user
func (a *App) GetMyScheduledComments(userID string) ([]*model.Block, error) {
    return a.store.GetScheduledCommentsByUser(userID)
}

// GetScheduledCommentsForCard returns scheduled comments for a card visible to user
func (a *App) GetScheduledCommentsForCard(cardID, userID string) ([]*model.Block, error) {
    comments, err := a.store.GetScheduledCommentsForCard(cardID)
    if err != nil {
        return nil, err
    }
    
    // Filter to only show user's own scheduled comments
    var result []*model.Block
    for _, c := range comments {
        if c.CreatedBy == userID {
            result = append(result, c)
        }
    }
    
    return result, nil
}
```

### Phase 4: 스케줄러 등록

**파일:** `server/boards/boardsapp.go` 수정

```go
func (b *BoardsApp) Start() error {
    // 기존 시작 로직...
    
    // 예약 댓글 처리 스케줄러 (1분 주기)
    b.scheduledCommentsTask = scheduler.CreateRecurringTask(
        "ProcessScheduledComments",
        func() {
            if err := b.server.App().ProcessScheduledComments(); err != nil {
                b.logger.Error("Failed to process scheduled comments", mlog.Err(err))
            }
        },
        time.Minute,
    )
    
    return nil
}

func (b *BoardsApp) Stop() error {
    // 기존 중지 로직...
    
    if b.scheduledCommentsTask != nil {
        b.scheduledCommentsTask.Cancel()
    }
    
    return nil
}
```

### Phase 5: API 핸들러

**파일:** `server/api/scheduled_comments.go` (새 파일)

```go
package api

import (
    "encoding/json"
    "net/http"

    "github.com/gorilla/mux"
    "github.com/mattermost/mattermost-plugin-boards/server/model"
)

func (a *API) registerScheduledCommentsRoutes(r *mux.Router) {
    // 내 예약 댓글 목록
    r.HandleFunc("/me/scheduled-comments", a.sessionRequired(a.handleGetMyScheduledComments)).Methods(http.MethodGet)
    
    // 예약 취소
    r.HandleFunc("/boards/{boardID}/blocks/{blockID}/schedule", a.sessionRequired(a.handleCancelScheduledComment)).Methods(http.MethodDelete)
    
    // 즉시 발송
    r.HandleFunc("/boards/{boardID}/blocks/{blockID}/send-now", a.sessionRequired(a.handleSendScheduledCommentNow)).Methods(http.MethodPost)
}

func (a *API) handleGetMyScheduledComments(w http.ResponseWriter, r *http.Request) {
    userID := getUserID(r)
    
    comments, err := a.app.GetMyScheduledComments(userID)
    if err != nil {
        a.errorResponse(w, r, err)
        return
    }
    
    data, err := json.Marshal(comments)
    if err != nil {
        a.errorResponse(w, r, err)
        return
    }
    
    jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleCancelScheduledComment(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    blockID := vars["blockID"]
    userID := getUserID(r)
    
    block, err := a.app.CancelScheduledComment(blockID, userID)
    if err != nil {
        a.errorResponse(w, r, err)
        return
    }
    
    data, err := json.Marshal(block)
    if err != nil {
        a.errorResponse(w, r, err)
        return
    }
    
    jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleSendScheduledCommentNow(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    blockID := vars["blockID"]
    userID := getUserID(r)
    
    block, err := a.app.SendScheduledCommentNow(blockID, userID)
    if err != nil {
        a.errorResponse(w, r, err)
        return
    }
    
    data, err := json.Marshal(block)
    if err != nil {
        a.errorResponse(w, r, err)
        return
    }
    
    jsonBytesResponse(w, http.StatusOK, data)
}
```

---

## 프론트엔드 구현

### Phase 1: 타입 정의

**파일:** `webapp/src/blocks/commentBlock.ts`

```typescript
import {Block, createBlock} from './block'

// 예약 상태
export type ScheduledStatus = 'pending' | 'sent' | 'cancelled'

// 예약 댓글 필드
export interface ScheduledCommentFields {
    scheduledAt?: number      // Unix 밀리초
    scheduledStatus?: ScheduledStatus
}

type CommentBlock = Block & {
    type: 'comment'
    fields: ScheduledCommentFields
}

function createCommentBlock(block?: Block): CommentBlock {
    return {
        ...createBlock(block),
        type: 'comment',
        fields: block?.fields || {},
    }
}

function createScheduledCommentBlock(
    block: Partial<Block>,
    scheduledAt: number
): CommentBlock {
    return {
        ...createCommentBlock(block as Block),
        fields: {
            scheduledAt,
            scheduledStatus: 'pending',
        },
    }
}

function isScheduledComment(block: Block): boolean {
    return block.type === 'comment' && 
           block.fields?.scheduledStatus === 'pending'
}

function isSentComment(block: Block): boolean {
    return block.type === 'comment' && 
           (!block.fields?.scheduledStatus || 
            block.fields?.scheduledStatus === 'sent')
}

export {
    CommentBlock,
    createCommentBlock,
    createScheduledCommentBlock,
    isScheduledComment,
    isSentComment,
}
```

### Phase 2: API 클라이언트

**파일:** `webapp/src/octoClient.ts` 추가

```typescript
// 내 예약 댓글 목록
async getMyScheduledComments(): Promise<Block[]> {
    const response = await fetch(
        `${this.serverUrl}/api/v2/me/scheduled-comments`,
        {headers: this.headers()}
    )
    if (response.status !== 200) {
        return []
    }
    return (await this.getJson(response)) as Block[]
}

// 예약 취소
async cancelScheduledComment(boardId: string, blockId: string): Promise<Block | undefined> {
    const response = await fetch(
        `${this.serverUrl}/api/v2/boards/${boardId}/blocks/${blockId}/schedule`,
        {
            method: 'DELETE',
            headers: this.headers(),
        }
    )
    if (response.status !== 200) {
        return undefined
    }
    return (await this.getJson(response)) as Block
}

// 즉시 발송
async sendScheduledCommentNow(boardId: string, blockId: string): Promise<Block | undefined> {
    const response = await fetch(
        `${this.serverUrl}/api/v2/boards/${boardId}/blocks/${blockId}/send-now`,
        {
            method: 'POST',
            headers: this.headers(),
        }
    )
    if (response.status !== 200) {
        return undefined
    }
    return (await this.getJson(response)) as Block
}
```

### Phase 3: UI 컴포넌트

#### 3-1. 날짜/시간 선택기

**파일:** `webapp/src/components/cardDetail/scheduledCommentPicker.tsx` (새 파일)

```tsx
import React, {useState, useCallback} from 'react'
import {useIntl} from 'react-intl'

import Button from '../../widgets/buttons/button'
import './scheduledCommentPicker.scss'

type Props = {
    onSchedule: (scheduledAt: number) => void
    onCancel: () => void
}

const ScheduledCommentPicker: React.FC<Props> = ({onSchedule, onCancel}) => {
    const intl = useIntl()
    
    // 기본값: 내일 오전 9시
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    
    const [date, setDate] = useState(tomorrow.toISOString().split('T')[0])
    const [time, setTime] = useState('09:00')
    
    const handleSchedule = useCallback(() => {
        const scheduledDate = new Date(`${date}T${time}`)
        onSchedule(scheduledDate.getTime())
    }, [date, time, onSchedule])
    
    const minDate = new Date().toISOString().split('T')[0]
    
    return (
        <div className='ScheduledCommentPicker'>
            <div className='ScheduledCommentPicker__header'>
                {intl.formatMessage({
                    id: 'ScheduledCommentPicker.title',
                    defaultMessage: 'Schedule comment'
                })}
            </div>
            
            <div className='ScheduledCommentPicker__inputs'>
                <input
                    type='date'
                    value={date}
                    min={minDate}
                    onChange={(e) => setDate(e.target.value)}
                />
                <input
                    type='time'
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                />
            </div>
            
            <div className='ScheduledCommentPicker__actions'>
                <Button onClick={onCancel}>
                    {intl.formatMessage({
                        id: 'ScheduledCommentPicker.cancel',
                        defaultMessage: 'Cancel'
                    })}
                </Button>
                <Button
                    filled={true}
                    onClick={handleSchedule}
                >
                    {intl.formatMessage({
                        id: 'ScheduledCommentPicker.schedule',
                        defaultMessage: 'Schedule'
                    })}
                </Button>
            </div>
        </div>
    )
}

export default React.memo(ScheduledCommentPicker)
```

#### 3-2. CommentsList 수정

**파일:** `webapp/src/components/cardDetail/commentsList.tsx` 수정

주요 변경사항:
- 예약 버튼 추가
- 예약된 댓글 별도 섹션 표시
- 발송/취소 핸들러

```tsx
// 새로운 상태
const [showSchedulePicker, setShowSchedulePicker] = useState(false)

// 예약 발송 핸들러
const onScheduleClicked = (scheduledAt: number) => {
    const {cardId, boardId} = props
    const comment = createScheduledCommentBlock(
        {parentId: cardId, boardId, title: newComment},
        scheduledAt
    )
    mutator.insertBlock(boardId, comment, 'schedule comment')
    setNewComment('')
    setShowSchedulePicker(false)
}

// UI에 예약 버튼 추가
{newComment && (
    <>
        <Button onClick={() => setShowSchedulePicker(true)}>
            <ClockIcon />
        </Button>
        <Button filled={true} onClick={onSendClicked}>
            Send
        </Button>
    </>
)}

{showSchedulePicker && (
    <ScheduledCommentPicker
        onSchedule={onScheduleClicked}
        onCancel={() => setShowSchedulePicker(false)}
    />
)}
```

#### 3-3. 예약된 댓글 컴포넌트

**파일:** `webapp/src/components/cardDetail/scheduledComment.tsx` (새 파일)

예약된 댓글 표시 및 취소/즉시 발송 기능

---

## UI/UX 설계

### 댓글 입력 영역

```
┌─────────────────────────────────────────────────────┐
│ 🖼️ | 댓글 입력 영역...                               │
├─────────────────────────────────────────────────────┤
│                         [🕐 예약] [전송]             │
└─────────────────────────────────────────────────────┘
         │
         ▼ 클릭 시
┌─────────────────────────────────────────────────────┐
│ 예약 발송                                           │
│ ┌───────────────┐  ┌───────────────┐               │
│ │ 📅 2026-01-31 │  │ 🕐 09:00      │               │
│ └───────────────┘  └───────────────┘               │
│                        [취소] [예약]                 │
└─────────────────────────────────────────────────────┘
```

### 예약된 댓글 표시

```
┌─────────────────────────────────────────────────────┐
│ 📋 예약된 댓글 (1)                                   │
├─────────────────────────────────────────────────────┤
│ 🖼️ 홍길동  •  🕐 2026-01-31 09:00 예약됨             │
│ ─────────────────────────────────────────────────── │
│ 예약된 댓글 내용 미리보기...                         │
│                        [예약 취소] [지금 발송]       │
└─────────────────────────────────────────────────────┘
```

---

## 구현 순서

### 서버 (우선순위 순)

1. Block 필드 상수 정의 (`server/model/block.go`)
2. Store 인터페이스 추가 (`server/services/store/store.go`)
3. SQLStore 구현 (`server/services/store/sqlstore/scheduled_comments.go`)
4. App 레이어 비즈니스 로직 (`server/app/scheduled_comments.go`)
5. API 핸들러 (`server/api/scheduled_comments.go`)
6. API 라우트 등록 (`server/api/api.go`)
7. 스케줄러 등록 (`server/boards/boardsapp.go`)
8. 단위 테스트

### 프론트엔드 (우선순위 순)

1. CommentBlock 타입 확장 (`webapp/src/blocks/commentBlock.ts`)
2. API 클라이언트 추가 (`webapp/src/octoClient.ts`)
3. Redux 상태 관리 수정 (`webapp/src/store/comments.ts`)
4. Mutator 메서드 추가 (`webapp/src/mutator.ts`)
5. 날짜/시간 선택기 컴포넌트
6. CommentsList 수정
7. 예약된 댓글 컴포넌트
8. SCSS 스타일링
9. 단위 테스트

---

## 고려 사항

### 시간대 처리

- 서버: UTC 타임스탬프로 저장 (Unix 밀리초)
- 프론트엔드: 사용자 로컬 시간대로 표시/입력
- JavaScript `Date` 객체가 자동으로 로컬 ↔ UTC 변환

### 권한

- 기존 `PermissionCommentBoardCards` 재사용
- 자신의 예약 댓글만 취소/즉시 발송 가능
- Admin도 타인의 예약 댓글 취소 불가 (개인 프라이버시)

### 알림

- 예약 시점이 아닌 **발송 시점**에 @멘션 알림 트리거
- 기존 `notifyMentions` 로직 재사용

### 제한 사항

| 항목 | 제한 |
|------|------|
| 최대 예약 기간 | 30일 |
| 최소 예약 시간 | 현재 + 1분 |
| 사용자당 예약 댓글 수 | 100개 |

### WebSocket 동기화

- 예약 댓글 생성/취소/발송 시 `BroadcastBlockChange` 호출
- 다른 사용자에게는 발송 완료된 댓글만 표시

---

## 테스트 계획

### 서버 단위 테스트

- `scheduled_comments_test.go`
  - 예약 댓글 생성
  - 예약 시간 도달 후 발송
  - 예약 취소
  - 즉시 발송
  - 권한 검증

### 프론트엔드 단위 테스트

- `scheduledCommentPicker.test.tsx`
- `commentsList.test.tsx` (예약 기능 추가)
- `scheduledComment.test.tsx`

### 통합 테스트

- 전체 예약 → 발송 플로우
- WebSocket 동기화 검증
- 시간대 변환 검증

---

## 마이그레이션

기존 데이터에 영향 없음:
- 새로운 `fields` 필드 추가만 필요
- 기존 댓글은 `scheduledStatus` 없음 = 발송된 댓글로 취급
- DB 스키마 변경 불필요

---

## 참고 자료

- 기존 댓글 시스템: `webapp/src/components/cardDetail/commentsList.tsx`
- Block 모델: `server/model/block.go`
- 스케줄러: `server/services/scheduler/scheduler.go`
- 알림 시스템: `server/services/notify/`
