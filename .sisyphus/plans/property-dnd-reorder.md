# Property Drag & Drop Reordering

## TL;DR

> **Quick Summary**: Property 순서 변경 방식을 메뉴 버튼(Move Up/Down)에서 Notion 스타일 드래그 앤 드롭으로 개선. 기존 `react-beautiful-dnd` 패턴과 `moveProperty` 로직을 재활용.
> 
> **Deliverables**:
> - Property row에 드래그 핸들 추가 (hover 시 표시)
> - 드래그로 property 순서 변경 가능
> - "Move Up/Down" 메뉴 항목 제거
> - 드래그 시 시각적 피드백
> 
> **Estimated Effort**: Short (~2-3시간)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 4

---

## Context

### Original Request
Property 위치 편집을 "Move Up/Move Down" 버튼 클릭에서 Notion 스타일 드래그 앤 드롭으로 변경

### Interview Summary
**Key Discussions**:
- 기존 `moveProperty` 함수가 이미 순서 변경 로직 처리 (Redux + mutator)
- `react-beautiful-dnd` ^13.1.1 이미 설치됨, sidebar에서 사용 중
- `GripIcon` 이미 존재 (`widgets/icons/grip.tsx`)
- readonly 모드에서는 드래그 비활성화 필요

**Research Findings**:
- Sidebar DnD 패턴 확인: `DragDropContext` > `Droppable` > `Draggable` 구조
- 테스트 유틸 `wrapRBDNDDroppable` 존재 (testUtils.tsx)
- `cardDetailProperties.scss` 파일 없음 - 새로 생성 필요

### Gap Analysis (Self-Review)
**Identified Gaps** (addressed):
- 드래그 중 index 기반 재정렬 필요 → `onDragEnd`에서 source/destination index 사용
- Property가 1개일 때 드래그 의미 없음 → 1개일 때도 핸들 표시하되 드래그 동작은 무의미 (자연스럽게 처리됨)
- 키보드 접근성 → `react-beautiful-dnd` 기본 제공 (Space 키로 드래그)

---

## Work Objectives

### Core Objective
Property 순서 변경 UX를 메뉴 기반에서 드래그 앤 드롭으로 개선하여 직관적인 인터랙션 제공

### Concrete Deliverables
1. `webapp/src/components/cardDetail/cardDetailProperties.tsx` - DnD 적용
2. `webapp/src/widgets/propertyMenu.tsx` - Move up/down 메뉴 제거
3. `webapp/src/components/cardDetail/cardDetailProperties.scss` - 드래그 스타일 (새 파일)
4. `webapp/src/components/cardDetail/cardDetailProperties.test.tsx` - 테스트 업데이트

### Definition of Done
- [ ] Property row를 드래그하여 순서 변경 가능
- [ ] 드래그 핸들이 hover 시에만 표시됨
- [ ] 드래그 중 시각적 피드백 (배경색 변경, 그림자)
- [ ] "Move property up/down" 메뉴 항목이 사라짐
- [ ] Readonly 모드에서 드래그 불가
- [ ] 기존 테스트 통과 (npm test)
- [ ] 빌드 성공 (npm run build)

### Must Have
- 기존 `moveProperty` 로직 재활용 (mutator.changePropertyTemplateOrder)
- Sidebar DnD 패턴과 일관된 구현
- Hover-to-show 드래그 핸들 (Notion 스타일)
- Readonly 모드 지원

### Must NOT Have (Guardrails)
- 새로운 외부 라이브러리 추가 금지 (기존 react-beautiful-dnd 사용)
- 다른 컴포넌트(sidebar, kanban 등) 수정 금지
- moveProperty 핵심 로직 변경 금지 (wrapper만 추가)
- 과도한 애니메이션 금지 (단순 배경색 + 그림자만)
- `@ts-ignore` 또는 `as any` 사용 금지

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES
- **User wants tests**: Tests-after (기존 테스트 업데이트)
- **Framework**: Jest + React Testing Library

### Automated Verification

**For Each Task:**
모든 검증은 터미널 명령어로 수행. 사용자 개입 없음.

