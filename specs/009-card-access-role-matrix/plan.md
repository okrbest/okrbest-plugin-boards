# Implementation Plan: 카드 접근 권한을 역할 매트릭스로 정한다

**Branch**: `009-card-access-role-matrix` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: [specs/009-card-access-role-matrix/spec.md](./spec.md)

## Summary

규칙의 조직 축을 절대값에서 관계로 넓히고, 직책을 이름 붙인 묶음으로 묶고, 그 둘 위에
요구사항 이미지와 같은 표를 얹는다.

기술적으로는 **평가기의 게이트를 `(속성, 값)` 키에서 규칙 단위로 옮기는 일**이 전부다.
관계 조건은 카드마다 답이 달라 미리 계산해 둘 수 없고, 지금 구조는 여러 규칙을 한 키에
병합해 어느 규칙에서 왔는지 잃어버린다. 규칙 루프로 바꾸면 관계도 다중 값도 묶음도 같은
루프 안에서 판정된다.

저장 형식은 갈아엎지 않는다. 새 필드를 더하고 읽는 쪽이 새 필드를 먼저 보게 한다. 기존
보드는 새 필드가 비어 있어 지금과 똑같이 읽힌다.

## Technical Context

**Language/Version**: Go 1.24.6 (server) · TypeScript 5.7 + React 19 (webapp)

**Primary Dependencies**: Gorilla Mux, Squirrel, Redux Toolkit, react-intl

**Storage**: `board.properties` JSON. **새 테이블도 마이그레이션도 없다** — 007·008이 같은
자리를 쓴다

**Testing**: `go test -race ./...` (colocated `_test.go`) · Jest + React Testing Library
(colocated `*.test.tsx`)

**Target Platform**: Mattermost 플러그인 (`focalboard`). 검증은 배포된 플러그인 기준

**Project Type**: 웹 애플리케이션 — Go 서버 + React webapp

**Performance Goals**: 카드 판정이 `O(규칙 수 × 카드 속성 수)`. 규칙 20줄 안쪽을 상정한다.
가장 무거운 자리는 웹소켓 팬아웃 (`수신자 × 카드 × 규칙`)

**Constraints**: 기존 규칙을 쓰는 보드의 판정 결과가 바뀌면 안 된다 (SC-005). 조직·직책
마스터는 메인 서버 소유라 읽기만 한다

**Scale/Scope**: 서버 파일 3개(`model/property_access.go`, `app/property_access.go`,
검증), webapp 파일 5개 안팎(규칙 행·섹션·매트릭스·타입·i18n)

## Constitution Check

*GATE: Phase 0 전에 통과해야 한다. Phase 1 설계 뒤 다시 본다.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 패키지별 품질 게이트 | 통과 예정 | webapp·server 둘 다 닿는다. 세 게이트를 따로 돌려 기준선 목록과 대조한다. **`server-test`는 CI 미집행이라 로컬 출력이 근거다.** 화면이 바뀌므로 [quickstart.md](./quickstart.md) 종단 검증이 필수다 |
| II. 레이어 경계·기존 패턴 | 통과 | `API → App → Store` 그대로. 판정은 `app/`에 남는다. UI는 `MenuWrapper`+`Menu.Text`와 `PropertyAccessRow__broken`을 그대로 쓰고 **새 SCSS 파일을 만들지 않는다** |
| III. 타입·오류 엄격성 | 통과 | `as any` 없음. 관계 값은 문자열 유니온으로 좁힌다. 저장 검증은 `model.NewErrBadRequest`를 쓴다 |
| IV. 동작 변경 시 테스트 동반 | 통과 | [contracts/card-access-matrix.md](./contracts/card-access-matrix.md)의 표가 그대로 테스트 목록이다. 판정이 바뀌므로 **구현을 되돌려 빨강을 확인한 뒤** 완료로 표시한다 |
| V. i18n 동기화 | 통과 | 관계 이름·묶음 화면·매트릭스 문자열을 `en.json`·`ko.json`에 같이 넣는다 |
| VI. Upstream 충실성 | 통과 | 라이선스 헤더 유지. `plugin.json` 안 건드림. 업스트림에 없는 파일만 늘어난다 |
| VII. DB 마이그레이션 규율 | 해당 없음 | 마이그레이션이 없다 |
| VIII. 브랜치·커밋·PR | 통과 | `009-card-access-role-matrix`를 설계 전에 만들었다. Conventional Commits, PR 경유 |

**게이트 통과.** 정당화가 필요한 위반이 없어 Complexity Tracking 절을 비운다.

### Phase 1 설계 뒤 재확인

| 원칙 | 재판정 | 새로 드러난 것 |
|---|---|---|
| II | 통과 | 매트릭스 표는 새 시각 요소다. 다만 **사용자가 요구사항 이미지로 명시적으로 요청**했고 브레인스토밍에서 골랐다. 원칙 II의 "명시적 요청" 예외에 해당한다. 컨트롤은 기존 드롭다운을 쓴다 |
| IV | 통과 | 계약이 테스트 34개로 펼쳐진다. 1절 6개, 2절 10개, 3절 4개, 4절 6개, 5절 7개 |
| I | 주의 | 웹소켓 팬아웃 판정이 무거워진다. `make server-test` 실행 시간을 기준선과 함께 적는다 |

