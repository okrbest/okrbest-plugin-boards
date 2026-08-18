# 기준선 (T001)

**측정**: 2026-08-18 | **커밋**: 8532c6c0 | **작업 트리**: 깨끗

회귀 판정은 실패 **개수**가 아니라 이 목록과의 **diff**로 한다(헌법 원칙 I). 이
저장소는 깨끗한 상태에서도 실패가 있다.

| 게이트 | 실패/지적 |
|---|---|
| `make server-lint` | 11건 |
| `make server-test` | 12건 |
| `npm run test` (jest) | 58스위트 |
| `npm run check-types` | 23건 |

## make server-lint

```
app/export.go: S1011: should replace loop with `files = append(files, extractBlockSuiteFileIDs(doc.Snapshot)...)` (gosimple)
app/export_markdown.go: `Flavour` is a misspelling of `Flavor` (misspell)
app/export_markdown.go: shadow: declaration of "ok" shadows declaration at line 313 (govet)
app/import.go: File is not properly formatted (gofmt)
app/import.go: cyclomatic complexity 31 of func `(*App).ImportBoardJSONL` is high (> 30) (gocyclo)
model/board_permissions.go: missing cases in switch of type model.EffectiveBoardPermission: model.EffectiveBoardPermissionNone (exhaustive)
model/board_permissions.go: missing cases in switch of type model.EffectiveBoardPermission: model.EffectiveBoardPermissionNone, model.EffectiveBoardPermissionView, model.EffectiveBoardPermissionCommenter, model.EffectiveBoardPermissionEdit, model.EffectiveBoardPermissionManage (exhaustive)
services/permissions/localpermissions/localpermissions.go: ifElseChain: rewrite if-else to switch statement (gocritic)
services/permissions/mmpermissions/mmpermissions.go: cyclomatic complexity 31 of func `(*Service).GetBoardPermissions` is high (> 30) (gocyclo)
services/permissions/mmpermissions/mmpermissions.go: ifElseChain: rewrite if-else to switch statement (gocritic)
services/permissions/mmpermissions/mmpermissions.go: missing cases in switch of type model.BoardRole: model.BoardRoleNone, model.BoardRoleViewer, model.BoardRoleCommenter, model.BoardRoleEditor, model.BoardRoleAdmin (exhaustive)
```

## make server-test

```
--- FAIL: TestApp_FixImagesAttachments
--- FAIL: TestCheckForMismatchedCollation
--- FAIL: TestConcatenationSelector
--- FAIL: TestCreateWelcomeBoard
--- FAIL: TestDuplicateBoard
--- FAIL: TestElementInColumn
--- FAIL: TestLinkCardAsSubCard
--- FAIL: TestPrepareOnboardingTour
--- FAIL: TestSQLStore
--- FAIL: TestUnlinkSubCard
--- FAIL: TestValidateFileOwnership
--- FAIL: Test_GetValue
```

## npm run test — 실패 스위트

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
FAIL src/components/sidebar/sidebarBoardItem.test.tsx
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

## npm run check-types

```
src/components/centerPanel.test.tsx: error TS2353: Object literal may only specify known properties, and 'shiftKey' does not exist in type 'DirectOptions'.
src/components/centerPanel.test.tsx: error TS2353: Object literal may only specify known properties, and 'shiftKey' does not exist in type 'DirectOptions'.
src/components/centerPanel.test.tsx: error TS2353: Object literal may only specify known properties, and 'shiftKey' does not exist in type 'DirectOptions'.
src/components/centerPanel.test.tsx: error TS2353: Object literal may only specify known properties, and 'shiftKey' does not exist in type 'DirectOptions'.
src/components/centerPanel.test.tsx: error TS2353: Object literal may only specify known properties, and 'shiftKey' does not exist in type 'DirectOptions'.
src/components/centerPanel.test.tsx: error TS2353: Object literal may only specify known properties, and 'shiftKey' does not exist in type 'DirectOptions'.
src/components/emojiIcon.tsx: error TS2322: Type 'Store<GlobalState, Action<Record<string, unknown>>, unknown>' is not assignable to type 'Store<GlobalState, Action<string>, unknown>'.
src/components/table/tableRow.test.tsx: error TS2345: Argument of type '{ id: string; name: string; type: string; options: { id: string; value: string; color: string; }[]; }' is not assignable to parameter of type 'IPropertyTemplate'.
src/components/table/tableRow.test.tsx: error TS2345: Argument of type '{ id: string; name: string; type: string; options: { id: string; value: string; color: string; }[]; }' is not assignable to parameter of type 'IPropertyTemplate'.
src/csvExporter.test.ts: error TS2345: Argument of type '{ id: string; name: string; type: string; options: never[]; }' is not assignable to parameter of type 'IPropertyTemplate'.
src/index.tsx: error TS2344: Type 'Action<Record<string, unknown>>' does not satisfy the constraint 'Action<string>'.
src/index.tsx: error TS2344: Type 'Record<string, unknown>' does not satisfy the constraint 'string'.
src/mmStore.ts: error TS2344: Type 'Action<Record<string, unknown>>' does not satisfy the constraint 'Action<string>'.
src/mmStore.ts: error TS2344: Type 'Action<Record<string, unknown>>' does not satisfy the constraint 'Action<string>'.
src/mmStore.ts: error TS2344: Type 'Action<Record<string, unknown>>' does not satisfy the constraint 'Action<string>'.
src/mmStore.ts: error TS2344: Type 'Record<string, unknown>' does not satisfy the constraint 'string'.
src/mmStore.ts: error TS2344: Type 'Record<string, unknown>' does not satisfy the constraint 'string'.
src/mmStore.ts: error TS2344: Type 'Record<string, unknown>' does not satisfy the constraint 'string'.
src/mutator.ts: error TS2339: Property 'propertyId' does not exist on type 'FilterClause | FilterGroup'.
src/mutator.ts: error TS2339: Property 'propertyId' does not exist on type 'FilterClause | FilterGroup'.
src/utils/emojiUtils.test.ts: error TS2305: Module '"./emojiUtils"' has no exported member 'getValidEmojiData'.
src/widgets/emojiPicker.tsx: error TS2322: Type 'Store<GlobalState, Action<Record<string, unknown>>, unknown>' is not assignable to type 'Store<GlobalState, Action<string>, unknown>'.
src/widgets/menuWrapper.tsx: error TS2345: Argument of type '{ bottom: number; left: number; }' is not assignable to parameter of type 'SetStateAction<{ top: number; right?: number | undefined; left?: number | undefined; bottom?: number | undefined; } | null>'.
```
