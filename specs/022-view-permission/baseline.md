# 기준선 (2026-11-02, 구현 전, 코드 트리 = main 84672bb8)

회귀 판정은 이 목록과의 diff로 한다. 개수 비교는 근거가 아니다 (constitution 원칙 I).

## server — `make server-test` (exit=2)

패키지 FAIL: server/app, server/model, server/services/store/sqlstore. 최상위 FAIL 테스트:

```
--- FAIL: TestApp_FixImagesAttachments (0.00s)
--- FAIL: TestCheckForMismatchedCollation (0.56s)
--- FAIL: TestConcatenationSelector (0.23s)
--- FAIL: TestCreateWelcomeBoard (0.00s)
--- FAIL: TestDuplicateBoard (0.03s)
--- FAIL: TestElementInColumn (0.24s)
--- FAIL: TestLinkCardAsSubCard (0.00s)
--- FAIL: TestPrepareOnboardingTour (0.00s)
--- FAIL: TestSQLStore (19.34s)
--- FAIL: TestUnlinkSubCard (0.00s)
--- FAIL: TestValidateFileOwnership (0.00s)
--- FAIL: Test_GetValue (0.00s)
```

<details><summary>서브테스트 포함 전체 FAIL 목록 (96줄)</summary>

```
        --- FAIL: TestSQLStore/BlocksStore/DeleteBlock
        --- FAIL: TestSQLStore/BlocksStore/DuplicateBlock
        --- FAIL: TestSQLStore/BlocksStore/GetBlock
        --- FAIL: TestSQLStore/BlocksStore/GetBlockHistoryNewestChildren
        --- FAIL: TestSQLStore/BlocksStore/GetBlockMetadata
        --- FAIL: TestSQLStore/BlocksStore/GetBlocks
        --- FAIL: TestSQLStore/BlocksStore/GetSubTree2
        --- FAIL: TestSQLStore/BlocksStore/InsertBlock
        --- FAIL: TestSQLStore/BlocksStore/InsertBlocks
        --- FAIL: TestSQLStore/BlocksStore/PatchBlock
        --- FAIL: TestSQLStore/BlocksStore/PatchBlocks
        --- FAIL: TestSQLStore/BlocksStore/UndeleteBlock
        --- FAIL: TestSQLStore/BlocksStore/UndeleteBlockChildren
        --- FAIL: TestSQLStore/BoardStore/DeleteBoard
        --- FAIL: TestSQLStore/BoardStore/DeleteMember
        --- FAIL: TestSQLStore/BoardStore/GetBoard
        --- FAIL: TestSQLStore/BoardStore/GetBoardCount
        --- FAIL: TestSQLStore/BoardStore/GetBoardHistory
        --- FAIL: TestSQLStore/BoardStore/GetBoardsForUserAndTeam
        --- FAIL: TestSQLStore/BoardStore/GetBoardsInTeamByIds
        --- FAIL: TestSQLStore/BoardStore/GetMemberForBoard
        --- FAIL: TestSQLStore/BoardStore/GetMembersForBoard
        --- FAIL: TestSQLStore/BoardStore/GetMembersForUser
        --- FAIL: TestSQLStore/BoardStore/InsertBoard
        --- FAIL: TestSQLStore/BoardStore/InsertBoardWithAdmin
        --- FAIL: TestSQLStore/BoardStore/PatchBoard
        --- FAIL: TestSQLStore/BoardStore/SaveMember
        --- FAIL: TestSQLStore/BoardStore/SearchBoardsForUser
        --- FAIL: TestSQLStore/BoardStore/SearchBoardsForUserInTeam
        --- FAIL: TestSQLStore/BoardStore/UndeleteBoard
        --- FAIL: TestSQLStore/BoardsAndBlocksStore/createBoardsAndBlocks
        --- FAIL: TestSQLStore/BoardsAndBlocksStore/deleteBoardsAndBlocks
        --- FAIL: TestSQLStore/BoardsAndBlocksStore/duplicateBoard
        --- FAIL: TestSQLStore/BoardsAndBlocksStore/patchBoardsAndBlocks
        --- FAIL: TestSQLStore/CloudStore/GetUsedCardsCount
        --- FAIL: TestSQLStore/CloudStore/TestGetCardLimitTimestamp
        --- FAIL: TestSQLStore/CloudStore/TestUpdateCardLimitTimestamp
        --- FAIL: TestSQLStore/ComplianceHistoryStore/GetBlocksComplianceHistory
        --- FAIL: TestSQLStore/ComplianceHistoryStore/GetBoardsComplianceHistory
        --- FAIL: TestSQLStore/ComplianceHistoryStore/GetBoardsForCompliance
        --- FAIL: TestSQLStore/DataRetention/RunDataRetention
        --- FAIL: TestSQLStore/NotificationHintStore/DeleteNotificationHint
        --- FAIL: TestSQLStore/NotificationHintStore/GetNextNotificationHint
        --- FAIL: TestSQLStore/NotificationHintStore/GetNotificationHint
        --- FAIL: TestSQLStore/NotificationHintStore/UpsertNotificationHint
        --- FAIL: TestSQLStore/SessionStore/GetActiveUserCount
        --- FAIL: TestSQLStore/SharingStore/UpsertSharingAndGetSharing
        --- FAIL: TestSQLStore/StoreTestCategoryBoardsStore/AddUpdateCategoryBoard
        --- FAIL: TestSQLStore/StoreTestCategoryBoardsStore/AddUpdateCategoryBoardSortOrder
        --- FAIL: TestSQLStore/StoreTestCategoryBoardsStore/GetUserCategoryBoards
        --- FAIL: TestSQLStore/StoreTestCategoryBoardsStore/SetBoardVisibility
        --- FAIL: TestSQLStore/StoreTestCategoryStore/CreateCategory
        --- FAIL: TestSQLStore/StoreTestCategoryStore/DeleteCategory
        --- FAIL: TestSQLStore/StoreTestCategoryStore/GetUserCategories
        --- FAIL: TestSQLStore/StoreTestCategoryStore/ReorderCategories
        --- FAIL: TestSQLStore/StoreTestCategoryStore/ReorderCategoriesBoards
        --- FAIL: TestSQLStore/StoreTestCategoryStore/UpdateCategory
        --- FAIL: TestSQLStore/SystemStore/SetGetSystemSettings
        --- FAIL: TestSQLStore/TeamStore/GetAllTeams
        --- FAIL: TestSQLStore/TeamStore/GetTeam
        --- FAIL: TestSQLStore/TeamStore/UpsertTeamSettings
        --- FAIL: TestSQLStore/TeamStore/UpsertTeamSignupToken
        --- FAIL: TestSQLStore/UserStore/CreateAndGetUser
    --- FAIL: TestCreateWelcomeBoard/base_case
    --- FAIL: TestDuplicateBoard/base_case
    --- FAIL: TestLinkCardAsSubCard/success_scenario
    --- FAIL: TestPrepareOnboardingTour/base_case
    --- FAIL: TestSQLStore/BlocksStore
    --- FAIL: TestSQLStore/BoardStore
    --- FAIL: TestSQLStore/BoardsAndBlocksStore
    --- FAIL: TestSQLStore/CloudStore
    --- FAIL: TestSQLStore/ComplianceHistoryStore
    --- FAIL: TestSQLStore/DataRetention
    --- FAIL: TestSQLStore/NotificationHintStore
    --- FAIL: TestSQLStore/SessionStore
    --- FAIL: TestSQLStore/SharingStore
    --- FAIL: TestSQLStore/StoreTestCategoryBoardsStore
    --- FAIL: TestSQLStore/StoreTestCategoryStore
    --- FAIL: TestSQLStore/StoreTestFileStore
    --- FAIL: TestSQLStore/SystemStore
    --- FAIL: TestSQLStore/TeamStore
    --- FAIL: TestSQLStore/UserStore
    --- FAIL: TestUnlinkSubCard/success_scenario
    --- FAIL: TestValidateFileOwnership/Should_deny_access_to_file_that_belongs_to_different_board
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
</details>

메모(`server-test-baseline`)의 7~8건보다 많다 — TestSQLStore(storetests 묶음)가 통째로 실패해 서브테스트가 늘어났다. 이 기능의 storetests 추가(T023)는 TestSQLStore 아래 서브테스트로 들어가므로 **서브테스트 이름 기준**으로 diff한다.

## webapp — `npm run test` (CI=true)

```
Test Suites: 56 failed, 139 passed, 195 total
Tests:       139 failed, 1230 passed, 1369 total
Snapshots:   48 failed, 320 passed, 368 total
```

실패 스위트 (56개):

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

<details><summary>실패 테스트 이름 전체 (140개)</summary>

```
  ● /components/confirmAddUserForNotifications › cancel button click runs onClose function
  ● /components/confirmAddUserForNotifications › confirm button click, run onConfirm Function once
  ● /components/confirmationDialogBox › cancel button click runs onClose function
  ● /components/confirmationDialogBox › confirm button (with passed prop text), run onConfirm Function once
  ● /components/confirmationDialogBox › confirm button click, run onConfirm Function once
  ● Test suite failed to run
  ● components/blockIconSelector › return a new icon after click on EmojiPicker
  ● components/blockIconSelector › return an icon correctly
  ● components/blockIconSelector › return menu on click
  ● components/blockIconSelector › return no menu in readonly
  ● components/blocksEditor/blocks/text › should match Input snapshot
  ● components/blocksEditor/editor › should match snapshot
  ● components/blocksEditor/rootInput › should match Input snapshot with menu open
  ● components/boardTemplateSelector/boardTemplateSelectorItem › should trigger the onDelete (and not any other) when click the delete icon
  ● components/boardTemplateSelector/boardTemplateSelectorItem › should trigger the onDelete (and not any other) when click the delete icon and confirm
  ● components/boardTemplateSelector/boardTemplateSelectorItem › should trigger the onSelect (and not any other) when click the element
  ● components/boardsUnfurl/BoardsUnfurl › test invalid card, invalid block
  ● components/boardsUnfurl/BoardsUnfurl › test invalid card, valid block
  ● components/cardDetail/CardDetail › should render hidden view if limited
  ● components/cardDetail/CardDetail › should show add comments tour tip
  ● components/cardDetail/CardDetail › should show add properties tour tip
  ● components/cardDetail/SubCards › hides add button at max depth
  ● components/cardDialog › already following card
  ● components/cardDialog › limited card shows hidden view (no toolbar)
  ● components/cardDialog › return a cardDialog readonly
  ● components/cardDialog › return cardDialog and do a close action
  ● components/cardDialog › return cardDialog menu content
  ● components/cardDialog › return cardDialog menu content and cancel delete confirmation do nothing
  ● components/cardDialog › return cardDialog menu content and do a New template from card
  ● components/cardDialog › return cardDialog menu content and do a copy Link
  ● components/cardDialog › return cardDialog menu content and verify delete action
  ● components/cardDialog › should match snapshot
  ● components/cardDialog › should match snapshot without permissions
  ● components/content/checkboxElement › should add new checkbox when enter pressed
  ● components/content/checkboxElement › should change title
  ● components/content/checkboxElement › should delete automatically added checkbox with empty title on esc/enter pressed
  ● components/content/checkboxElement › should toggle value
  ● components/contentBlock › return commentBlock and click delete
  ● components/contentBlock › return commentBlock and click delete with another contentOrder
  ● components/contentBlock › return commentBlock and click move down
  ● components/contentBlock › return commentBlock and click move up
  ● components/flashMessages › renders a flash message with low severity and check onClick on flash works
  ● components/messages/VersionMessage › show message, click close
  ● components/modal › return Modal and close
  ● components/sidebarSidebar › should assign default category if current board doesnt have a category
  ● components/table/Table extended › should delete snapshot
  ● components/table/Table extended › should have Duplicate Button
  ● components/table/Table extended › should match snapshot with CreatedBy
  ● components/table/Table extended › should match snapshot with UpdatedAt
  ● components/table/Table extended › should match snapshot with UpdatedBy
  ● components/table/TableRow › should match snapshot
  ● components/table/TableRow › should match snapshot, collapsed tree
  ● components/table/TableRow › should match snapshot, display properties
  ● components/table/TableRow › should match snapshot, isSelected
  ● components/table/TableRow › should match snapshot, resizing column
  ● components/table/TableRows › should match snapshot, fire events
  ● components/viewHeader/dateFilter › handle clear
  ● components/viewHeader/dateFilter › set via text input
  ● components/viewHeader/emptyCardButton › return EmptyCardButton and Set Template
  ● components/viewHeader/newCardButton › return NewCardButton
  ● components/viewHeader/newCardButton › return NewCardButton and addCard
  ● components/viewHeader/newCardButton › return NewCardButton and addCardTemplate
  ● components/viewHeader/newCardButtonTemplateItem › return NewCardButtonTemplateItem
  ● components/viewHeader/newCardButtonTemplateItem › return NewCardButtonTemplateItem and Set as default
  ● components/viewHeader/newCardButtonTemplateItem › return NewCardButtonTemplateItem and delete
  ● components/viewHeader/newCardButtonTemplateItem › return NewCardButtonTemplateItem and edit
  ● components/viewHeader/viewHeader › return viewHeader
  ● components/viewHeader/viewHeader › return viewHeader readonly
  ● components/viewHeader/viewHeader › return viewHeader without permissions
  ● components/viewHeader/viewHeaderGroupByMenu › For viewType table render only HideEmptyGroupsButton when hiddenGroups is empty
  ● components/viewHeader/viewHeaderGroupByMenu › For viewType table render only ShowHiddenGroupsButton when there are no emptyGroups
  ● components/viewHeader/viewHeaderGroupByMenu › return groupBy menu and groupBy Status
  ● components/viewHeader/viewHeaderGroupByMenu › return groupBy menu, hideEmptyGroups and ungroup in viewType table
  ● components/viewHeader/viewHeaderPropertiesMenu › return properties menu
  ● components/viewHeader/viewHeaderPropertiesMenu › return properties menu with gallery typeview
  ● components/viewHeader/viewHeaderSortMenu › return sort menu
  ● components/viewTitle › add random icon
  ● components/viewTitle › hide description
  ● components/viewTitle › should match snapshot
  ● components/viewTitle › should match snapshot readonly
  ● components/viewTitle › show description
  ● getValidEmojiData › should return correct metadata for a complex emoji (e.g. skin tone)
  ● getValidEmojiData › should return null for an invalid emoji
  ● getValidEmojiData › should return valid emoji data for a known emoji
  ● properties/createdBy › should match snapshot
  ● properties/createdBy › should match snapshot as guest
  ● properties/dateRange › set via text input
  ● properties/dateRange › set via text input, es locale
  ● properties/link › should allow to edit link url
  ● properties/link › should change to link after entering url
  ● properties/multiperson › not readonly
  ● properties/multiperson › not readonly not existing user
  ● properties/multiperson › readonly view
  ● properties/multiperson › user dropdown open
  ● properties/number › should fire change event when valid number value is entered
  ● properties/person › not readOnly not existing user
  ● properties/person › not readOnly, show me
  ● properties/person › not readOnly, show modal
  ● properties/person › not readonly
  ● properties/person › not readonly guest user
  ● properties/person › readonly view
  ● properties/person › select user - cancel
  ● properties/person › select user - confirm
  ● properties/person › user dropdown open
  ● properties/updatedBy › does not crash when latest content and comment are missing
  ● properties/updatedBy › should match snapshot
  ● src/component/kanban/kanban › return kanban and change card column
  ● src/component/kanban/kanban › return kanban and change card column to hidden column
  ● src/component/kanban/kanban › return kanban and click on KanbanCalculationMenu
  ● src/component/kanban/kanban › return kanban and click on New
  ● src/component/kanban/kanban › return kanban and click on New if view have already have defaultTemplateId
  ● src/component/kanban/kanban › return kanban and drag card to other card 
  ● src/component/kanban/kanban › should match snapshot
  ● src/component/kanban/kanban › should match snapshot without permissions
  ● src/components/gallery/Gallery › return Gallery and click new
  ● src/components/gallery/GalleryCard › with a comment content › should match snapshot
  ● src/components/gallery/GalleryCard › with many contents › should match snapshot
  ● src/components/gallery/GalleryCard › with many images content › should match snapshot with only first image
  ● src/components/gallery/GalleryCard › without block content › return GalleryCard and click on it
  ● src/components/gallery/GalleryCard › without block content › should match snapshot
  ● src/components/kanban/kanbanCard › return kanbanCard and click on copy link menu 
  ● src/components/kanban/kanbanCard › return kanbanCard and click on delete menu 
  ● src/components/kanban/kanbanCard › return kanbanCard and click on duplicate menu 
  ● src/components/kanban/kanbanCard › should match snapshot
  ● src/components/shareBoard/channelPermissionsRow › should match snapshot in plugin mode
  ● src/components/shareBoard/channelPermissionsRow › should match snapshot in template
  ● src/components/shareBoard/channelPermissionsRow › should match snapshot with menu open
  ● src/components/shareBoard/shareBoard › confirm unlinking linked channel
  ● src/components/shareBoard/shareBoard › return shareBoard and click Copy link
  ● src/components/shareBoard/shareBoard › return shareBoard and click Regenerate token
  ● src/components/shareBoard/shareBoard › return shareBoard, and click switch
  ● src/components/shareBoard/shareBoard › return shareBoardComponent and click Switch without sharing (null sharing)
  ● src/components/shareBoard/teamPermissionsRow › should match snapshot
  ● src/components/shareBoard/teamPermissionsRow › should match snapshot in plugin mode
  ● src/components/shareBoard/teamPermissionsRow › should match snapshot in template
  ● src/components/shareBoard/userPermissionsRow › should match snapshot
  ● src/components/shareBoard/userPermissionsRow › should match snapshot in plugin mode
  ● src/components/shareBoard/userPermissionsRow › should match snapshot in template
  ● src/components/shareBoard/userPermissionsRow › should match snapshot-admin
  ● widgets/PropertyMenu › should match snapshot
