# Phase 0 조사: 본부·부서 속성과 조직 기반 선택지 좁히기

**Feature**: `005-org-scoped-properties` | **Date**: 2026-08-08

명세의 요구사항을 이 저장소에 얹을 때 결정해야 했던 것들과, 코드를 읽어 확인한
사실을 정리한다.

---

## R1. 사용자 소속을 화면이 어떻게 아는가

**결정**: 보드 단위 엔드포인트를 새로 만들어 한 번에 받아 두고, 좁히기는 전부
클라이언트에서 계산한다.

**근거**: 사람 선택기(`webapp/src/components/personSelector.tsx`)는
`getBoardUsersList` 셀렉터를 **동기로** 읽고 `loadOptions`에서 걸러 낸다. 좁히기를
서버 왕복으로 만들면 이 컴포넌트를 비동기로 바꿔야 하는데, 카드 팝업·표 셀·보드
카드 세 곳에서 쓰이므로 배선이 넓게 흔들린다. 조직 마스터를 팀 단위로 미리 받아
두는 `webapp/src/store/orgMaster.ts` 패턴이 이미 있고, 같은 자리에 얹으면 새로
배울 구조가 없다.

**검토한 대안**:

- *서버가 좁힌 명단을 준다* — 규칙을 서버가 소유해 깔끔하지만, 값이 바뀔 때마다
  요청이 가고 선택기를 비동기화해야 한다. 이 좁히기는 보안 경계가 아니라 입력
  편의이므로(spec Assumptions) 서버에 두어 얻는 것이 없다.
- *`IUser`에 소속 필드를 얹는다* — 새 엔드포인트가 없어 가장 짧아 보이지만,
  사용자 정보가 보드 멤버 조회·검색 등 여러 경로로 들어오므로 경로마다 채워야
  하고 조직과 무관한 화면의 페이로드까지 커진다. 공용 모델을 건드리는 값이 이
  기능 하나로는 맞지 않는다.

**범위**: 팀 단위가 아니라 **보드 단위**로 한정한다. 사람 선택기의 원본이
`getBoardUsers`(보드 단위)이므로 정확히 들어맞고, 보드에서 볼 수 없는 사람의
소속을 내려보내지 않아 노출이 좁다.

---

## R2. 다중값·사람 판정이 레지스트리 밖에 흩어져 있다

**확인한 사실**: `'multiPerson'` 문자열 비교가 **12개 파일 20군데**에 있다.

| 영역 | 위치 |
|---|---|
| 그룹화 | `boardUtils.ts`(2), `kanban.tsx`(2), `table.tsx`(2), `centerPanel.tsx`(3), `kanbanColumnHeader.tsx`, `tableGroupHeaderRow.tsx` |
| 카드 상태 | `store/cards.ts` |
| 타입 변환 | `mutator.ts`(3) |
| CSV | `csvExporter.ts` — `personPropertyTypes` Set |
| 컬럼 폭 | `table.tsx` |
| 그 외 | `rhsBoardCards.tsx`, `confirmPerson.tsx`(2), `blocks/board.ts`(타입 유니온) |

**결정**: 새 속성 타입을 추가하기 **전에** 이 판정을 `PropertyType`으로 모은다.

- `isMultiValue` — 값이 배열인가 (`'multiSelect' || 'multiPerson'` 비교 10군데를 대체)
- `isPersonLike` — 값이 사용자 ID인가 (`'person' || 'multiPerson' || 'createdBy' || 'updatedBy'` 5군데를 대체)

호출부는 `registry.get(template.type)`으로 묻는다.

**근거**: 이 정리를 하지 않으면 새 타입 둘을 추가할 때마다 20군데를 찾아 조건을
늘려야 하고, 하나만 놓쳐도 "그룹화만 안 되는" 식의 조용한 결함이 남는다.
constitution 원칙 II가 말하는 "작업하는 코드의 문제를 함께 고친다"의 범위로 본다.

**완료 기준**: 행동을 바꾸지 않으므로 **기존 테스트가 그대로 통과**하는 것이
증거다. 이 단계에서는 새 테스트를 쓰지 않는다.

---

## R3. 필터 UI가 선택지를 어디서 받는가

**확인한 사실**: `webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`
(1043줄)가 `filterValueType`으로 갈라진다.

```
case 'options':  →  propertyTemplate.options 를 읽는다      (141행)
case 'person':   →  getBoardUsersList 를 따로 읽는다        (219행~, 전용 패널 컴포넌트)
```

조직 속성의 선택지는 보드가 아니라 조직 마스터에 있어 `propertyTemplate.options`가
비어 있다. 그대로 두면 **필터에서 본부를 골라도 선택지가 하나도 안 뜬다.**

