# Implementation Plan: 조직 속성 값에 색을 입힌다

**Branch**: `007-org-property-colors` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-org-property-colors/spec.md`

## Summary

조직 값의 색을 두 층으로 만든다. **아래층은 계산**이다 — 조직 단위 ID를 해시해 팔레트
색 하나를 고른다. 저장하지 않으므로 어느 보드에서나, 누가 보든, 처음 여는 순간부터
값이 구분된다. **위층은 저장**이다 — 사용자가 고른 색을 보드에 남기고 아래층을 덮는다.

두 층으로 나눈 이유는 사용 빈도다. 조직 단위가 수십 개인 보드에서 색을 하나씩 고르는
사람은 거의 없다. 그래서 아무것도 안 해도 되는 쪽이 기본이어야 하고, 지정은 예외로
얹힌다.

**서버는 건드리지 않는다.** 저장은 `board.properties`의 새 키 하나이며, 접근 규칙이
이미 같은 자리를 쓴다.

가장 조심할 곳은 **저장 위치**다. 색을 속성의 `options` 배열에 넣으면 조직 속성이
접근 규칙 후보로 올라와 006 FR-011이 무너진다([research.md](./research.md) R1).

## Technical Context

**Language/Version**: TypeScript 5.7 + React 19 (webapp 전용)

**Primary Dependencies**: Redux Toolkit, react-select (`ValueSelector` 경유)

**Storage**: 새 스키마 없음. 지정한 색은 기존 `board.properties` JSON에 키 하나로
들어간다. 자동 색은 **저장하지 않는다** — 계산이다

**Testing**: Jest + React Testing Library, 대상 옆 colocated `*.test.tsx`

**Target Platform**: Mattermost 플러그인 (min_server_version 10.7.0)

**Project Type**: 단일 저장소 플러그인 — 이번 변경은 `webapp/`만 닿는다

**Performance Goals**: 서버 왕복 추가 0회. 자동 색은 순수 계산이고 지정 색은 이미
받아 둔 보드 객체 안에 있다

**Constraints**: 색은 조직 마스터에 저장되지 않는다. 마스터는 메인 서버 소유이며 이
기능은 읽기 전용 관계를 유지한다

**팔레트**: `Constants.menuColors` 10종. 자동 배정은 `propColorDefault`를 뺀 9종에서
고른다 — 회색이 섞이면 "색 없는 값"과 구별되지 않는다

**Scale/Scope**: 새 엔드포인트 0개, 새 팔레트 0개, 접점 6곳. 검증 기준 조직은 본부
7개·부서 13개·직책 9개

## Constitution Check

*GATE: Phase 0 전에 통과해야 하고, Phase 1 설계 후 재확인한다.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 패키지별 품질 게이트** | 통과 | `webapp/`만 닿으므로 `make webapp-ci`가 게이트다. 판정은 실패 스위트 목록 diff. 화면 동작이 바뀌므로 배포 후 [quickstart.md](./quickstart.md)를 실제 계정으로 훑는다 |
| **II. 레이어 경계·기존 패턴** | 통과 | 서버 무변경. **새 SCSS 파일 0개, 새 위젯 0개, 색상 하드코딩 0곳** — 색은 기존 `Label` 위젯과 기존 팔레트를 쓰고, 색 고르는 메뉴는 선택 속성이 쓰는 `Menu.Color`를 그대로 쓴다. 보드 저장은 접근 규칙과 같은 `mutator.updateBoard` 경로 |
| **III. 타입·오류 처리** | 통과 | `as any`·`@ts-ignore` 없이 진행한다. 저장된 색은 자유 형식 JSON에서 오므로 읽을 때 팔레트에 있는 키인지 확인하고, 아니면 자동 색으로 떨어뜨린다 |
| **IV. 동작 변경 시 테스트 동반** | 통과 | 색 결정 규칙(자동·지정·경고 우선순위)은 순수 함수라 단위 테스트가 쉽다. 메뉴·필터·그룹은 컴포넌트 테스트 |
| **V. i18n 동기화** | 통과 | 새 문자열이 거의 없다. 색 이름은 기존 `Constants.menuColors`를 쓰고, 색 지정 해제 항목 하나만 `en.json`·`ko.json`에 같은 변경으로 넣는다 |
| **VI. Upstream·라이선스** | 통과 | 라이선스 헤더 유지. 새 파일은 006이 만든 `properties/orgLabels.ts` 옆에 붙는다 |
| **VII. DB 마이그레이션** | 해당 없음 | 스키마 변경이 없다. `board.properties`는 기존 자유 형식 JSON이다 |
| **VIII. 브랜치·커밋·PR** | 통과 | `007-org-property-colors` 브랜치를 작업 전에 만들었다. Conventional Commits, PR 경유 rebase 머지 |
| **IX. Spec 주도 워크플로** | 통과 | specify → plan 순서를 거쳤다. 산출물은 `specs/007-org-property-colors/`에 커밋한다 |

**위반 없음.** Complexity Tracking 기록 불필요.

**Phase 1 설계 후 재확인 (2026-08-14)**: 판정 그대로다. 설계가 새로 만든 것은
`orgLabels.ts`에 붙는 순수 함수 두 개와 뮤테이터 메서드 하나뿐이고, 셋 다 기존 패턴을
따른다. `ValueSelector`의 `fixedOptions`를 쪼개는 것이 유일한 구조 변경인데, 이미
`onStartRename` 유무로 항목을 조건부 렌더하는 방식이 있어 그 결을 따른다.

## Project Structure

### Documentation (this feature)

```text
specs/007-org-property-colors/
├── plan.md                        # 이 파일
├── spec.md                        # 요구사항 정본
├── research.md                    # Phase 0 — 결정과 근거
├── data-model.md                  # Phase 1 — 저장 형식과 색 결정 규칙
├── quickstart.md                  # Phase 1 — 종단 검증 절차
├── contracts/
│   └── org-colors.md              # 색이 주변 코드와 맺는 계약
├── checklists/
│   └── requirements.md            # 명세 품질 검증
└── tasks.md                       # Phase 2 — /speckit-tasks 산출물
```

### Source Code (repository root)

```text
webapp/src/
├── properties/
│   ├── orgLabels.ts               # [수정] 자동 색 계산 + 색 결정 규칙 (006이 만든 파일)
│   └── orgUnitEditor.tsx          # [수정] 고정색 대신 결정된 색을 쓰고, 색 메뉴를 연결
├── widgets/
│   └── valueSelector.tsx          # [수정] fixedOptions를 "메뉴 없음"에서 "색만"으로 쪼갬
├── components/
│   ├── centerPanel.tsx            # [수정] 그룹 이름 옆에 색도 채움
│   └── viewHeader/filterPanel/
│       └── filterValuePanel.tsx   # [수정] 조직 필터 항목을 Label로 그림
├── mutator.ts                     # [수정] 조직 색 저장 메서드 추가
└── blocks/board.ts                # [수정] 저장 형태 타입

