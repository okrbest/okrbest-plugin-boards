// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// 묶음 경로의 안전망 — 잠그지 않은 보드는 이 기능 도입 전과 같아야 한다 (spec US2).
//
// 속성 삭제와 유형 변경은 보드와 카드를 함께 고쳐야 해서 이 경로로 온다
// (research.md R1). 보드 패치 경로만 막고 여기를 빠뜨리면 그 두 조작이 그대로
// 통과하면서 겉보기에는 기능이 도는 것처럼 보인다.
func TestPatchBoardsAndBlocksCardPropertiesUnlocked(t *testing.T) {
	t.Run("C-02 에디터가 카드 속성을 삭제한다", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)

		board := boardWithProperties(nil)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
		th.Store.EXPECT().GetBlocksByIDs(gomock.Any()).Return([]*model.Block{}, nil).AnyTimes()
		th.Store.EXPECT().PatchBoardsAndBlocks(gomock.Any(), "editor").
			Return(&model.BoardsAndBlocks{Boards: []*model.Board{board}}, nil)
		th.Store.EXPECT().GetMembersForBoard(ruleBoardID).Return([]*model.BoardMember{}, nil).AnyTimes()

		body, err := json.Marshal(map[string]interface{}{
			"boardIDs":     []string{ruleBoardID},
			"boardPatches": []interface{}{map[string]interface{}{"deletedCardProperties": []string{"p-old"}}},
			"blockIDs":     []string{},
			"blockPatches": []interface{}{},
		})
		require.NoError(t, err)

		rec := th.callHandlerWithBody(th.API.handlePatchBoardsAndBlocks, http.MethodPatch, "/boards-and-blocks",
			"editor", nil, body)

		require.Equal(t, http.StatusOK, rec.Code)
	})
}

// 잠긴 보드의 묶음 경로 — 속성 삭제와 유형 변경이 여기로 온다.
func TestPatchBoardsAndBlocksCardPropertiesLocked(t *testing.T) {
	lockedBoard := func() *model.Board {
		return boardWithProperties(map[string]interface{}{model.AdminOnlyCardPropertiesKey: true})
	}
	deleteBody := func(t *testing.T) []byte {
		t.Helper()
		body, err := json.Marshal(map[string]interface{}{
			"boardIDs":     []string{ruleBoardID},
			"boardPatches": []interface{}{map[string]interface{}{"deletedCardProperties": []string{"p-old"}}},
			"blockIDs":     []string{},
			"blockPatches": []interface{}{},
		})
		require.NoError(t, err)
		return body
	}

	t.Run("C-04 에디터의 속성 삭제를 거절한다", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(lockedBoard(), nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handlePatchBoardsAndBlocks, http.MethodPatch, "/boards-and-blocks",
			"editor", nil, deleteBody(t))

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("C-06 보드 관리자의 속성 삭제를 통과시킨다", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)
		board := lockedBoard()
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
		th.Store.EXPECT().GetBlocksByIDs(gomock.Any()).Return([]*model.Block{}, nil).AnyTimes()
		th.Store.EXPECT().PatchBoardsAndBlocks(gomock.Any(), "admin").
			Return(&model.BoardsAndBlocks{Boards: []*model.Board{board}}, nil)
		th.Store.EXPECT().GetMembersForBoard(ruleBoardID).Return([]*model.BoardMember{}, nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handlePatchBoardsAndBlocks, http.MethodPatch, "/boards-and-blocks",
			"admin", nil, deleteBody(t))

		require.Equal(t, http.StatusOK, rec.Code)
	})
}
