# Baseline: webapp 게이트 (019 구현 전)

측정일: 2026-10-12 · 브랜치 019-me-filter (018 병합 직후, 코드 무변경)

| 게이트 | exit | 실패 규모 |
|---|---|---|
| npm run check | 1 | eslint error 2505줄 |
| npm run check-types | 2 | TS 오류 23건 |
| npm run test | 1 | 57 스위트 / 143 테스트 (전체 194 스위트 / 1326 테스트) |

**작업 대상 스위트(`cardFilter.test.ts`·`filterValuePanel.test.tsx`)는 baseline에서 통과한다** — 회귀 판정이 단순하다.

회귀 판정은 실패 스위트 목록 diff. 목록:

```
FAIL src/components/blockIconSelector.test.tsx
FAIL src/components/blocksEditor/blocks/text/text.test.tsx
FAIL src/components/blocksEditor/editor.test.tsx
FAIL src/components/blocksEditor/rootInput.test.tsx
FAIL src/components/boardTemplateSelector/boardTemplateSelector.test.tsx
FAIL src/components/boardTemplateSelector/boardTemplateSelectorItem.test.tsx
FAIL src/components/boardTemplateSelector/boardTemplateSelectorPreview.test.tsx
FAIL src/components/boardsUnfurl/boardsUnfurl.test.tsx
FAIL src/components/calendar/fullCalendar.test.tsx
FAIL src/components/cardDetail/cardDetail.test.tsx
FAIL src/components/cardDetail/subCards.test.tsx
FAIL src/components/cardDialog.test.tsx
FAIL src/components/centerPanel.test.tsx
FAIL src/components/confirmAddUserForNotifications.test.tsx
FAIL src/components/confirmationDialogBox.test.tsx
FAIL src/components/content/checkboxElement.test.tsx
FAIL src/components/contentBlock.test.tsx
FAIL src/components/flashMessages.test.tsx
FAIL src/components/gallery/gallery.test.tsx
FAIL src/components/gallery/galleryCard.test.tsx
FAIL src/components/globalHeader/globalHeader.test.tsx
FAIL src/components/globalHeader/globalHeaderSettingsMenu.test.tsx
FAIL src/components/kanban/kanban.test.tsx
FAIL src/components/kanban/kanbanCard.test.tsx
FAIL src/components/messages/versionMessage.test.tsx
FAIL src/components/modal.test.tsx
FAIL src/components/personSelector.test.tsx
FAIL src/components/propertyValueElement.test.tsx
FAIL src/components/shareBoard/channelPermissionsRow.test.tsx
FAIL src/components/shareBoard/shareBoard.test.tsx
FAIL src/components/shareBoard/teamPermissionsRow.test.tsx
FAIL src/components/shareBoard/userPermissionsRow.test.tsx
FAIL src/components/sidebar/sidebar.test.tsx
FAIL src/components/sidebar/sidebarSettingsMenu.test.tsx
FAIL src/components/table/table.test.tsx
FAIL src/components/table/tableRow.test.tsx
FAIL src/components/table/tableRows.test.tsx
FAIL src/components/viewHeader/dateFilter.test.tsx
FAIL src/components/viewHeader/emptyCardButton.test.tsx
FAIL src/components/viewHeader/newCardButton.test.tsx
FAIL src/components/viewHeader/newCardButtonTemplateItem.test.tsx
FAIL src/components/viewHeader/viewHeader.test.tsx
FAIL src/components/viewHeader/viewHeaderGroupByMenu.test.tsx
FAIL src/components/viewHeader/viewHeaderPropertiesMenu.test.tsx
FAIL src/components/viewHeader/viewHeaderSortMenu.test.tsx
FAIL src/components/viewTitle.test.tsx
FAIL src/components/workspace.test.tsx
FAIL src/properties/createdBy/createdBy.test.tsx
FAIL src/properties/date/date.test.tsx
FAIL src/properties/multiperson/multiperson.test.tsx
FAIL src/properties/number/number.test.tsx
FAIL src/properties/person/confirmPerson.test.tsx
FAIL src/properties/person/person.test.tsx
FAIL src/properties/updatedBy/updatedBy.test.tsx
FAIL src/properties/url/url.test.tsx
FAIL src/utils/emojiUtils.test.ts
FAIL src/widgets/propertyMenu.test.tsx
```
