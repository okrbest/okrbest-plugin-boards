# Implementation Plan: 사용자 속성 필터에 "본인" 조건을 더한다

**Branch**: `019-me-filter` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-me-filter/spec.md`

## Summary

필터 값에 예약 토큰 `'me'`를 저장하고, 카드 목록을 그리기 직전에 로그인 사용자 ID로 치환한다. 필터 패널의 사용자 목록 맨 위에 "본인" 항목을 더한다. 평가 로직(`isClauseMet`)은 건드리지 않아 기존 조건 의미(포함/제외, 배열 값)가 그대로 적용된다. 서버 변경 없음, webapp만 수정한다.

## Technical Context

**Language/Version**: TypeScript 5.7 + React 19 (webapp만)

**Primary Dependencies**: 기존 의존성만 — Redux selector(`store/cards.ts`), 기존 i18n 키 `PersonProperty.me`(ko "본인" / en "Me") 재사용

**Storage**: 뷰의 필터 값 배열(`FilterClause.values`)에 문자열 `'me'` — 기존 저장 경로(블록 patch) 그대로, 스키마 변경 없음

**Testing**: Jest + React Testing Library, colocated

**Target Platform**: Mattermost 플러그인 모드 + standalone 공통 (필터는 양쪽 동일 코드)

**Project Type**: Mattermost 플러그인 webapp

**Performance Goals**: 치환은 필터 그룹 1회 순회 — 카드 수와 무관, 체감 비용 0

**Constraints**:
- 'me'는 Mattermost user ID(26자 영숫자)와 충돌하지 않는 예약 값
- `isClauseMet`·`applyFilterGroup` 시그니처 불변 — 치환은 호출부 앞단에서
- 비로그인(공개 공유) 화면에서는 치환 대상이 없어 'me'가 어떤 카드와도 일치하지 않는다 (spec Assumptions)

**Scale/Scope**: 소스 3개 수정(`cardFilter.ts`, `store/cards.ts`, `filterValuePanel.tsx`) + 테스트 2~3개 파일. i18n 신규 키 0~1개(기존 키 재사용이 기본)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 품질 게이트 | 통과 계획 | webapp 3단계 분리 실행, baseline(018에서 측정, 동일 기준 재사용 가능 여부는 재측정로 확인) 목록 diff. 화면 동작 변경 → quickstart 실측 필수 |
| II. 레이어·기존 패턴 | 통과 | 신규 컴포넌트·SCSS 파일 없음 — 기존 `PersonFilterPanel` 목록에 항목 1개 추가. 평가 로직은 기존 정적 클래스(`CardFilter`)에 함수 추가 |
| III. 타입·오류 엄격성 | 통과 계획 | `as any` 불필요. 토큰은 문자열 상수로 export |
| IV. 테스트 동반 | 통과 계획 | TDD — resolveMe 단위 테스트·패널 계약 테스트를 먼저 쓰고 실패 확인 |
| V. i18n 동기화 | 통과 | 기존 키 `PersonProperty.me` 재사용(ko·en 이미 존재). 신규 키 생기면 손으로 동시 추가 |
| VI. Upstream 충실성 | 통과 | 라이선스 헤더 유지, 구조 변경 없음 |
| VII. DB 마이그레이션 | 해당 없음 | 서버·DB 변경 없음 |
| VIII. 브랜치·PR | 통과 | `019-me-filter` 브랜치(브레인스토밍 전 생성), rebase merge PR |
| IX. Spec 파이프라인 | 통과 | specify → plan(본 문서) → tasks → implement |

위반 없음 → Complexity Tracking 생략.

## Project Structure

### Documentation (this feature)

```text
specs/019-me-filter/
├── plan.md              # 본 문서
├── research.md          # Phase 0 — 토큰·치환 지점·평가 호환성 조사
├── data-model.md        # Phase 1 — 'me' 토큰 스키마·풀이 규칙
├── quickstart.md        # Phase 1 — 배포·실측 절차 (두 계정 교차 확인)
├── contracts/
│   └── ui-surfaces.md   # 화면·흐름 계약 (테스트 1:1)
└── tasks.md             # /speckit-tasks 산출
```

### Source Code (repository root)

```text
webapp/src/
├── cardFilter.ts                                    # [수정] ME_FILTER_VALUE 상수 + resolveMe(filterGroup, meId)
├── cardFilter.test.ts                               # [수정] resolveMe 단위 테스트
├── store/cards.ts                                   # [수정] 필터 적용 selector에 getMe 주입, 적용 전 resolveMe
└── components/viewHeader/filterPanel/
    ├── filterValuePanel.tsx                         # [수정] PersonFilterPanel 목록 맨 위 "본인" 항목
    └── filterValuePanel.test.tsx                    # [수정] 본인 항목 렌더·토글·검색 계약 테스트
```

**Structure Decision**: webapp만 수정. 필터 적용 지점이 `store/cards.ts`의 selector 한 곳임을 코드로 확인했다 (research R2).

## 설계 결정 요약

1. **토큰**: `cardFilter.ts`에 `export const ME_FILTER_VALUE = 'me'`. MM user ID는 26자 영숫자라 충돌 불가 (R1).
2. **치환 위치**: `CardFilter.resolveMe(filterGroup, meId)` — 중첩 그룹을 재귀 순회해 values의 'me'를 meId로 바꾼 **사본**을 돌려준다. `isClauseMet` 불변 → includes/notIncludes/배열 값(multiPerson) 처리와 기존 테스트가 그대로 유효 (R2·R3).
3. **주입**: `store/cards.ts`의 `applyViewCardFilterSearchAndSort` 경로에서 `getMe`의 id로 치환 후 `applyFilterGroup` 호출. me가 없으면(비로그인) 치환 생략 — 'me'는 아무 카드와도 일치하지 않음 (spec 허용).
4. **UI**: `PersonFilterPanel` 목록 맨 위에 고정 항목 "본인"(`ME_FILTER_VALUE`, 기존 체크박스 토글 재사용). 검색 시 "본인"·"me" 라벨 매칭. 라벨은 기존 키 `PersonProperty.me` (R4).
5. **범위 제외**: 카드 속성 편집기의 `PersonSelector showMe`(실제 ID 저장)는 불변. 레거시 `multipersonFilterValue.tsx`(import 0건)는 건드리지 않는다 (R5).

## 위험·주의

- **빈 이름 렌더**: 'me'가 저장된 뷰의 다른 표시 지점(필터 속성 리스트)은 **개수 뱃지만** 그려 이름 조회가 없음을 확인했다 — 추가 처리 불필요 (R4). 구현 중 다른 표시 지점이 발견되면 라벨 처리 추가.
- **구버전 화면**: 'me'를 모르는 화면에서는 includes가 실제 ID와 비교 실패 → 카드가 안 보일 뿐 깨지지 않는다.
- **webapp baseline**: 깨끗한 상태에서도 다수 실패 — 판정은 018과 같은 방식(목록 diff). cardFilter.test는 baseline에서 통과 스위트임을 확인했다.

## Phase 0 · 1 산출물

- [research.md](research.md) — R1~R5
- [data-model.md](data-model.md) — 토큰 스키마·풀이 규칙
- [contracts/ui-surfaces.md](contracts/ui-surfaces.md) — F-01~F-05, U-01~U-05
- [quickstart.md](quickstart.md) — 두 계정 교차 실측 절차
