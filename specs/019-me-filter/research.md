# Research: 필터 "본인" 조건

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

브레인스토밍과 plan 단계에서 코드로 확인한 사실과 결정.

## R1. "본인"을 어떤 값으로 저장하나

- **Decision**: 필터 값 배열에 문자열 `'me'`(상수 `ME_FILTER_VALUE`)를 저장한다.
- **Rationale**: Mattermost user ID는 26자 영숫자라 `'me'`와 충돌할 수 없다. 뷰 데이터는 팀이 공유하므로, 보는 사람마다 다르게 풀리는 값은 ID가 아니라 토큰이어야 한다. 기존 `PersonSelector`의 `showMe`는 라벨만 "Me"이고 실제 ID를 저장해 공유 뷰에서 특정인으로 고정된다 — 요구와 다르다.
- **Alternatives considered**: ① 현행 showMe 재사용(실제 ID 저장) — 공유 뷰에서 각자 풀이(FR-003) 불충족. ② 별도 필터 조건 종류(`isMe`) 신설 — 조건·값 UI 양쪽을 바꿔야 하고 다중 선택("본인"+특정인)이 안 된다. 기각.

## R2. 토큰을 어디서 풀이하나

- **Decision**: `CardFilter.resolveMe(filterGroup, meId)` 정적 함수를 추가하고, 필터 적용 직전([store/cards.ts:574](../../webapp/src/store/cards.ts#L574) `applyViewCardFilterSearchAndSort`)에서 치환한 사본을 `applyFilterGroup`에 넘긴다.
- **Rationale**: `applyFilterGroup` 호출부는 저장소 전체에서 이 selector 한 곳뿐임을 grep으로 확인했다. `isClauseMet` 시그니처를 바꾸지 않으면 기존 평가 테스트가 전부 그대로 유효하다. selector는 `getMe`를 이미 쓰는 패턴이 주변에 있다.
- **Alternatives considered**: ① `isClauseMet`에 meId 인자 추가 — 시그니처 전파, 기존 테스트 수정 필요. ② UI 저장 시 실제 ID로 변환 — 토큰의 의미 자체가 사라짐. 기각.

## R3. 치환 방식이 모든 조건과 호환되나

- **Decision**: 값 치환만으로 충분하다. 추가 조건 분기 없음.
- **Rationale**: `isClauseMet`의 includes/notIncludes는 `(Array.isArray(value) ? value.includes(cValue) : cValue === value)`로 비교한다([cardFilter.ts:205](../../webapp/src/cardFilter.ts#L205)) — 단일 사용자(문자열)와 다중 사용자(배열) 모두 치환된 실제 ID로 정상 판정된다. createdBy/updatedBy는 평가 전에 `card.createdBy`/`card.modifiedBy`로 값이 채워진다. `FilterGroup.filters`는 `FilterClause | FilterGroup` 혼합 배열이므로 resolveMe는 재귀한다.
- **Alternatives considered**: 조건별 특수 처리 — 불필요한 복잡도. 기각.

## R4. UI는 어디를 바꾸나

- **Decision**: 실사용 필터 UI는 `filterValuePanel.tsx`의 `PersonFilterPanel` 하나다(filterValueType 'person' — person·multiPerson·createdBy·updatedBy 공용). 그 목록 맨 위에 고정 항목 "본인"을 추가한다. 라벨은 기존 i18n 키 `PersonProperty.me`(ko "본인" / en "Me", 양쪽 이미 존재) 재사용.
- **Rationale**: viewHeader는 `FilterPanel`만 import하고, 구형 `multipersonFilterValue.tsx`·`cardFilterValue.tsx`는 import 0건(레거시)임을 확인했다. 필터 속성 리스트(`filterPropertyList.tsx`)는 선택 **개수**만 뱃지로 그려 이름 조회가 없다 — 'me' 라벨 추가 처리가 필요한 표시 지점이 없다.
- **Alternatives considered**: 레거시 컴포넌트까지 수정 — 죽은 코드에 기능 추가는 낭비. 기각 (spec Assumptions에 제외 명시).

## R5. 카드 속성 편집기의 "Me"는 왜 안 바꾸나

- **Decision**: `PersonSelector`의 `showMe`(속성 값 편집)는 그대로 둔다.
- **Rationale**: 속성 값은 "이 카드의 담당자가 누구인가"라는 사실의 기록이다 — 특정인 ID로 고정되는 것이 맞다. 보는 사람마다 달라져야 하는 건 필터뿐이다.
