# Baseline: webapp 게이트 (018 구현 전)

측정일: 2026-10-12 · 브랜치 018-sidebar-channel-style (코드 무변경 상태) · node 20.11

| 게이트 | exit | 실패 규모 |
|---|---|---|
| npm run check | 1 | eslint error 2503줄 (stylelint 포함 로그 기준) |
| npm run check-types | 2 | TS 오류 23건 / 10파일 |
| npm run test | 1 | 57 스위트 / 145 테스트 / 스냅샷 53 실패 (전체 192 스위트) |

회귀 판정은 아래 실패 스위트 목록과의 diff로 한다.

## 실패 스위트 목록 (npm run test)

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
FAIL src/components/flashMessages.test.tsx (5.097 s)
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
FAIL src/components/shareBoard/channelPermissionsRow.test.tsx (15.229 s)
FAIL src/components/shareBoard/shareBoard.test.tsx
FAIL src/components/shareBoard/teamPermissionsRow.test.tsx (16.271 s)
FAIL src/components/shareBoard/userPermissionsRow.test.tsx (21.292 s)
FAIL src/components/sidebar/sidebar.test.tsx
FAIL src/components/sidebar/sidebarSettingsMenu.test.tsx
FAIL src/components/table/table.test.tsx (6.133 s)
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

## TS 오류 파일 목록 (npm run check-types)

```
src/components/centerPanel.test.tsx
src/components/emojiIcon.tsx
src/components/table/tableRow.test.tsx
src/csvExporter.test.ts
src/index.tsx
src/mmStore.ts
src/mutator.ts
src/utils/emojiUtils.test.ts
src/widgets/emojiPicker.tsx
src/widgets/menuWrapper.tsx
```

## 작업 대상 스위트의 baseline 상세

- `src/components/sidebar/sidebar.test.tsx` — baseline에서 2개 테스트 실패:
  - `should assign default category if current board doesnt have a category`
  - `shouldnt do any category assignment is board is in a category`
- `src/components/sidebar/sidebarSettingsMenu.test.tsx` — baseline 실패 (스냅샷 계열)
- `userSettings`·`theme`·`sidebarCategory`·`sidebarBoardItem` 스위트는 baseline에서 통과

018 판정: 위 2개 실패는 그대로여야 하고, 새로 추가한 테스트와 기존 통과 스위트는 전부 통과해야 한다.
