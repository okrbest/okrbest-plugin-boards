---
description: 권한/멤버/공유 관련 Q&A
globs: ["server/api/members*.go", "server/api/sharing*.go", "server/services/permissions/**", "webapp/src/components/shareBoard/**", "webapp/src/components/permissions/**"]
---

# 권한 (Permissions) 도메인

## 개요

보드 접근 권한 및 멤버 관리를 담당합니다.
Mattermost 권한 체계와 통합되어 있습니다.

## 역할 계층

| 역할 | 코드 | 읽기 | 댓글 | 편집 | 관리 |
|------|------|------|------|------|------|
| Viewer | `viewer` | ✅ | ❌ | ❌ | ❌ |
| Commenter | `commenter` | ✅ | ✅ | ❌ | ❌ |
| Editor | `editor` | ✅ | ✅ | ✅ | ❌ |
| Admin | `admin` | ✅ | ✅ | ✅ | ✅ |

## 관련 파일

| 영역 | 파일 |
|------|------|
| API | `server/api/members.go`, `sharing.go` |
| 권한 서비스 | `server/services/permissions/` |
| MM 통합 | `server/services/permissions/mmpermissions/` |
| 웹앱 | `webapp/src/components/shareBoard/` |

## 권한 서비스 구조

```
server/services/permissions/
├── permissions.go          # 인터페이스 정의
├── localpermissions/       # 로컬(독립 실행) 모드
└── mmpermissions/          # Mattermost 플러그인 모드
    └── mmpermissions.go    # MM 권한과 통합
```

### Mattermost 권한 통합

```go
// mmpermissions.go
func (s *Service) HasPermissionToBoard(userID, boardID string, permission Permission) bool {
    // 1. 보드 멤버십 확인
    member, _ := s.store.GetMemberForBoard(boardID, userID)
    if member != nil {
        return hasRolePermission(member.Role, permission)
    }
    
    // 2. 팀 관리자 권한 확인
    if s.api.HasPermissionToTeam(userID, teamID, model.PermissionManageTeam) {
        return true
    }
    
    // 3. 시스템 관리자 확인
    return s.api.HasPermissionTo(userID, model.PermissionManageSystem)
}
```

## 주요 API

- `GET /api/v2/boards/{boardId}/members` – 멤버 목록
- `POST /api/v2/boards/{boardId}/members` – 멤버 추가
- `PUT /api/v2/boards/{boardId}/members/{userId}` – 멤버 역할 변경
- `DELETE /api/v2/boards/{boardId}/members/{userId}` – 멤버 제거
- `GET /api/v2/boards/{boardId}/sharing` – 공유 설정 조회
- `POST /api/v2/boards/{boardId}/sharing` – 공유 활성화

## 멤버 API

### 멤버 목록 조회

```
GET /api/v2/boards/{boardId}/members
```

### 멤버 추가

```
POST /api/v2/boards/{boardId}/members
```

```json
{
  "userId": "user-123",
  "schemeAdmin": false,
  "schemeEditor": true
}
```

### 멤버 역할 변경

```
PUT /api/v2/boards/{boardId}/members/{userId}
```

```json
{
  "schemeAdmin": true
}
```

### 멤버 제거

```
DELETE /api/v2/boards/{boardId}/members/{userId}
```

## 공유 API

### 공유 설정 조회

```
GET /api/v2/boards/{boardId}/sharing
```

### 공유 활성화

```
POST /api/v2/boards/{boardId}/sharing
```

```json
{
  "enabled": true,
  "token": "abc123..."  // 자동 생성
}
```

공개 공유 링크: `/shared/{teamId}/{boardId}?r={token}`

## 인증

### 세션 인증

```go
// api/context.go
session := a.getSession(r)
userID := session.UserID
```

### CSRF 토큰 검증

```go
// api/api.go - requireCSRFToken 미들웨어
requestedWith := r.Header.Get("X-Requested-With")
if requestedWith != "XMLHttpRequest" {
    // CSRF 검증 실패
}
```

### 공개 공유 토큰

```go
// 공개 공유 접근 시
readToken := r.URL.Query().Get("read_token")
if readToken != "" {
    // 토큰으로 읽기 권한 확인
}
```

## 게스트 사용자 제한

Mattermost 게스트 사용자는 제한된 권한:

```go
if s.api.UserIsGuest(userID) {
    // 게스트 사용자 제한 적용
}
```

## 권한 검증 패턴

```go
// API 핸들러에서
func (a *API) handleUpdateBoard(w http.ResponseWriter, r *http.Request) {
    // 1. 세션 확인
    session := a.getSession(r)
    
    // 2. 권한 확인
    if !a.permissions.HasPermissionToBoard(session.UserID, boardID, PermissionEditBoard) {
        a.errorResponse(w, r, model.NewErrForbidden("권한 없음"))
        return
    }
    
    // 3. 비즈니스 로직 실행
    // ...
}
```

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
```
