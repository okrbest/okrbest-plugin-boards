# 계약: 본부·부서 속성 타입

**Feature**: `005-org-scoped-properties`

새 속성 타입 둘이 기존 속성 체계와 맺는 계약이다. 저장 형식은
`data-model.md` 1절에 있고, 여기서는 **레지스트리와 주변 코드가 이 타입들을
어떻게 다루는가**를 정한다.

---

## 1. 타입 식별자

```
orgDivision     본부
orgDepartment   부서
```

`webapp/src/blocks/board.ts`의 `PropertyTypeEnum` 유니온에 추가한다.

`multiOrgDivision` 같은 이름을 쓰지 않는다. 두 타입 모두 처음부터 다중값이고
단일값 짝이 없으므로 접두사가 구별하는 것이 없다.

---

## 2. PropertyType 능력

| 능력 | orgDivision | orgDepartment | 근거 |
|---|---|---|---|
| `isMultiValue` | `true` | `true` | 값이 배열 (FR-002) |
| `isPersonLike` | `false` | `false` | 값이 사용자 ID가 아니다 |
| `canFilter` | `true` | `true` | FR-019 |
| `canGroup` | `true` | `true` | FR-020 |
| `filterValueType` | `'orgUnit'` | `'orgUnit'` | 3절 |
| `Editor` | 본부 에디터 | 부서 에디터 | 4절 |

`isMultiValue`·`isPersonLike`는 이 기능이 `PropertyType`에 새로 추가하는 능력이다
(research R2). 기존 타입에도 값을 채워, 흩어져 있던 문자열 비교를 대체한다.

---

## 3. 필터

`FilterValueType`에 `'orgUnit'`을 더하고,
`webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`의 switch에
갈래를 추가한다.

```
case 'options':  →  propertyTemplate.options       (보드 정의 선택지)
case 'person':   →  getBoardUsersList              (외부 목록 — 선례)
case 'orgUnit':  →  조직 마스터                     (신규)
```

`'options'` 갈래를 재사용하지 않는 이유는 그것이 `propertyTemplate.options`만
읽기 때문이다. 조직 속성은 그 배열이 항상 비어 있다(`data-model.md` 1.2).

전용 패널은 `'person'` 패널의 구조(검색 입력 + 목록 + "결과 없음")를 따른다.
constitution 원칙 II — 같은 역할의 기존 패턴을 먼저 차용한다.

**본부 필터와 부서 필터는 같은 패널을 쓰되 목록만 다르다.** 속성 타입으로
`division`/`department`를 골라 넘긴다.

---

## 4. 에디터

`webapp/src/properties/multiselect/`의 에디터를 본뜬다. 다른 것은 선택지의
출처뿐이다.

| | 선택지 |
|---|---|
| 본부 | 조직 마스터의 active division 전체 |
| 부서 | `허용_부서(선택된_본부)` (`data-model.md` 3.2) |

둘 다 `표시_목록`(3.4)을 거쳐 카드에 이미 있는 값을 더한다.

에디터는 React 컴포넌트이므로 `useAppSelector`로 조직 마스터를 읽는다. 화면
렌더링은 `PropertyValueElement`가 `property.Editor`를 부르는 경로를 타므로 표·보드
보기도 같은 컴포넌트를 쓴다.

---

## 5. 표시와 내보내기

### 화면

에디터가 ID를 조직 이름으로 바꿔 보여준다 (FR-005). 조직 마스터에 없는 ID는
지우지 않고 문제 있는 값으로 표시한다 (FR-006).

### CSV

`PropertyType.exportValue`는 순수 함수 시그니처(`value, card, template, intl`)라
조직 마스터에 접근할 수 없다. `csvExporter.ts`가 **사람 속성에 이미 같은 예외**를
두고 있으므로 그 선례를 따른다.

```
csvExporter.ts:126
    personPropertyTypes.has(type)  →  exportPersonValue(value, boardUsers, ...)
    (신규) orgPropertyTypes.has(type) →  exportOrgValue(value, orgUnits)
    그 외                          →  property.exportValue(...)
```

이름을 `|`로 잇는다 — `multiSelect`와 같은 형식 (FR-021).

---

## 6. 그룹화

`isMultiValue`가 `true`이므로 다중값 그룹화 경로를 탄다. 한 카드가 여러 그룹에
나타나는 것은 `multiSelect`·`multiPerson`의 기존 동작이며 그대로 따른다
(spec Assumptions).

**research R2의 정리를 마친 뒤에는 그룹화 쪽에 추가 작업이 없다.** 호출부가
타입 이름 대신 `isMultiValue`를 묻게 되므로 새 타입이 자동으로 포함된다.

---

## 7. i18n

constitution 원칙 V에 따라 `webapp/i18n/en.json`과 `ko.json`을 같은 변경에서
갱신한다.

| 키 | 용도 |
|---|---|
| `PropertyType.OrgDivision` | 속성 종류 이름 — 본부 |
| `PropertyType.OrgDepartment` | 속성 종류 이름 — 부서 |
| `OrgProperty.empty` | 값이 없을 때 자리표시 |
| `FilterPanel.orgUnit-*` | 필터 패널 검색·결과 없음 |

기존 `PropertyType.*` 키 관례를 따른다.

---

## 8. 하위 호환

- 이 속성 타입을 쓰지 않는 보드의 동작과 페이로드는 바뀌지 않는다 (FR-023)
- `isMultiValue`·`isPersonLike` 도입은 **행동을 바꾸지 않는 정리**다. 기존 테스트가
  그대로 통과하는 것이 완료 기준이다 (research R2)
- 알 수 없는 속성 타입은 기존대로 `UnknownProperty`로 떨어지므로, 이 기능이 없는
  구버전 클라이언트에서도 카드가 깨지지 않는다