**결정**: `'person'` 갈래를 본떠 `'orgUnit'` 갈래와 전용 패널을 만든다.

**근거**: `'person'`이 이미 "보드 정의 옵션이 아닌 외부 목록"을 다루는 선례다.
검색·선택·비어 있음 표시 구조를 그대로 쓸 수 있어 새로 설계할 것이 없다.

**규모**: person 패널에 준한다. 계획 단계에서 이 갈래를 **독립 단계로 분리**해
나머지(입력·표시·그룹화·CSV)와 따로 진행할 수 있게 한다 — 명세 P4를 P1~P3와
분리한 것과 같은 이유다.

---

## R4. CSV 내보내기

**확인한 사실**: `csvExporter.ts:126`이 `personPropertyTypes`에 속하면 사용자 이름
변환 경로로 보내고, 아니면 `property.exportValue(...)`를 부른다.

**결정**: 조직 속성은 `exportValue`를 직접 구현한다. `multiSelect`처럼 이름을 `|`로
잇되, 이름을 보드 옵션이 아니라 조직 마스터에서 찾는다.

**근거**: `personPropertyTypes` Set에 넣는 길도 있지만 그건 사용자 이름 표시
규칙(`teammateNameDisplay`)을 타는 경로다. 조직에는 그 개념이 없다.

**주의**: `exportValue`는 순수 함수 시그니처(`value, card, template, intl`)라
조직 마스터에 접근할 수 없다. 조직 이름을 어떻게 넘길지가 이 기능의 유일한
구조적 난점이며, 계획에서 다룬다.

---

## R5. 서버 엔드포인트 자리

**확인한 사실**: 조직 조회는 이미 `server/api/org.go`에 있다.

```
GET /teams/{teamID}/org-units   →  handleGetOrgUnits
GET /teams/{teamID}/duties      →  handleGetDuties
```

주석에 그 존재 이유가 적혀 있다 — 메인 서버의 조직 엔드포인트는 팀 관리자를
요구하는데 보드 관리자는 대개 팀 관리자가 아니라서, 팀 열람 문턱으로 낮춘 읽기
전용 경로를 따로 둔 것이다.

**결정**: 같은 파일에 `GET /teams/{teamID}/org-profiles`를 더한다. 문턱은 팀 열람
권한이고, 대상은 그 팀의 멤버(봇 제외), 내부적으로 `App.GetUserOrgProfiles(teamID,
userIDs)`를 쓴다.

**근거**: constitution 원칙 II(API → App → Store)를 지키며, 이미 있는 App 메서드를
그대로 쓴다. 조직 이름은 팀원이 이미 볼 수 있다는 판단이 `org.go` 주석에 있고,
소속 정보도 같은 성격이다.

**왜 보드 단위가 아닌가**: 사람 선택기는 보드 사용자만 보여주지 않는다.
`personSelector.tsx`의 `loadOptions`가 `allowAddUsers`일 때 `searchTeamUsers()`로
팀 전체를 서버 검색하고, `allowAddUsers`는 공개 보드면 참이다. 보드 단위로
내려보내면 검색으로 새로 나타나는 사용자의 소속을 몰라 좁힘이 성립하지 않는다.
후보 풀이 팀 전체이므로 소속 데이터도 같은 범위여야 한다
([contracts/org-profiles-api.md](./contracts/org-profiles-api.md)).

---

## R6. i18n

constitution 원칙 V에 따라 `webapp/i18n/en.json`과 `ko.json`을 같은 변경에서
갱신한다. 새로 필요한 문자열은 속성 종류 이름 둘(본부·부서), 빈 값 자리표시,
필터 패널의 검색·결과 없음 문구다. 기존 `PropertyType.*` 키 관례를 따른다.

---

## R7. 겸직을 다루지 않는 근거

`UserOrgProfiles`는 `PrimaryOrgUnitID` 하나를 갖는다. 메인 서버 모델에
`ExtraPositions`가 있지만 조직 단위가 아니라 직위(position) 목록이며, 이 기능은
직책·직위를 쓰지 않는다. 따라서 사용자는 조직 단위 하나에 속한다고 본다
(spec Assumptions).

나중에 겸직 요구가 생기면 `허용_사용자` 판정만 바꾸면 되고, 속성 저장 형식이나
엔드포인트는 그대로다.

---

## 미해결

없다. 명세의 `[NEEDS CLARIFICATION]`은 브레인스토밍 단계에서 모두 해소됐고,
브레인스토밍이 남긴 유일한 미확인 사항(R3 필터 배선)은 이 조사에서 확인했다.
