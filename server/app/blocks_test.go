// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"database/sql"
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	mmModel "github.com/mattermost/mattermost/server/public/model"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

type blockError struct {
	msg string
}

func (be blockError) Error() string {
	return be.msg
}

func TestInsertBlock(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("success scenario", func(t *testing.T) {
		boardID := testBoardID
		block := &model.Block{BoardID: boardID}
		board := &model.Board{ID: boardID}
		th.Store.EXPECT().GetBoard(boardID).Return(board, nil)
		th.Store.EXPECT().InsertBlock(block, "user-id-1").Return(nil)
		th.Store.EXPECT().GetMembersForBoard(boardID).Return([]*model.BoardMember{}, nil)
		err := th.App.InsertBlock(block, "user-id-1")
		require.NoError(t, err)
	})

	t.Run("error scenario", func(t *testing.T) {
		boardID := testBoardID
		block := &model.Block{BoardID: boardID}
		board := &model.Board{ID: boardID}
		th.Store.EXPECT().GetBoard(boardID).Return(board, nil)
		th.Store.EXPECT().InsertBlock(block, "user-id-1").Return(blockError{"error"})
		err := th.App.InsertBlock(block, "user-id-1")
		require.Error(t, err, "error")
	})
}

func TestPatchBlocks(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("patchBlocks success scenario", func(t *testing.T) {
		blockPatches := model.BlockPatchBatch{
			BlockIDs: []string{"block1"},
			BlockPatches: []model.BlockPatch{
				{Title: mmModel.NewPointer("new title")},
			},
		}

		block1 := &model.Block{ID: "block1"}
		th.Store.EXPECT().GetBlocksByIDs([]string{"block1"}).Return([]*model.Block{block1}, nil)
		th.Store.EXPECT().PatchBlocks(gomock.Eq(&blockPatches), gomock.Eq("user-id-1")).Return(nil)
		th.Store.EXPECT().GetBlock("block1").Return(block1, nil)
		// this call comes from the WS server notification
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).Times(1)
		err := th.App.PatchBlocks("team-id", &blockPatches, "user-id-1")
		require.NoError(t, err)
	})

	t.Run("patchBlocks error scenario", func(t *testing.T) {
		blockPatches := model.BlockPatchBatch{BlockIDs: []string{}}
		th.Store.EXPECT().GetBlocksByIDs([]string{}).Return(nil, sql.ErrNoRows)
		err := th.App.PatchBlocks("team-id", &blockPatches, "user-id-1")
		require.ErrorIs(t, err, sql.ErrNoRows)
	})

	t.Run("cloud limit error scenario", func(t *testing.T) {
		t.Skipf("The Cloud Limits feature has been disabled")

		th.App.SetCardLimit(5)

		fakeLicense := &mmModel.License{
			Features: &mmModel.Features{Cloud: mmModel.NewPointer(true)},
		}

		blockPatches := model.BlockPatchBatch{
			BlockIDs: []string{"block1"},
			BlockPatches: []model.BlockPatch{
				{Title: mmModel.NewPointer("new title")},
			},
		}

		block1 := &model.Block{
			ID:       "block1",
			Type:     model.TypeCard,
			ParentID: "board-id",
			BoardID:  "board-id",
			UpdateAt: 100,
		}

		board1 := &model.Board{
			ID:   "board-id",
			Type: model.BoardTypeOpen,
		}

		th.Store.EXPECT().GetBlocksByIDs([]string{"block1"}).Return([]*model.Block{block1}, nil)
		th.Store.EXPECT().GetBoard("board-id").Return(board1, nil)
		th.Store.EXPECT().GetLicense().Return(fakeLicense)
		th.Store.EXPECT().GetCardLimitTimestamp().Return(int64(150), nil)
		err := th.App.PatchBlocks("team-id", &blockPatches, "user-id-1")
		require.ErrorIs(t, err, model.ErrPatchUpdatesLimitedCards)
	})
}

