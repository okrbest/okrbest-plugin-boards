# Baseline: 016-restore-hidden-boards

**측정**: 2026-09-23, 브랜치 `016-restore-hidden-boards` = `main`(e16cd220) + 문서만.
코드는 `main`과 같다(`git diff main --stat` → specs·CLAUDE.md·.specify만). jest 목록은 같은 날
같은 코드에서 `npx jest --ci` 전체 실행으로 잰 것이고, tsc는 이 시점에 다시 쟀다.

회귀 판정은 개수가 아니라 **이 목록과의 diff**로 한다 (헌법 원칙 I).

## jest — 실패 스위트 57개

010의 [baseline.md](../010-admin-only-card-properties/baseline.md)에서
`src/components/sidebar/sidebarBoardItem.test.tsx` 한 줄만 빠졌다(지금은 통과).

```
src/components/blockIconSelector.test.tsx
src/components/blocksEditor/blocks/text/text.test.tsx
src/components/blocksEditor/editor.test.tsx
src/components/blocksEditor/rootInput.test.tsx
src/components/boardTemplateSelector/boardTemplateSelector.test.tsx
src/components/boardTemplateSelector/boardTemplateSelectorItem.test.tsx
src/components/boardTemplateSelector/boardTemplateSelectorPreview.test.tsx
src/components/boardsUnfurl/boardsUnfurl.test.tsx
src/components/calendar/fullCalendar.test.tsx
src/components/cardDetail/cardDetail.test.tsx
src/components/cardDetail/subCards.test.tsx
src/components/cardDialog.test.tsx
src/components/centerPanel.test.tsx
src/components/confirmAddUserForNotifications.test.tsx
src/components/confirmationDialogBox.test.tsx
src/components/content/checkboxElement.test.tsx
src/components/contentBlock.test.tsx
src/components/flashMessages.test.tsx
src/components/gallery/gallery.test.tsx
src/components/gallery/galleryCard.test.tsx
src/components/globalHeader/globalHeader.test.tsx
src/components/globalHeader/globalHeaderSettingsMenu.test.tsx
src/components/kanban/kanban.test.tsx
src/components/kanban/kanbanCard.test.tsx
src/components/messages/versionMessage.test.tsx
src/components/modal.test.tsx
src/components/personSelector.test.tsx
src/components/propertyValueElement.test.tsx
src/components/shareBoard/channelPermissionsRow.test.tsx
src/components/shareBoard/shareBoard.test.tsx
src/components/shareBoard/teamPermissionsRow.test.tsx
src/components/shareBoard/userPermissionsRow.test.tsx
src/components/sidebar/sidebar.test.tsx
src/components/sidebar/sidebarSettingsMenu.test.tsx
src/components/table/table.test.tsx
src/components/table/tableRow.test.tsx
src/components/table/tableRows.test.tsx
src/components/viewHeader/dateFilter.test.tsx
src/components/viewHeader/emptyCardButton.test.tsx
src/components/viewHeader/newCardButton.test.tsx
src/components/viewHeader/newCardButtonTemplateItem.test.tsx
src/components/viewHeader/viewHeader.test.tsx
src/components/viewHeader/viewHeaderGroupByMenu.test.tsx
src/components/viewHeader/viewHeaderPropertiesMenu.test.tsx
src/components/viewHeader/viewHeaderSortMenu.test.tsx
src/components/viewTitle.test.tsx
src/components/workspace.test.tsx
src/properties/createdBy/createdBy.test.tsx
src/properties/date/date.test.tsx
src/properties/multiperson/multiperson.test.tsx
src/properties/number/number.test.tsx
src/properties/person/confirmPerson.test.tsx
src/properties/person/person.test.tsx
src/properties/updatedBy/updatedBy.test.tsx
src/properties/url/url.test.tsx
src/utils/emojiUtils.test.ts
src/widgets/propertyMenu.test.tsx
```

주의: `src/components/flashMessages.test.tsx`와 `src/components/sidebar/sidebar.test.tsx`가
기준선에서 이미 실패한다. 이 기능이 두 파일에 케이스를 더하므로, 판정은 파일 단위가
아니라 **테스트 이름 단위**로 한다 — 기존에 실패하던 테스트 이름이 그대로고 새 테스트만
통과하면 회귀가 아니다.

## tsc — 오류 23건 (파일별)

```
      6 src/mmStore.ts
      6 src/components/centerPanel.test.tsx
      2 src/mutator.ts
      2 src/index.tsx
      2 src/components/table/tableRow.test.tsx
      1 src/widgets/menuWrapper.tsx
      1 src/widgets/emojiPicker.tsx
      1 src/utils/emojiUtils.test.ts
      1 src/csvExporter.test.ts
      1 src/components/emojiIcon.tsx
```

사이드바·알림·mutator 파일에는 오류가 없다(`mutator.ts` 2건은 `propertyId` 기존 오류).

## eslint

전 파일에 `1:1 Resolve error: typescript with invalid interface loaded as resolver`가 난다
(환경 문제). 변경 예정 파일의 그 외 지적: `sidebarCategory.tsx:6 'generatePath' is defined
but never used` 1건(기존). 판정은 이 두 가지를 뺀 나머지로 한다.

---

## 구현 후 게이트 결과 (2026-09-23, T025)

| 게이트 | 결과 | 근거 |
|---|---|---|
| jest 전체 (`npx jest --ci`) | 실패 스위트 57개, **기준선 목록과 diff 없음** | 위 목록과 동일. `flashMessages.test.tsx`·`sidebar.test.tsx`는 새 테스트가 통과하고 기존 실패 테스트 이름이 그대로다 |
| tsc (`npm run check-types`) | 파일별 오류 수 **기준선과 동일**(23건) | `mutator.test.ts`에 잠시 1건이 생겼다가(mock 반환 타입) 고쳐서 0 |
| eslint (변경 파일 13개) | 새 지적 없음 | 남은 것: `1:1 Resolve error` 13건(환경), `sidebarCategory.tsx:6 generatePath`(기존), `any` 경고 3건(기존 줄) |
| stylelint (`flashMessages.scss`, `sidebarCategory.scss`) | 깨끗 | `rule-empty-line-before` 1건을 블록 병합으로 고쳤다 |

**T023**: `npm run i18n-extract`는 en.json을 통째로 재생성해 무관한 키 380줄을 바꾼다
(저장소의 en.json이 추출 결과와 이미 어긋나 있다). 되돌리고 키 6개만 정렬 위치에 손으로
넣었다. en·ko 양쪽에 6개 모두 있음을 grep으로 확인했다.

**T024**: 스냅샷 변화는 `sidebar.test.tsx.snap`의 `dont show hidden boards 1` 항목 하나뿐이다
("No boards inside" div → 숨긴 보드 행). 기준선에서 실패하던 같은 파일의 두 항목은 diff에
행이 없어(React id 차이·낡은 스냅샷) 건드리지 않고 git 원본으로 되돌렸다.
`flashMessages`(4)·`sidebarCategory`(6)·`sidebarBoardItem`(3) 스냅샷은 그대로 통과한다.
