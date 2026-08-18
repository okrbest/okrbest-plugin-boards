# Quickstart: 속성 편집을 관리자에게만 열지 보드가 정한다

**Spec**: [spec.md](./spec.md) | **Contracts**: [board-patch-gate](./contracts/board-patch-gate.md), [ui-surfaces](./contracts/ui-surfaces.md)

헌법 원칙 I은 화면 동작이 바뀌는 변경에 대해 게이트만으로 부족하다고 못 박는다. 빌드·배포
뒤 실제 계정으로 아래를 훑고 그 결과를 완료 근거로 제시한다.

## 사전 준비

```bash
# 리눅스 전용 빌드 + 배포 (전체 약 70초)
MM_DEBUG=1 make dist-linux
./build/bin/pluginctl deploy focalboard dist/boards-<버전>.tar.gz
```

배포 뒤 브라우저 **하드 리프레시**가 필요하다. 번들 경로에 콘텐츠 해시가 박혀 있다.

필요한 계정 둘.

| 역할 | 조건 |
|---|---|
| 보드 관리자 | 대상 보드의 admin |
| 에디터 | 같은 보드의 editor. 보드 관리자가 아니어야 한다 |

## 시나리오 1 — 잠그지 않은 보드는 달라지지 않는다 (US2)

**가장 먼저 확인한다.** 회귀가 나면 안 되는 자리다.

1. 잠금을 켠 적 없는 보드를 **에디터**로 연다
2. 표 헤더 메뉴에서 속성을 하나 추가한다 → 성공
3. 그 속성의 이름과 유형을 바꾼다 → 성공
4. select 속성의 값 입력을 열어 옵션을 새로 만든다 → 성공
5. 칸반 뷰에서 열을 추가하고 이름을 바꾼다 → 성공
6. 추가한 속성을 지운다 → 성공

하나라도 막히면 이 기능이 기본값을 잘못 읽고 있는 것이다(FR-002·FR-003).

## 시나리오 2 — 관리자가 잠근다 (US1·US4)

1. **보드 관리자**로 같은 보드의 공유 위젯을 연다
2. "속성 편집은 관리자만" 토글이 보인다 → U-09
3. 토글을 켠다
4. 같은 위젯을 **에디터**로 열면 그 섹션이 아예 없다 → U-09, FR-014

## 시나리오 3 — 잠긴 보드에서 에디터가 보는 화면 (US3)

에디터로 잠긴 보드를 연다. 하드 리프레시를 먼저 한다.

| 확인 | 기대 |
|---|---|
| 표 헤더 메뉴 | 속성 추가·삭제 항목이 없다 (U-01) |
| 카드 상세 속성 영역 | 속성 추가 진입점이 없다 (U-02) |
| 카드 상세의 속성별 메뉴 | 이름·유형 변경과 삭제가 없다 (U-03) |
| select 값 입력 | 값 목록은 보이고, 옵션 만들기·이름·색·삭제가 없다 (U-04·U-08) |
| multiselect 값 입력 | 같다 (U-05·U-08) |
| 칸반 | 열 추가가 없고, 열 머리에 이름·색·삭제가 없다 (U-06·U-07) |
| **카드에 값 고르기** | **된다** (U-08, FR-013) |

## 시나리오 4 — 화면을 거치지 않아도 막힌다 (FR-010)

에디터로 로그인한 브라우저에서 요청을 직접 보낸다. 두 경로 모두 확인한다 — 속성 삭제는
두 번째 경로로 간다.

```js
// 브라우저 콘솔. 잠긴 보드에서 에디터로.
const h = {'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json'}

// P1 — 속성 추가
await fetch(`/plugins/focalboard/api/v2/boards/${boardId}`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({updatedCardProperties: [{id: 'p-new', name: '검증용', type: 'text', options: []}]}),
}).then(r => r.status)   // 기대: 403  (C-03)

// P2 — 속성 삭제
await fetch('/plugins/focalboard/api/v2/boards-and-blocks', {
  method: 'PATCH', headers: h,
  body: JSON.stringify({boardIDs: [boardId], boardPatches: [{deletedCardProperties: ['<기존 속성 id>']}], blockIDs: [], blockPatches: []}),
}).then(r => r.status)   // 기대: 403  (C-04)

// 토글을 직접 끄려는 시도
await fetch(`/plugins/focalboard/api/v2/boards/${boardId}`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({updatedProperties: {adminOnlyCardProperties: false}}),
}).then(r => r.status)   // 기대: 403  (C-08)
```

셋 다 403이어야 한다. 하나라도 200이면 그 경로가 뚫려 있는 것이다.

## 시나리오 5 — 관리자는 잠금과 무관하다 (SC-006)

보드 관리자로 잠긴 보드에서 속성 추가·이름 변경·유형 변경·삭제·옵션 편집을 각각 한 번씩
한다. 전부 성공해야 한다.

## 시나리오 6 — 잠금을 되돌린다

보드 관리자로 토글을 끈다. 에디터로 하드 리프레시한 뒤 시나리오 1을 다시 훑는다. 전부
성공해야 한다 — 잠금은 켜고 끌 수 있고 과거를 되돌리지 않는다.

## 품질 게이트

화면 확인과 별개로, 변경이 닿은 패키지의 게이트를 통과한 출력을 함께 제시한다.

```bash
make server-lint
make server-test          # CI 미집행 — 로컬 필수
cd webapp && npm run test && npm run check-types
```

회귀 판정은 실패 개수가 아니라 **실패 목록 diff**로 한다(헌법 원칙 I). 깨끗한 상태에서도
실패가 있으므로, 변경 전 목록을 따로 재서 대조한다.