## Project Structure

### Documentation (this feature)

```text
specs/009-card-access-role-matrix/
├── plan.md                          # 이 파일
├── spec.md                          # 명세
├── research.md                      # Phase 0 — 결정 9개
├── data-model.md                    # Phase 1 — 저장 형태
├── quickstart.md                    # Phase 1 — 종단 검증 9절
├── contracts/
│   └── card-access-matrix.md        # Phase 1 — 판정 계약
├── checklists/
│   └── requirements.md              # 명세 품질
└── tasks.md                         # /speckit-tasks 산출물 (아직 없음)
```

### Source Code (repository root)

```text
server/
├── model/
│   └── property_access.go           # 관계·묶음 필드 추가, 우선순위 헬퍼
└── app/
    ├── property_access.go           # 게이트를 규칙 루프로. 관계 판정. 저장 검증
    ├── org_master.go                # orgUnitAncestors 재사용 (변경 없음)
    ├── blocks.go / cards.go         # 호출부 (변경 없음 — 평가기 안에서 끝난다)
    └── property_access_test.go      # 계약 1~4절

webapp/src/
├── blocks/
│   └── board.ts                     # PropertyAccessRule 타입 확장, tiers
├── components/shareBoard/
│   ├── propertyAccessSection.tsx    # 표/규칙 두 보기 전환, 프리셋
│   ├── propertyAccessRow.tsx        # 관계 선택, 묶음 선택
│   ├── accessMatrix.tsx             # 신규 — 매트릭스 표
│   ├── dutyTierEditor.tsx           # 신규 — 묶음 편집
│   └── propertyAccessSection.scss   # 기존 파일에 블록 추가 (새 파일 금지)
└── i18n/en.json · ko.json           # 문자열
```

**Structure Decision.** 판정은 `server/app/property_access.go` 한 파일 안에서 끝난다.
호출부 여섯 곳(`blocks.go` 4, `cards.go` 2)은 `evaluator.For(card)`만 부르므로 손대지
않는다. 평가기의 내부를 바꾸면서 바깥 모양을 유지하는 것이 이 계획의 형태다.

webapp은 `shareBoard/` 안에 머문다. 표와 묶음 편집기는 파일을 나눈다 —
`propertyAccessSection.tsx`가 208줄인데 표까지 넣으면 한 파일이 하는 일이 셋이 된다.

## 구현 순서

명세의 사용자 이야기 순서를 그대로 따른다. 각 단계가 독립으로 검증된다.

| 단계 | 내용 | 검증 |
|---|---|---|
| 0 | 기준선 측정 (`git stash` 후 세 게이트 + `server-test`) | 목록 저장 |
| 1 | 서버 — 게이트를 규칙 루프로. **동작 변화 없이** | 기존 테스트 전부 통과 |
| 2 | 서버 — 관계 판정 + 필드 우선순위 + 저장 검증 | 계약 1~4절 |
| 3 | webapp — 규칙 행에 관계·묶음 선택 (US1·US2) | 규칙을 손으로 여섯 줄 써서 매트릭스 확인 |
| 4 | webapp — 매트릭스 표 + 프리셋 (US3) | 계약 5절 |
| 5 | webapp — 빠진 직책·깨진 규칙 표시 (US4) | 계약 5절 |
| 6 | 종단 검증 + 게이트 | [quickstart.md](./quickstart.md) |

**1단계를 따로 떼는 것이 이 순서의 핵심이다.** 게이트 구조를 바꾸는 일과 새 조건을 더하는
일을 한 커밋에 섞으면, 기존 보드 판정이 달라졌을 때 원인이 둘 중 어느 쪽인지 모른다.
1단계는 기존 테스트가 전부 통과해야 끝난다 — 새 테스트를 안 쓴다.

## 명세에 되돌려야 할 것 하나

**SC-004를 지금 설계로는 못 지킨다.** research R8에 자세히 적었다.

표준 여섯 줄은 자동으로 깔린다 — 유형 속성과 값을 OKR 사다리 설정에서 읽는다. 그런데
**직책 묶음은 자동으로 못 만든다.** 회사마다 직책 이름이 달라 어느 직책이 C-Level인지
이름으로 추정할 수 없고, 추정이 틀리면 권한이 조용히 잘못 깔린다.

묶음이 보드마다 저장되므로 보드를 새로 만들 때마다 배정을 반복해야 한다.

**제안** — SC-004를 "묶음이 정의된 보드에서 표준 권한을 켜는 조작이 스위치 1회"로 좁힌다.
묶음을 팀 단위로 옮기는 일(진짜 스위치 1회)은 저장 위치를 바꾸는 별도 작업이라 이번에
섞지 않는다.

**사용자 판단이 필요하다.** `/speckit-plan`은 명세를 고치지 않는다.

## Complexity Tracking

정당화가 필요한 헌법 위반이 없다.
