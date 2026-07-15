---
name: ACL UI 단순화 재계획
overview: 고급 사용자 모드와 사용자 예외 ACL을 제거하고, 신규 ACL 입력 행을 단순화된 3타입(부서+직위/부서/직위) 기반으로 정렬 안정화합니다. 기존 사용자 예외 ACL 데이터는 ACL 저장 시 자동 제거합니다.
todos:
  - id: remove-advanced-mode-ui
    content: shareBoard.tsx에서 고급 사용자 모드 토글과 관련 상태/분기를 제거한다.
    status: pending
  - id: remove-user-acl-flow
    content: user subjectType 생성/편집/표시 경로를 제거하고 저장 시 user ACL을 필터링한다.
    status: pending
  - id: stabilize-layout-after-simplify
    content: shareBoard.scss를 정리해 생성행 4컬럼 정렬을 유지하고 잔여 스타일을 제거한다.
    status: pending
  - id: verify-regression
    content: 변경 파일 lint 및 ACL 화면 동작(추가/저장/취소) 관점 회귀를 점검한다.
    status: pending
isProject: false
---