```bash
# 타입 체크
cd webapp && npm run check-types

# 린트
cd webapp && npm run check

# 테스트
cd webapp && npm test -- --testPathPattern=cardDetailProperties

# 빌드
cd webapp && npm run build
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: cardDetailProperties.tsx - DnD 적용 [no dependencies]
└── Task 2: propertyMenu.tsx - Move up/down 제거 [no dependencies]

Wave 2 (After Wave 1):
├── Task 3: cardDetailProperties.scss - 스타일 추가 [depends: 1]
└── Task 4: cardDetailProperties.test.tsx - 테스트 업데이트 [depends: 1, 2]

Wave 3 (Final):
└── Task 5: 통합 검증 및 빌드 확인 [depends: 1, 2, 3, 4]

Critical Path: Task 1 → Task 3 → Task 5
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4, 5 | 2 |
| 2 | None | 4, 5 | 1 |
| 3 | 1 | 5 | 4 |
| 4 | 1, 2 | 5 | 3 |
| 5 | 1, 2, 3, 4 | None | None (final) |

---

## TODOs

### Wave 1

- [ ] 1. cardDetailProperties.tsx에 DnD 적용

  **What to do**:
  - Import 추가: `DragDropContext, Droppable, Draggable, DropResult` from 'react-beautiful-dnd'
  - Import 추가: `GripIcon` from '../../widgets/icons/grip'
  - Import 추가: SCSS 파일 `./cardDetailProperties.scss`
  - `board.cardProperties.map()` 영역을 `DragDropContext` > `Droppable` > `Draggable`로 래핑
  - `onDragEnd` 핸들러 구현 (기존 `moveProperty` 로직 활용)
  - 각 property row에 드래그 핸들 (GripIcon) 추가
  - `isDragDisabled` prop으로 readonly 모드 처리

  **Must NOT do**:
  - `moveProperty` 함수 자체 수정 금지 (새 `onDragEnd` 함수 추가)
  - `mutator.changePropertyTemplateOrder` 호출 방식 변경 금지
  - PropertyMenu에 전달하는 props 중 move 관련 외 수정 금지

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React 컴포넌트 + 드래그 인터랙션 구현
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 드래그 앤 드롭 UX 패턴 구현에 필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `webapp/src/components/sidebar/sidebar.tsx:447-482` - DragDropContext + Droppable 패턴
  - `webapp/src/components/sidebar/sidebarBoardItem.tsx:210-325` - Draggable 래핑 패턴
  - `webapp/src/components/sidebar/sidebarCategory.tsx:266-456` - 복합 Draggable + Droppable 패턴

  **Type/API References**:
  - `webapp/src/components/cardDetail/cardDetailProperties.tsx:287-334` - 기존 `moveProperty` 함수 (재활용할 로직)
  - `webapp/src/components/cardDetail/cardDetailProperties.tsx:338-395` - 현재 property 렌더링 구조
  - `webapp/src/blocks/board.ts:IPropertyTemplate` - property 타입 정의

  **Icon References**:
  - `webapp/src/widgets/icons/grip.tsx` - 드래그 핸들 아이콘 (GripIcon)

  **Test References**:
  - `webapp/src/testUtils.tsx:26-43` - `wrapRBDNDDroppable` 테스트 유틸 패턴

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 타입 체크 (에러 없어야 함)
  cd webapp && npm run check-types
  # Expected: 0 errors
  
  # 빌드 확인
  cd webapp && npm run build
  # Expected: Build successful
  ```

  **Manual Verification (개발자 확인용 - 테스트 코드로 대체):**
  - Property row hover 시 왼쪽에 GripIcon 표시됨
  - GripIcon 드래그하여 property 순서 변경 가능
  - readonly=true일 때 드래그 불가

  **Commit**: YES (groups with 2)
  - Message: `feat(cardDetail): add drag and drop for property reordering`
  - Files: `webapp/src/components/cardDetail/cardDetailProperties.tsx`
  - Pre-commit: `cd webapp && npm run check-types`

---

- [ ] 2. propertyMenu.tsx에서 Move up/down 메뉴 제거

  **What to do**:
  - Props 타입에서 제거: `onMoveUp`, `onMoveDown`, `canMoveUp`, `canMoveDown`
  - Menu.Text 컴포넌트 제거: id='move-up', id='move-down' (lines 259-278)
  - 관련 i18n 변수 제거: `moveUpText`, `moveDownText` (lines 126-133)

  **Must NOT do**:
  - 다른 메뉴 항목 수정 금지 (delete, required, type 등)
  - onBoardSelected 관련 로직 수정 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순 삭제 작업, 복잡한 로직 없음
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `webapp/src/widgets/propertyMenu.tsx:29-42` - Props 타입 정의
  - `webapp/src/widgets/propertyMenu.tsx:259-278` - 삭제할 Menu.Text 컴포넌트

  **Caller References** (호출부 수정 필요):
  - `webapp/src/components/cardDetail/cardDetailProperties.tsx:361-374` - PropertyMenu 호출부 (props 제거 필요)

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 타입 체크 - Props 인터페이스와 호출부 일치 확인
  cd webapp && npm run check-types
  # Expected: 0 errors
  
  # 린트 체크
  cd webapp && npm run check
  # Expected: No errors
  ```

  **Commit**: NO (groups with Task 1)

---

### Wave 2

- [ ] 3. cardDetailProperties.scss 스타일 파일 생성

  **What to do**:
  - 새 파일 생성: `webapp/src/components/cardDetail/cardDetailProperties.scss`
  - 드래그 핸들 스타일: 기본 숨김, hover 시 표시
  - 드래그 중 스타일: 배경색 변경, 그림자 추가
  - 기존 cardDetail.scss의 CSS 변수 활용

  **Must NOT do**:
  - 기존 cardDetail.scss 수정 금지
  - 새로운 CSS 변수 정의 금지 (기존 것 사용)
  - 과도한 애니메이션 금지

  **Recommended Agent Profile**:
  - **Category**: `artistry`
    - Reason: 스타일링 전문 작업
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Notion 스타일 드래그 핸들 UX

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `webapp/src/components/cardDetail/cardDetail.scss:89-126` - `.octo-propertyrow` 기존 스타일
  - `webapp/src/widgets/icons/grip.scss` - GripIcon 기존 스타일
  - `webapp/src/components/sidebar/sidebarCategory.scss:231-235` - `.draggingOver` 드래그 오버 스타일 패턴

  **CSS Variable References**:
  - `webapp/src/components/cardDetail/cardDetail.scss` - CSS 변수 사용 패턴 (--center-channel-color-rgb 등)

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # Stylelint 체크
  cd webapp && npm run check
  # Expected: No style errors
  
  # 빌드 확인 (SCSS 컴파일)
  cd webapp && npm run build
  # Expected: Build successful
  ```

  **Expected Styles:**
  ```scss
  .CardDetailProperties {
      .drag-handle {
          opacity: 0;
          cursor: grab;
      }
      
      .octo-propertyrow:hover .drag-handle {
          opacity: 1;
      }
      
      .octo-propertyrow--dragging {
          background: rgba(var(--center-channel-color-rgb), 0.08);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
      }
  }
  ```

  **Commit**: YES
  - Message: `style(cardDetail): add drag and drop styles for properties`
  - Files: `webapp/src/components/cardDetail/cardDetailProperties.scss`
  - Pre-commit: `cd webapp && npm run check`

