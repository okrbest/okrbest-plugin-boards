---
description: 프로젝트 전체 규칙 및 컨텍스트
globs: ["**/*"]
alwaysApply: true
---

# Mattermost Boards 플러그인 프로젝트

## 프로젝트 개요

- **프로젝트명**: Mattermost Boards (Focalboard)
- **목적**: Mattermost 내 프로젝트/작업 관리 플러그인 (Trello, Notion, Asana 대안)
- **버전**: 9.2.1
- **최소 서버 버전**: Mattermost 10.7.0

## 기술 스택

| 영역 | 기술 |
|------|------|
| 서버 | Go 1.24+ |
| 프론트엔드 | TypeScript, React 17 |
| 빌드 | Makefile + npm + Webpack |
| 데이터베이스 | PostgreSQL, MySQL, SQLite |
| 상태 관리 | Redux Toolkit |
| 스타일 | SCSS |

## 디렉토리 구조

```
okrbest-plugin-newboards/
├── server/           # Go 백엔드
│   ├── api/         # REST API 핸들러
│   ├── app/         # 비즈니스 로직
│   ├── model/       # 도메인 모델
│   ├── boards/      # 플러그인 앱 초기화
│   └── services/    # 서비스 레이어 (store, permissions, notify)
├── webapp/           # React 프론트엔드
│   └── src/
│       ├── components/   # UI 컴포넌트
│       ├── store/        # Redux 상태
│       ├── blocks/       # 블록 타입
│       └── properties/   # 프로퍼티 타입
├── spec-docs/        # 설계 문서
└── public/           # 정적 리소스
```

## 핵심 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| 보드 관리 | ✅ 완료 | 생성/수정/삭제/복제/템플릿 |
| 카드 관리 | ✅ 완료 | CRUD, 프로퍼티, 첨부파일 |
| 뷰 관리 | ✅ 완료 | Kanban/Table/Calendar/Gallery |
| 채널 연동 | ✅ 완료 | RHS, Unfurl, 채널 보드 |
| 권한 관리 | ✅ 완료 | 역할 기반 접근 제어 |
| 실시간 동기화 | ✅ 완료 | WebSocket |
| BlockSuite 에디터 | 🔧 개선중 | Yjs 기반 에디터 통합 |

## 코딩 규칙

### 공통
- 모든 응답은 **한국어**로 작성
- 기존 코드 스타일과 패턴을 따를 것
- 불필요한 추상화나 over-engineering 금지
- 한 번에 하나의 기능만 변경

### 서버 (Go)
- 레이어 구조 준수: API → App → Store
- `model.NewErr*` 함수로 에러 처리
- `mlog` 라이브러리로 로깅

### 웹앱 (TypeScript/React)
- 함수형 컴포넌트 사용
- Redux Toolkit으로 상태 관리
- SCSS로 스타일링 (CSS 변수 활용)

### 테스트
- 서버: `*_test.go` 파일
- 웹앱: `*.test.tsx` 파일
- 변경된 코드에 대한 테스트 작성 권장

## 주요 빌드 명령

```bash
# 의존성 설치
cd webapp && npm install

# 개발 빌드 (현재 OS/아키텍처만)
MM_DEBUG=true make dist

# 프로덕션 빌드 (모든 플랫폼)
make dist

# 로컬 서버에 배포
make deploy

# 실시간 개발 (파일 변경 감지)
make watch-plugin

# 테스트
make test

# 코드 스타일 체크
make check-style
```

## 환경 변수

| 변수 | 설명 |
|------|------|
| `MM_DEBUG=true` | 개발 모드 빌드 |
| `MM_SERVICESETTINGS_SITEURL` | Mattermost 서버 URL |
| `MM_ADMIN_USERNAME` | 관리자 사용자명 |
| `MM_ADMIN_PASSWORD` | 관리자 비밀번호 |

## 주요 참고 문서

| 문서 | 설명 |
|------|------|
| `spec-docs/architecture.md` | 아키텍처 상세 |
| `spec-docs/plan.md` | 구현 계획 및 요구사항 |
| `spec-docs/editor-api.md` | 카드 에디터 API 상세 |
| `spec-docs/blocksuite-migration.md` | BlockSuite 마이그레이션 가이드 |

## 도메인별 규칙 파일

| 도메인 | 파일 |
|--------|------|
| 보드 | `.gemini/instructions/features/boards/_index.md` |
| 카드 | `.gemini/instructions/features/cards/_index.md` |
| 블록 | `.gemini/instructions/features/blocks/_index.md` |
| BlockSuite | `.gemini/instructions/features/blocksuite/_index.md` |
| 뷰 | `.gemini/instructions/features/views/_index.md` |
| 프로퍼티 | `.gemini/instructions/features/properties/_index.md` |
| 권한 | `.gemini/instructions/features/permissions/_index.md` |
| 파일 | `.gemini/instructions/features/files/_index.md` |
| 채널 | `.gemini/instructions/features/channels/_index.md` |
| 사이드바 | `.gemini/instructions/features/sidebar/_index.md` |
| WebSocket | `.gemini/instructions/features/websocket/_index.md` |
| 알림 | `.gemini/instructions/features/notifications/_index.md` |
| 테스트 | `.gemini/instructions/features/testing/_index.md` |
| 트러블슈팅 | `.gemini/instructions/features/troubleshooting/_index.md` |