```
</details>

이 기능이 손대는 스위트 중 기준선에서 이미 실패하는 것: viewHeader.test.tsx, emptyCardButton.test.tsx, newCardButtonTemplateItem.test.tsx, kanban.test.tsx, shareBoard.test.tsx, flashMessages.test.tsx. 새로 추가하는 테스트는 **테스트 이름 기준**으로 통과를 확인하고, 기존 실패는 그대로 둔다.

## webapp — `npm run check-types` (exit=2)

`error TS` 23건

```
      6 src/components/centerPanel.test.tsx
      1 src/components/emojiIcon.tsx
      2 src/components/table/tableRow.test.tsx
      1 src/csvExporter.test.ts
      2 src/index.tsx
      6 src/mmStore.ts
      2 src/mutator.ts
      1 src/utils/emojiUtils.test.ts
      1 src/widgets/emojiPicker.tsx
      1 src/widgets/menuWrapper.tsx
```

## webapp — `npm run check` (exit=1)

```
✖ 2449 problems (2449 errors, 0 warnings)
```

## 재현

```bash
make server-test 2>&1 | grep -E '^\s*--- FAIL' | sed -E 's/ \([0-9.]+s\)$//' | sort -u
cd webapp && CI=true npm run test 2>&1 | grep -E '^  ● ' | grep -v Console | sort -u
npm run check-types 2>&1 | grep -c 'error TS'
npm run check 2>&1 | grep -E '^✖'
```