---

- [ ] 4. cardDetailProperties.test.tsx 테스트 업데이트

  **What to do**:
  - `wrapRBDNDDroppable` 유틸 import 추가 (from testUtils)
  - 기존 `renderComponent` 함수에 DnD 래퍼 추가
  - Move up/down 메뉴 항목 테스트 제거 또는 업데이트
  - 드래그 핸들 존재 확인 테스트 추가 (선택사항)

  **Must NOT do**:
  - 다른 테스트 로직 변경 금지
  - 새로운 mock 추가 금지 (기존 mutator mock 활용)
  - 스냅샷 테스트 무조건 업데이트 금지 (변경 확인 후)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 테스트 패턴 따라 업데이트
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `webapp/src/testUtils.tsx:32-43` - `wrapRBDNDDroppable` 함수 구현
  - `webapp/src/components/sidebar/sidebarBoardItem.test.tsx:78-130` - DnD 래퍼 사용 테스트 패턴

  **File to Modify**:
  - `webapp/src/components/cardDetail/cardDetailProperties.test.tsx:115-130` - renderComponent 함수

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 테스트 실행
  cd webapp && npm test -- --testPathPattern=cardDetailProperties --watchAll=false
  # Expected: All tests pass
  
  # 스냅샷 업데이트 필요시
  cd webapp && npm test -- --testPathPattern=cardDetailProperties -u --watchAll=false
  ```

  **Commit**: YES
  - Message: `test(cardDetail): update tests for property drag and drop`
  - Files: `webapp/src/components/cardDetail/cardDetailProperties.test.tsx`
  - Pre-commit: `cd webapp && npm test -- --testPathPattern=cardDetailProperties --watchAll=false`

---

### Wave 3

- [ ] 5. 통합 검증 및 최종 빌드 확인

  **What to do**:
  - 전체 타입 체크 실행
  - 전체 린트 실행
  - 전체 테스트 실행
  - 프로덕션 빌드 확인

  **Must NOT do**:
  - 코드 추가 수정 금지 (검증만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 검증 명령어 실행만
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Build Commands**:
  - `webapp/package.json` - 빌드 스크립트 정의

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 1. 타입 체크
  cd webapp && npm run check-types
  # Expected: 0 errors
  
  # 2. 린트
  cd webapp && npm run check
  # Expected: No errors
  
  # 3. 테스트
  cd webapp && npm test -- --watchAll=false
  # Expected: All tests pass
  
  # 4. 빌드
  cd webapp && npm run build
  # Expected: Build successful
  ```

  **Commit**: YES
  - Message: `feat(cardDetail): property drag and drop reordering complete`
  - Files: All modified files
  - Pre-commit: `cd webapp && npm run check && npm test -- --watchAll=false`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1+2 (Wave 1) | `feat(cardDetail): add drag and drop for property reordering` | cardDetailProperties.tsx, propertyMenu.tsx | npm run check-types |
| 3 (Wave 2) | `style(cardDetail): add drag and drop styles for properties` | cardDetailProperties.scss | npm run check |
| 4 (Wave 2) | `test(cardDetail): update tests for property drag and drop` | cardDetailProperties.test.tsx | npm test |
| 5 (Final) | - (squash or no additional commit) | - | Full verification |

---

## Success Criteria

### Verification Commands
```bash
# Full verification suite
cd webapp && npm run check-types && npm run check && npm test -- --watchAll=false && npm run build
# Expected: All pass, build successful
```

### Final Checklist
- [ ] Property row 드래그로 순서 변경 가능
- [ ] 드래그 핸들 hover 시 표시
- [ ] "Move Up/Down" 메뉴 항목 제거됨
- [ ] Readonly 모드에서 드래그 불가
- [ ] 기존 기능 유지 (property 추가/삭제/타입변경 등)
- [ ] 모든 테스트 통과
- [ ] 빌드 성공
