# Implementation Plan - BlockSuite 에디터 안정화 및 기본 기능 검증

이 계획은 BlockSuite 에디터의 안정화 및 기본 기능 검증을 위한 단계별 작업을 정의합니다.

## Phase 1: 환경 설정 및 의존성 확인
이 단계에서는 BlockSuite 관련 의존성이 올바르게 설치되어 있는지 확인하고, 테스트 환경을 점검합니다.

- [ ] Task: 패키지 의존성 및 빌드 설정 점검
    - [ ] Sub-task: `webapp/package.json`의 BlockSuite 관련 패키지 버전 호환성 확인
    - [ ] Sub-task: `npm install` 및 `npm run build` 실행하여 빌드 오류 유무 확인
- [ ] Task: 테스트 러너 설정 확인
    - [ ] Sub-task: 기존 Jest 설정에서 BlockSuite 모듈 매핑(moduleNameMapper)이 올바른지 확인
    - [ ] Sub-task: 간단한 더미 테스트 파일을 생성하여 테스트 실행 환경 동작 확인
- [ ] Task: Conductor - User Manual Verification 'Phase 1: 환경 설정 및 의존성 확인' (Protocol in workflow.md)

## Phase 2: 컴포넌트 렌더링 및 기본 테스트 작성
`EditorContainer`의 렌더링 안정성을 확보하기 위해 테스트를 작성하고 발견된 문제를 수정합니다.

- [ ] Task: EditorContainer 렌더링 테스트 작성 (TDD)
    - [ ] Sub-task: `webapp/src/components/blockSuite/EditorContainer.test.tsx` 파일 생성
    - [ ] Sub-task: 컴포넌트가 에러 없이 마운트되는지 확인하는 기본 테스트 케이스 작성
    - [ ] Sub-task: 테스트 실행 및 실패 확인 (Red)
- [ ] Task: 렌더링 이슈 해결 및 안정화
    - [ ] Sub-task: `EditorContainer.tsx`의 초기화 로직 점검 및 에러 수정
    - [ ] Sub-task: 테스트 통과 확인 (Green)
    - [ ] Sub-task: 불필요한 콘솔 로그 및 경고 제거 (Refactor)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: 컴포넌트 렌더링 및 기본 테스트 작성' (Protocol in workflow.md)

## Phase 3: 기본 편집 기능 검증
텍스트 입력과 같은 기본적인 에디터 사용 시나리오를 검증합니다.

- [ ] Task: 텍스트 입력 기능 테스트 작성
    - [ ] Sub-task: 에디터에 텍스트를 입력하고 모델에 반영되는지 확인하는 테스트 작성
    - [ ] Sub-task: 읽기 전용 모드 등 기본 상태에 따른 동작 테스트 추가
- [ ] Task: 기능 구현 및 연동 확인
    - [ ] Sub-task: 테스트 실패 시 관련 로직 수정
    - [ ] Sub-task: Redux Store 또는 Yjs 바인딩이 정상적으로 동작하는지 디버깅
- [ ] Task: 코드 스타일 점검 및 정리
    - [ ] Sub-task: `npm run check` 및 `npm run check-types` 실행 및 수정
- [ ] Task: Conductor - User Manual Verification 'Phase 3: 기본 편집 기능 검증' (Protocol in workflow.md)