func TestDeleteBlock(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("success scenario", func(t *testing.T) {
		boardID := testBoardID
		board := &model.Board{ID: boardID}
		block := &model.Block{
			ID:      "block-id",
			BoardID: board.ID,
		}
		th.Store.EXPECT().GetBlock(gomock.Eq("block-id")).Return(block, nil)
		th.Store.EXPECT().DeleteBlock(gomock.Eq("block-id"), gomock.Eq("user-id-1")).Return(nil)
		th.Store.EXPECT().GetBoard(gomock.Eq(testBoardID)).Return(board, nil)
		th.Store.EXPECT().GetMembersForBoard(boardID).Return([]*model.BoardMember{}, nil)
		err := th.App.DeleteBlock("block-id", "user-id-1")
		require.NoError(t, err)
	})

	t.Run("error scenario", func(t *testing.T) {
		boardID := testBoardID
		board := &model.Board{ID: boardID}
		block := &model.Block{
			ID:      "block-id",
			BoardID: board.ID,
		}
		th.Store.EXPECT().GetBlock(gomock.Eq("block-id")).Return(block, nil)
		th.Store.EXPECT().DeleteBlock(gomock.Eq("block-id"), gomock.Eq("user-id-1")).Return(blockError{"error"})
		th.Store.EXPECT().GetBoard(gomock.Eq(testBoardID)).Return(board, nil)
		err := th.App.DeleteBlock("block-id", "user-id-1")
		require.Error(t, err, "error")
	})

	t.Run("deleting a card also deletes its descendant sub-cards", func(t *testing.T) {
		boardID := testBoardID
		board := &model.Board{ID: boardID}
		parent := &model.Block{ID: "parent-card", BoardID: boardID, Type: model.TypeCard}
		child := &model.Block{ID: "child-card", ParentID: "parent-card", BoardID: boardID, Type: model.TypeCard}
		grandchild := &model.Block{ID: "grandchild-card", ParentID: "child-card", BoardID: boardID, Type: model.TypeCard}

		subCardQuery := func(parentID string) model.QueryBlocksOptions {
			return model.QueryBlocksOptions{ParentID: parentID, BlockType: model.TypeCard, PerPage: -1}
		}

		th.Store.EXPECT().GetBlock(gomock.Eq("parent-card")).Return(parent, nil)
		th.Store.EXPECT().GetBlock(gomock.Eq("child-card")).Return(child, nil)
		th.Store.EXPECT().GetBlock(gomock.Eq("grandchild-card")).Return(grandchild, nil)
		th.Store.EXPECT().GetBoard(gomock.Eq(boardID)).Return(board, nil).AnyTimes()
		th.Store.EXPECT().GetMembersForBoard(boardID).Return([]*model.BoardMember{}, nil).AnyTimes()

		th.Store.EXPECT().GetBlocks(gomock.Eq(subCardQuery("parent-card"))).Return([]*model.Block{child}, nil)
		th.Store.EXPECT().GetBlocks(gomock.Eq(subCardQuery("child-card"))).Return([]*model.Block{grandchild}, nil)
		th.Store.EXPECT().GetBlocks(gomock.Eq(subCardQuery("grandchild-card"))).Return([]*model.Block{}, nil)

		// 자손부터 지우고 마지막에 부모를 지운다 — 중간 상태에서도 고아가 생기지 않는다.
		gomock.InOrder(
			th.Store.EXPECT().DeleteBlock(gomock.Eq("grandchild-card"), gomock.Eq("user-id-1")).Return(nil),
			th.Store.EXPECT().DeleteBlock(gomock.Eq("child-card"), gomock.Eq("user-id-1")).Return(nil),
			th.Store.EXPECT().DeleteBlock(gomock.Eq("parent-card"), gomock.Eq("user-id-1")).Return(nil),
		)
		th.Store.EXPECT().DeleteBlockSuiteDocByCardID(gomock.Any()).Return(nil).Times(3)

		err := th.App.DeleteBlock("parent-card", "user-id-1")
		require.NoError(t, err)
	})

	t.Run("deleting a non-card block does not look for sub-cards", func(t *testing.T) {
		boardID := testBoardID
		board := &model.Board{ID: boardID}
		block := &model.Block{ID: "text-block", BoardID: boardID, Type: model.TypeText}

		th.Store.EXPECT().GetBlock(gomock.Eq("text-block")).Return(block, nil)
		// AnyTimes: the sub-card subtest above already registered an open-ended
		// GetBoard expectation on the shared controller, which absorbs this call.
		th.Store.EXPECT().GetBoard(gomock.Eq(boardID)).Return(board, nil).AnyTimes()
		th.Store.EXPECT().GetMembersForBoard(boardID).Return([]*model.BoardMember{}, nil).AnyTimes()
		th.Store.EXPECT().DeleteBlock(gomock.Eq("text-block"), gomock.Eq("user-id-1")).Return(nil)

		err := th.App.DeleteBlock("text-block", "user-id-1")
		require.NoError(t, err)
	})
}

