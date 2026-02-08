# Draft: React 19 Migration

## Requirements (confirmed)
- **현재 버전**: React 17.0.2, React-DOM 17.0.2
- **목표 버전**: React 19
- **마이그레이션 경로**: React 17 → 18 → 19 (점진적)
- **플러그인 환경**: Mattermost 플러그인 (react, react-dom externals)

## Technical Decisions (CONFIRMED)
- **DND 마이그레이션**: @dnd-kit으로 완전 통합 (react-beautiful-dnd 5개 + react-dnd 10개 → @dnd-kit)
- **react-router-dom**: 제외 (별도 작업으로 분리)
- **마이그레이션 전략**: 점진적 (React 17 → 18 → 19 호환 코드)
- **Mattermost 환경**: v11.0.0+ React 18.2.0 제공, externals로 호스트 버전 따름
- **Draft.js**: 별도 Phase로 분리 (이번 마이그레이션에서 제외)
- **테스트 전략**: 기존 테스트 활용, 각 Phase 완료 후 전체 테스트 실행

## Research Findings

### 코드베이스 탐색 결과 (COMPLETED)

**react-beautiful-dnd 사용 (5개 파일):**
| 파일 | 사용 패턴 |
|------|----------|
| `testUtils.tsx` | wrapRBDNDContext, wrapRBDNDDroppable 헬퍼 |
| `sidebar/sidebar.tsx` | DragDropContext, Droppable (카테고리 리스트) |
| `sidebar/sidebarBoardItem.tsx` | Draggable (보드 아이템) |
| `sidebar/sidebarCategory.tsx` | Draggable + Droppable (중첩 구조) |
| `cardDetail/cardDetailProperties.tsx` | DragDropContext, Droppable, Draggable (프로퍼티 재정렬) |

**클래스 컴포넌트 (2개 파일):**
| 파일 | 이슈 |
|------|------|
| `widgets/menu/menu.tsx` | PureComponent, createRef, static properties |
| `error_boundary.tsx` | Component, shouldComponentUpdate, getDerivedStateFromError |

**ReactDOM.render() 사용 (2개 파일):**
- `main.tsx` (line 43-50) - 독립 실행 모드
- `blocksEditor/devmain.tsx` (line 111) - 개발용

**JSX 설정:**
- `tsconfig.json`: `"jsx": "react"` → `"react-jsx"` 변경 필요

**DND 라이브러리 현황:**
- react-beautiful-dnd: 13.1.1 (❌ React 18+ 미지원)
- react-dnd: 14.0.2 (✓ 9개 파일 사용)
- @dnd-kit: 6.3.1 / 10.0.0 (✓ 최신)

### React 19 공식 가이드 (COMPLETED)

**Breaking Changes (React 19):**
- `ReactDOM.render` → `ReactDOM.createRoot` (제거됨)
- `propTypes`, `defaultProps` 함수 컴포넌트에서 제거
- String refs 제거
- Legacy Context 제거
- `react-test-renderer/shallow` 제거
- 새 JSX Transform 필수

**TypeScript 변경:**
- `useRef`는 인자 필수: `useRef()` → `useRef(undefined)`
- ref cleanup 함수: 암묵적 return 거부
- `ReactElement` props 기본값 `unknown`

**자동화 도구:**
```bash
npx codemod@latest react/19/migration-recipe
npx types-react-codemod@latest preset-19 ./webapp/src
```

**라이브러리 호환성:**
| 라이브러리 | React 19 지원 | 버전 |
|-----------|-------------|------|
| @hello-pangea/dnd | ✅ 완전 호환 | v18.0.1 |
| react-redux | ✅ 호환 | v9.2.0 |
| @testing-library/react | ⚠️ 일부 이슈 | v16.2.0 |
| BlockSuite | ❓ 미확인 | 테스트 필요 |

**권장 마이그레이션 순서:**
1. React 18.3 업그레이드 (React 19 경고 포함)
2. Codemods 실행
3. 의존성 업데이트
4. React 19 업그레이드

### Mattermost 플러그인 환경 (COMPLETED)

**React 버전 매트릭스:**
| Mattermost 버전 | React 버전 | 상태 |
|----------------|-----------|------|
| v10.7.x ~ v10.11.x | React 17.x | 현재 호환 |
| v11.0.0+ (2025년 11월) | React 18.2.0 | 마이그레이션 필요 |
| v11.4.0 (현재 최신) | React 18.2.0 | 타겟 |

**핵심 발견:**
- Mattermost v11.0.0부터 React 18.2.0으로 업그레이드됨 (PR #33858)
- 플러그인은 externals로 React를 받으므로 호스트 버전 따름
- react-redux 7.x → 9.x, redux 5.x 업데이트 필요

**결론:**
- 목표: React 18 호환 코드 작성 (Mattermost v11.x 지원)
- React 19는 Mattermost가 업그레이드할 때까지 대기
- 현재 계획은 "React 19 호환 준비" 수준으로 조정

## Open Questions
1. react-router-dom 6.x 마이그레이션도 이번 범위에 포함?
2. Mattermost가 제공하는 React 버전 확인 필요
3. @dnd-kit으로 통합할지, @hello-pangea/dnd로 빠르게 전환할지
4. 테스트 전략: TDD vs 테스트 후 작성

## Scope Boundaries
- INCLUDE: [TBD]
- EXCLUDE: [TBD]

## User's Original Request Summary
React 17.0.2에서 React 19로 마이그레이션하기 위한 상세 계획 요청.
단계별 작업, 우선순위, 의존성, 예상 작업량, 위험 요소, 테스트 전략 포함.