webapp/i18n/
├── en.json                        # [수정] 색 지정 해제 문구
└── ko.json                        # [수정] 색 지정 해제 문구
```

**Structure Decision**: 새 디렉터리를 만들지 않는다. 색 계산은 006이 "조직 값 이름을
푸는 단 한 곳"으로 만든 `properties/orgLabels.ts`에 얹는다 — 이름과 색은 같은 질문의
두 면이고, 소비자도 같은 세 곳이다.

**손대지 않는 곳**

- `boardUtils.ts` — 그룹 옵션을 만드는 공용 경로다. 조직 전용 색을 여기 넣으면 다른
  속성 유형까지 훑게 된다. 조직 그룹의 이름을 이미 `centerPanel`이 덮어쓰므로 색도
  같은 자리에서 채운다([research.md](./research.md) R5).
- `properties/select/`·`multiselect/` — 선택 속성의 색 동작은 그대로다.
- `personSelector.tsx` — 담당자·다중 사용자는 범위 밖이다.
- `components/shareBoard/` — 접근 규칙은 건드리지 않는다. **건드리지 않는 것이
  FR-011을 지키는 방법이다.**

## 단계 나누기

명세의 사용자 이야기 우선순위를 따른다.

| 단계 | 내용 | 근거 |
|---|---|---|
| **1. 자동 색 (P1)** | `orgLabels`에 해시 색 + 우선순위 규칙, 에디터가 그 색을 씀 | spec US1. 여기까지면 아무 설정 없이 값이 구분된다 — 이 기능 가치의 대부분 |
| **2. 색 고르기 (P2)** | `ValueSelector` 메뉴 쪼개기, 뮤테이터, 저장·읽기 | spec US2. 1단계 위에 얹힌다 |
| **3. 필터·그룹 (P3)** | 필터 항목 Label화, 그룹 헤더 색 | spec US3. 앞 단계와 독립으로 검증된다 |

1단계만으로 배포해도 값이 생긴다. 2단계 없이 1단계만 쓰는 것도 완결된 상태다.

## Complexity Tracking

> Constitution Check에 위반이 없어 기록할 항목이 없다.