func TestUndeleteBlock(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("success scenario", func(t *testing.T) {
		boardID := testBoardID
		board := &model.Board{ID: boardID}
		block := &model.Block{
			ID:      "block-id",
			BoardID: board.ID,
		}
		th.Store.EXPECT().GetBlockHistory(
			gomock.Eq("block-id"),
			gomock.Eq(model.QueryBlockHistoryOptions{Limit: 1, Descending: true}),
		).Return([]*model.Block{block}, nil)
		th.Store.EXPECT().UndeleteBlock(gomock.Eq("block-id"), gomock.Eq("user-id-1")).Return(nil)
		th.Store.EXPECT().GetBlock(gomock.Eq("block-id")).Return(block, nil)
		th.Store.EXPECT().GetBoard(boardID).Return(board, nil)
		th.Store.EXPECT().GetMembersForBoard(boardID).Return([]*model.BoardMember{}, nil)
		_, err := th.App.UndeleteBlock("block-id", "user-id-1")
		require.NoError(t, err)
	})

	t.Run("error scenario", func(t *testing.T) {
		block := &model.Block{
			ID: "block-id",
		}
		th.Store.EXPECT().GetBlockHistory(
			gomock.Eq("block-id"),
			gomock.Eq(model.QueryBlockHistoryOptions{Limit: 1, Descending: true}),
		).Return([]*model.Block{block}, nil)
		th.Store.EXPECT().UndeleteBlock(gomock.Eq("block-id"), gomock.Eq("user-id-1")).Return(blockError{"error"})
		_, err := th.App.UndeleteBlock("block-id", "user-id-1")
		require.Error(t, err, "error")
	})
}

func TestInsertBlocks(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("success scenario", func(t *testing.T) {
		boardID := testBoardID
		block := &model.Block{BoardID: boardID}
		board := &model.Board{ID: boardID}
		th.Store.EXPECT().GetBoard(boardID).Return(board, nil)
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block not found"))
		th.Store.EXPECT().InsertBlock(block, "user-id-1").Return(nil)
		th.Store.EXPECT().GetMembersForBoard(boardID).Return([]*model.BoardMember{}, nil)
		_, err := th.App.InsertBlocks([]*model.Block{block}, "user-id-1")
		require.NoError(t, err)
	})

	t.Run("error scenario", func(t *testing.T) {
		boardID := testBoardID
		block := &model.Block{BoardID: boardID}
		board := &model.Board{ID: boardID}
		th.Store.EXPECT().GetBoard(boardID).Return(board, nil)
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block not found"))
		th.Store.EXPECT().InsertBlock(block, "user-id-1").Return(blockError{"error"})
		_, err := th.App.InsertBlocks([]*model.Block{block}, "user-id-1")
		require.Error(t, err, "error")
	})

	t.Run("create view within limits", func(t *testing.T) {
		t.Skipf("The Cloud Limits feature has been disabled")

		boardID := testBoardID
		block := &model.Block{
			Type:     model.TypeView,
			ParentID: "parent_id",
			BoardID:  boardID,
		}
		board := &model.Board{ID: boardID}
		th.Store.EXPECT().GetBoard(boardID).Return(board, nil)
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block not found"))
		th.Store.EXPECT().InsertBlock(block, "user-id-1").Return(nil)
		th.Store.EXPECT().GetMembersForBoard(boardID).Return([]*model.BoardMember{}, nil)

		// setting up mocks for limits
		fakeLicense := &mmModel.License{
			Features: &mmModel.Features{Cloud: mmModel.NewPointer(true)},
		}
		th.Store.EXPECT().GetLicense().Return(fakeLicense)

		th.Store.EXPECT().GetUsedCardsCount().Return(1, nil)
		th.Store.EXPECT().GetCardLimitTimestamp().Return(int64(1), nil)
		th.Store.EXPECT().GetBlocksWithParentAndType("test-board-id", "parent_id", "view").Return([]*model.Block{{}}, nil)

		_, err := th.App.InsertBlocks([]*model.Block{block}, "user-id-1")
		require.NoError(t, err)
	})

	t.Run("create view exceeding limits", func(t *testing.T) {
		t.Skipf("The Cloud Limits feature has been disabled")

		boardID := testBoardID
		block := &model.Block{
			Type:     model.TypeView,
			ParentID: "parent_id",
			BoardID:  boardID,
		}
		board := &model.Board{ID: boardID}
		th.Store.EXPECT().GetBoard(boardID).Return(board, nil)
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block not found"))

		// setting up mocks for limits
		fakeLicense := &mmModel.License{
			Features: &mmModel.Features{Cloud: mmModel.NewPointer(true)},
		}
		th.Store.EXPECT().GetLicense().Return(fakeLicense)

		th.Store.EXPECT().GetUsedCardsCount().Return(1, nil)
		th.Store.EXPECT().GetCardLimitTimestamp().Return(int64(1), nil)
		th.Store.EXPECT().GetBlocksWithParentAndType("test-board-id", "parent_id", "view").Return([]*model.Block{{}, {}}, nil)

		_, err := th.App.InsertBlocks([]*model.Block{block}, "user-id-1")
		require.Error(t, err)
	})

	t.Run("creating multiple views, reaching limit in the process", func(t *testing.T) {
		t.Skipf("Will be fixed soon")

		boardID := testBoardID
		view1 := &model.Block{
			Type:     model.TypeView,
			ParentID: "parent_id",
			BoardID:  boardID,
		}

		view2 := &model.Block{
			Type:     model.TypeView,
			ParentID: "parent_id",
			BoardID:  boardID,
		}

		board := &model.Board{ID: boardID}
		th.Store.EXPECT().GetBoard(boardID).Return(board, nil)
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block not found")).Times(2)
		th.Store.EXPECT().InsertBlock(view1, "user-id-1").Return(nil).Times(2)
		th.Store.EXPECT().GetMembersForBoard(boardID).Return([]*model.BoardMember{}, nil).Times(2)

		// setting up mocks for limits
		fakeLicense := &mmModel.License{
			Features: &mmModel.Features{Cloud: mmModel.NewPointer(true)},
		}
		th.Store.EXPECT().GetLicense().Return(fakeLicense).Times(2)

		th.Store.EXPECT().GetUsedCardsCount().Return(1, nil).Times(2)
		th.Store.EXPECT().GetCardLimitTimestamp().Return(int64(1), nil).Times(2)
		th.Store.EXPECT().GetBlocksWithParentAndType("test-board-id", "parent_id", "view").Return([]*model.Block{{}}, nil).Times(2)

		_, err := th.App.InsertBlocks([]*model.Block{view1, view2}, "user-id-1")
		require.Error(t, err)
	})
}

