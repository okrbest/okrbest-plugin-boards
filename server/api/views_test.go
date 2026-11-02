// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// The admin's cleanup list for private views
// (specs/022-view-permission/contracts/admin-private-views-api.md A-01~A-07).
// Nothing else reaches another person's private view; these two endpoints do,
// and only for a board admin.

const pvBoardID = "board-private-views"

func pvBoard() *model.Board {
	return &model.Board{ID: pvBoardID, TeamID: ruleTeamID}
}

func pvView(id, title, creator string, mode interface{}, deleteAt int64) *model.Block {
	fields := map[string]interface{}{"viewType": "table", "filter": map[string]interface{}{"operation": "and"}}
	if mode != nil {
		fields[model.ViewAccessModeKey] = mode
	}
	return &model.Block{
		ID: id, BoardID: pvBoardID, ParentID: pvBoardID, Type: model.TypeView,
		Title: title, CreatedBy: creator, CreateAt: 1700000000000, DeleteAt: deleteAt, Fields: fields,
	}
}

func allowAdmin(th *APITestHelper) {
	th.Permissions.allowBoard("admin", pvBoardID)
}

func allowEditor(th *APITestHelper, userID string) {
	th.Permissions.allowBoard(userID, pvBoardID)
	th.Permissions.denyBoardPermission(userID, pvBoardID, model.PermissionManageBoardRoles)
}

func TestGetPrivateViews(t *testing.T) {
	vars := map[string]string{"boardID": pvBoardID}
	path := "/boards/" + pvBoardID + "/views/private"

	t.Run("A-01 an admin sees the private views, sorted, without their configuration", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		allowAdmin(th)
		th.Store.EXPECT().GetBoard(pvBoardID).Return(pvBoard(), nil).AnyTimes()
		th.Store.EXPECT().GetBlocksWithType(pvBoardID, model.TypeView).Return([]*model.Block{
			pvView("view-alice", "B alice's", "alice", "private", 0),
			pvView("view-shared", "shared", "alice", nil, 0),
			pvView("view-bob", "A bob's", "bob", "private", 0),
			pvView("view-gone", "deleted", "carol", "private", 1700000000001),
		}, nil)

		rec := th.callHandler(th.API.handleGetPrivateViews, path, "admin", vars)

		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var summaries []map[string]interface{}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &summaries))
		require.Len(t, summaries, 2)
		require.Equal(t, "A bob's", summaries[0]["title"])
		require.Equal(t, "bob", summaries[0]["createdBy"])
		require.Equal(t, "view-bob", summaries[0]["id"])
		require.EqualValues(t, 1700000000000, summaries[0]["createAt"])
		require.Equal(t, "B alice's", summaries[1]["title"])
		for _, summary := range summaries {
			_, carriesFields := summary["fields"]
			require.False(t, carriesFields, "the list must not reveal what the view shows")
		}
	})

	t.Run("A-02 an editor is refused", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		allowEditor(th, "editor")
		th.Store.EXPECT().GetBoard(pvBoardID).Return(pvBoard(), nil).AnyTimes()

		rec := th.callHandler(th.API.handleGetPrivateViews, path, "editor", vars)

		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	})

	t.Run("A-03 a board without private views answers an empty list", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		allowAdmin(th)
		th.Store.EXPECT().GetBoard(pvBoardID).Return(pvBoard(), nil).AnyTimes()
		th.Store.EXPECT().GetBlocksWithType(pvBoardID, model.TypeView).Return([]*model.Block{
			pvView("view-shared", "shared", "alice", nil, 0),
		}, nil)

		rec := th.callHandler(th.API.handleGetPrivateViews, path, "admin", vars)

		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, "[]", rec.Body.String())
	})
}

func TestDeletePrivateView(t *testing.T) {
	vars := map[string]string{"boardID": pvBoardID, "viewID": "view-alice"}
	path := "/boards/" + pvBoardID + "/views/private/view-alice"

	t.Run("A-04 an admin deletes a private view", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		allowAdmin(th)
		th.Store.EXPECT().GetBoard(pvBoardID).Return(pvBoard(), nil).AnyTimes()
		th.Store.EXPECT().GetBlock("view-alice").Return(pvView("view-alice", "alice's", "alice", "private", 0), nil).AnyTimes()
		th.Store.EXPECT().DeleteBlock("view-alice", "admin").Return(nil)

		rec := th.callHandlerWithBody(th.API.handleDeletePrivateView, http.MethodDelete, path, "admin", vars, nil)

		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	})

	t.Run("A-05 an editor is refused", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		allowEditor(th, "editor")
		th.Store.EXPECT().GetBoard(pvBoardID).Return(pvBoard(), nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handleDeletePrivateView, http.MethodDelete, path, "editor", vars, nil)

		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	})

	t.Run("A-06 a shared view is not reachable through this path", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		allowAdmin(th)
		th.Store.EXPECT().GetBoard(pvBoardID).Return(pvBoard(), nil).AnyTimes()
		th.Store.EXPECT().GetBlock("view-alice").Return(pvView("view-alice", "shared after all", "alice", nil, 0), nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handleDeletePrivateView, http.MethodDelete, path, "admin", vars, nil)

		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	})

	t.Run("A-07 a view of another board is not found here", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		allowAdmin(th)
		th.Store.EXPECT().GetBoard(pvBoardID).Return(pvBoard(), nil).AnyTimes()
		elsewhere := pvView("view-alice", "alice's", "alice", "private", 0)
		elsewhere.BoardID = "board-elsewhere"
		th.Store.EXPECT().GetBlock("view-alice").Return(elsewhere, nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handleDeletePrivateView, http.MethodDelete, path, "admin", vars, nil)

		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	})
}
