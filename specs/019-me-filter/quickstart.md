# Quickstart: 배포·실측 검증

**Spec**: [spec.md](spec.md) | **Contracts**: [contracts/ui-surfaces.md](contracts/ui-surfaces.md)

화면 동작이 바뀌므로 게이트 통과만으로는 완료가 아니다 (constitution I). 핵심은 **두 계정 교차 확인**(SC-002)이다.

## 전제

- 로컬 Mattermost(`http://localhost:8065`). 활성 팀은 `mmctl --local team list`로 확인한다 (2026-10-12 기준 seegene·demosample).
- 검증은 배포된 플러그인 기준: `webapp`에서 webpack 빌드 → `make deploy-from-watch`.
- 임시 QA 계정 2개를 소켓으로 만든다(mmctl: `/home/sdh/okrbest/okrbest/server/bin/mmctl`). 끝나면 비활성화.
- 브라우저 확인은 playwright MCP 우선.

## 게이트 (webapp만)

```bash
cd webapp
npm run check
npm run test         # 실패 스위트 목록을 baseline과 diff
npm run check-types
```

## 실측 시나리오

### 준비

QA 계정 A·B를 보드 멤버로 추가하고, 담당자(person) 속성이 있는 보드에 카드 3장을 만든다 — 담당자 A, 담당자 B, 담당자 없음.

### 1. "본인" 선택 (US1, SC-001)

1. A로 로그인 → 필터 → 담당자 속성 → 값 목록 **맨 위에 "본인"** (U-01).
2. "본인" 체크 → 담당자 A 카드만 남는다 (클릭 2번 — SC-001).
3. 체크 해제 → 전체 복귀. 검색창에 "본인" 입력 → 항목이 남는다 (U-04).
4. "본인" + B를 함께 체크 → A·B 카드 둘 다 보인다 (U-05).

### 2. 공유 뷰 교차 확인 (US2, SC-002)

1. A가 "본인"만 체크된 상태로 둔다 (뷰에 저장됨).
2. **B로 로그인** → 같은 보드·같은 뷰 → **담당자 B 카드만** 보인다 (F-06).
3. B의 필터 패널에는 "본인"이 체크로 표시된다 — A의 이름이 아니다 (U-03).
4. 다시 A로 → A 카드만. 뷰 설정은 바뀌지 않았다.

### 3. 속성 4종 (SC-003)

multiPerson(여러 명 중 내가 포함된 카드), createdBy(내가 만든 카드), updatedBy(내가 수정한 카드) 각각에 "본인" 필터를 걸어 판정을 확인한다.

### 4. 회귀 (SC-004)

- 실제 사용자만 선택한 필터, 제외(does not include) + "본인", select 속성 필터가 기존대로 동작.
- 담당자 없는 카드는 "본인" includes에서 제외.

## 완료 기준

게이트 3단계 출력(목록 diff) + 위 시나리오 결과(교차 확인 스크린샷 포함)를 제시한 뒤에만 완료를 선언한다.
