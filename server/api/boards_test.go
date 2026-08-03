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
	"github.com/mattermost/mattermost-plugin-boards/server/utils"
)

// Contract tests for the rule saving half of
// specs/002-card-property-access/contracts/property-access-rules.md.
//
// Rules ride along the existing board patch route, so these exercise
// handlePatchBoard rather than an endpoint of their own (research.md R8).

const (
	ruleBoardID = "board-1"
	ruleTeamID  = "team-1"
)

// validRule is a rule row that passes every validation check, so a test can
// change one field and be sure that field is what the assertion is about.
func validRule() map[string]interface{} {
	return map[string]interface{}{
		"id":              "r1",
		"propertyId":      "prop-clevel",
		"propertyValueId": "opt-strategy",
		"divisionId":      "div-strategy",
		"departmentId":    "",
		"dutyId":          "",
		"permission":      "viewer",
	}
}

func patchBodyWithAccess(t *testing.T, access map[string]interface{}) []byte {
	t.Helper()

	body, err := json.Marshal(map[string]interface{}{
		"updatedProperties": map[string]interface{}{
			model.PropertyAccessKey: access,
		},
	})
	require.NoError(t, err)
	return body
}

func boardWithProperties(properties map[string]interface{}) *model.Board {
	if properties == nil {
		properties = map[string]interface{}{}
	}
	return &model.Board{ID: ruleBoardID, TeamID: ruleTeamID, Properties: properties}
}

func TestPatchBoardPropertyAccess(t *testing.T) {
	t.Run("S-01 rejects a caller who cannot manage board roles", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(nil), nil)

		body := patchBodyWithAccess(t, map[string]interface{}{
			"enabled": true,
			"rules":   []interface{}{validRule()},
		})

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"editor", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("S-02 and S-03 overwrite the client's updatedBy and updatedAt", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(nil), nil)

		var saved *model.PropertyAccessSettings
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "admin").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				var err error
				saved, err = model.PropertyAccessSettingsFromProperties(patch.UpdatedProperties)
				require.NoError(t, err)
				return patch.Patch(boardWithProperties(nil)), nil
			})

		before := utils.GetMillis()
		body := patchBodyWithAccess(t, map[string]interface{}{
			"enabled":   true,
			"updatedBy": "someone-else",
			"updatedAt": 1,
			"rules":     []interface{}{validRule()},
		})

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"admin", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusOK, rec.Code)
		require.NotNil(t, saved)
		require.Equal(t, "admin", saved.UpdatedBy, "S-02 the session user replaces whatever was sent")
		require.GreaterOrEqual(t, saved.UpdatedAt, before, "S-03 the server clock replaces whatever was sent")
	})

	t.Run("S-04 rejects a rule with no subject condition", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(nil), nil)

		rule := validRule()
		rule["divisionId"] = ""

		body := patchBodyWithAccess(t, map[string]interface{}{
			"enabled": true,
			"rules":   []interface{}{rule},
		})

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"admin", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("S-05 rejects a permission outside the ladder", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(nil), nil)

		rule := validRule()
		rule["permission"] = "manage"

		body := patchBodyWithAccess(t, map[string]interface{}{
			"enabled": true,
			"rules":   []interface{}{rule},
		})

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"admin", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusBadRequest, rec.Code,
			"rules may never grant manage — that stays with board admins")
	})

	t.Run("S-06 strips the removed ACL feature's leftover keys", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)

		leftovers := map[string]interface{}{}
		for _, key := range model.LegacyAccessKeys {
			leftovers[key] = "stale"
		}
		leftovers["theme"] = "dark"
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(leftovers), nil)

		var result *model.Board
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "admin").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				result = patch.Patch(boardWithProperties(leftovers))
				return result, nil
			})

		body := patchBodyWithAccess(t, map[string]interface{}{
			"enabled": true,
			"rules":   []interface{}{validRule()},
		})

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"admin", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusOK, rec.Code)
		require.NotNil(t, result)
		for _, key := range model.LegacyAccessKeys {
			require.NotContains(t, result.Properties, key)
		}
		require.Equal(t, "dark", result.Properties["theme"], "unrelated properties survive")
	})

	t.Run("S-07 returns the rules unchanged in the response board", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(nil), nil)
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "admin").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				return patch.Patch(boardWithProperties(nil)), nil
			})

		body := patchBodyWithAccess(t, map[string]interface{}{
			"enabled": true,
			"rules":   []interface{}{validRule()},
		})

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"admin", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusOK, rec.Code)

		var board model.Board
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &board))

		settings, err := model.PropertyAccessSettingsFromProperties(board.Properties)
		require.NoError(t, err)
		require.NotNil(t, settings)
		require.True(t, settings.Enabled)
		require.Len(t, settings.Rules, 1)
		require.Equal(t, "prop-clevel", settings.Rules[0].PropertyID)
		require.Equal(t, "div-strategy", settings.Rules[0].DivisionID)
		require.Equal(t, model.PropertyAccessViewer, settings.Rules[0].Permission)
	})

	t.Run("a patch that does not touch the rules needs no role management", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(nil), nil)
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "editor").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				return patch.Patch(boardWithProperties(nil)), nil
			})

		title := "renamed"
		body, err := json.Marshal(&model.BoardPatch{Title: &title})
		require.NoError(t, err)

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"editor", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusOK, rec.Code)
	})
}