func TestFilterAuthorizedFilesForBoard(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("should allow files referenced by blocks in history", func(t *testing.T) {
		boardID := "board-1"
		fileID := "file-123"
		storedFileID := "7" + fileID + ".png" // Format: {prefix}{fileID}.{extension}

		// Mock: Block history shows this fileId was used on this board
		historicalBlock := &model.Block{
			ID:      "block-1",
			BoardID: boardID,
			Type:    model.TypeImage,
			Fields: map[string]interface{}{
				model.BlockFieldFileId: storedFileID,
			},
		}

		th.Store.EXPECT().GetBlockHistoryDescendants(boardID, gomock.Any()).Return([]*model.Block{historicalBlock}, nil)

		authorized, err := th.App.filterAuthorizedFilesForBoard(boardID, []string{fileID})
		require.NoError(t, err)
		require.Len(t, authorized, 1)
		require.Equal(t, fileID, authorized[0])
	})

	t.Run("should block files from a different board", func(t *testing.T) {
		boardID := "board-1"
		fileID := "file-from-other-board"

		// Mock: No blocks in history reference this file (file belongs to different board)
		th.Store.EXPECT().GetBlockHistoryDescendants(boardID, gomock.Any()).Return([]*model.Block{}, nil)

		authorized, err := th.App.filterAuthorizedFilesForBoard(boardID, []string{fileID})
		require.NoError(t, err)
		require.Len(t, authorized, 0) // File should be blocked
	})

	t.Run("should allow files from attachment blocks via history", func(t *testing.T) {
		boardID := "board-1"
		fileID := "file-456"
		storedFileID := "7" + fileID + ".pdf"

		// Mock: Block history shows this file was used as attachment on this board
		historicalBlock := &model.Block{
			ID:      "deleted-block-1",
			BoardID: boardID,
			Type:    model.TypeAttachment,
			Fields: map[string]interface{}{
				model.BlockFieldFileId: storedFileID,
			},
		}
		th.Store.EXPECT().GetBlockHistoryDescendants(boardID, gomock.Any()).Return([]*model.Block{historicalBlock}, nil)

		authorized, err := th.App.filterAuthorizedFilesForBoard(boardID, []string{fileID})
		require.NoError(t, err)
		require.Len(t, authorized, 1)
		require.Equal(t, fileID, authorized[0])
	})

	t.Run("should handle empty file list", func(t *testing.T) {
		boardID := "board-1"

		authorized, err := th.App.filterAuthorizedFilesForBoard(boardID, []string{})
		require.NoError(t, err)
		require.Len(t, authorized, 0)
	})

	t.Run("should filter mixed authorized and unauthorized files", func(t *testing.T) {
		boardID := "board-1"
		authorizedFile := "authorized-file"
		unauthorizedFile := "unauthorized-file"
		storedAuthorizedFile := "7" + authorizedFile + ".png"

		// Mock: History has authorizedFile but not unauthorizedFile
		imageBlock := &model.Block{
			ID:      "block-1",
			BoardID: boardID,
			Type:    model.TypeImage,
			Fields: map[string]interface{}{
				model.BlockFieldFileId: storedAuthorizedFile,
			},
		}

		th.Store.EXPECT().GetBlockHistoryDescendants(boardID, gomock.Any()).Return([]*model.Block{imageBlock}, nil)

		authorized, err := th.App.filterAuthorizedFilesForBoard(boardID, []string{authorizedFile, unauthorizedFile})
		require.NoError(t, err)
		require.Len(t, authorized, 1)
		require.Equal(t, authorizedFile, authorized[0])
	})
}
