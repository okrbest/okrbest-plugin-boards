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

// Block validation rejects IDs that are not in the generated format, so the
// board these tests act on carries a real one rather than a readable stand-in.
var (
	ruleBoardID = utils.NewID(utils.IDTypeBoard)
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

// Whether a board is used as an OKR board says what kind of board it is, which
// is a coarser statement than who may read which card. It is therefore barred at
// the same level as the access rules rather than at the looser bar that guards
// ordinary board properties.
func TestPatchBoardOkrBoard(t *testing.T) {
	okrSettings := map[string]interface{}{
		"propertyId": "prop-type",
		"levels":     []interface{}{"opt-objective", "opt-key-result", "opt-task"},
	}

	boardAsOkr := func() *model.Board {
		return boardWithProperties(map[string]interface{}{model.OkrBoardKey: okrSettings})
	}

	t.Run("an editor cannot switch a board into an OKR board", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(nil), nil).AnyTimes()

		body, err := json.Marshal(map[string]interface{}{
			"updatedProperties": map[string]interface{}{model.OkrBoardKey: okrSettings},
		})
		require.NoError(t, err)

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"editor", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("an editor cannot switch a board out of being an OKR board", func(t *testing.T) {
		// The screen sends the switch off as a deleted key, so a check that only
		// watched updatedProperties would let exactly the action this is about
		// straight through.
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardAsOkr(), nil).AnyTimes()

		body, err := json.Marshal(map[string]interface{}{
			"deletedProperties": []string{model.OkrBoardKey},
		})
		require.NoError(t, err)

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"editor", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("a board admin may switch it off", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardAsOkr(), nil).AnyTimes()
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "admin").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				return patch.Patch(boardAsOkr()), nil
			})

		body, err := json.Marshal(map[string]interface{}{
			"deletedProperties": []string{model.OkrBoardKey},
		})
		require.NoError(t, err)

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"admin", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusOK, rec.Code)

		var board model.Board
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &board))
		settings, err := model.OkrBoardSettingsFromProperties(board.Properties)
		require.NoError(t, err)
		require.Nil(t, settings)
	})
}

// 안전망 — 잠그지 않은 보드는 이 기능 도입 전과 같아야 한다 (spec US2).
//
// 지금 코드에서 통과한다. 앞으로 잠금 관문이 들어온 뒤에도 통과해야 하며, 붉어지면
// 관문이 잠그지 않은 보드까지 막고 있는 것이다.
func TestPatchBoardCardPropertiesUnlocked(t *testing.T) {
	cardProperty := func(id, name string) map[string]interface{} {
		return map[string]interface{}{"id": id, "name": name, "type": "text", "options": []interface{}{}}
	}

	t.Run("C-01 에디터가 카드 속성을 갱신한다", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(boardWithProperties(nil), nil).AnyTimes()
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "editor").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				return patch.Patch(boardWithProperties(nil)), nil
			})

		body, err := json.Marshal(map[string]interface{}{
			"updatedCardProperties": []interface{}{cardProperty("p-new", "새 속성")},
		})
		require.NoError(t, err)

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"editor", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusOK, rec.Code)
	})
}

// 잠긴 보드 — 카드 속성 편집이 보드 관리자 등급으로 올라간다 (spec US1).
func TestPatchBoardCardPropertiesLocked(t *testing.T) {
	lockedBoard := func() *model.Board {
		return boardWithProperties(map[string]interface{}{model.AdminOnlyCardPropertiesKey: true})
	}
	updateBody := func(t *testing.T) []byte {
		t.Helper()
		body, err := json.Marshal(map[string]interface{}{
			"updatedCardProperties": []interface{}{
				map[string]interface{}{"id": "p-new", "name": "새 속성", "type": "text", "options": []interface{}{}},
			},
		})
		require.NoError(t, err)
		return body
	}

	t.Run("C-03 에디터의 속성 갱신을 거절한다", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(lockedBoard(), nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"editor", map[string]string{"boardID": ruleBoardID}, updateBody(t))

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("C-05 보드 관리자의 속성 갱신을 통과시킨다", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(lockedBoard(), nil).AnyTimes()
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "admin").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				return patch.Patch(lockedBoard()), nil
			})

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"admin", map[string]string{"boardID": ruleBoardID}, updateBody(t))

		require.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("C-07 카드 속성을 안 건드리는 패치는 잠긴 보드에서도 통과한다", func(t *testing.T) {
		// 잠금은 보드가 무엇을 기록하는지를 잠근다. 보드 제목처럼 그 밖의 것은 이
		// 기능이 건드리지 않는다 (FR-016).
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(lockedBoard(), nil).AnyTimes()
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "editor").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				return patch.Patch(lockedBoard()), nil
			})

		title := "이름만 바꾼다"
		body, err := json.Marshal(&model.BoardPatch{Title: &title})
		require.NoError(t, err)

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"editor", map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("C-10 저장값이 스위치가 아니면 잠기지 않은 것으로 본다", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("editor", ruleBoardID)
		th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
		broken := boardWithProperties(map[string]interface{}{model.AdminOnlyCardPropertiesKey: "true"})
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(broken, nil).AnyTimes()
		th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "editor").
			DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
				return patch.Patch(broken), nil
			})

		rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
			"editor", map[string]string{"boardID": ruleBoardID}, updateBody(t))

		require.Equal(t, http.StatusOK, rec.Code)
	})
}

// 잠금을 켰다가 끈 보드도 잠기지 않은 보드다 (spec US2 수용 시나리오 3).
func TestPatchBoardCardPropertiesUnlockedAfterToggleOff(t *testing.T) {
	th, tearDown := setupAPITestHelper(t)
	defer tearDown()
	th.Permissions.allowBoard("editor", ruleBoardID)
	th.Permissions.denyBoardPermission("editor", ruleBoardID, model.PermissionManageBoardRoles)
	unlocked := boardWithProperties(map[string]interface{}{model.AdminOnlyCardPropertiesKey: false})
	th.Store.EXPECT().GetBoard(ruleBoardID).Return(unlocked, nil).AnyTimes()
	th.Store.EXPECT().PatchBoard(ruleBoardID, gomock.Any(), "editor").
		DoAndReturn(func(_ string, patch *model.BoardPatch, _ string) (*model.Board, error) {
			return patch.Patch(unlocked), nil
		})

	body, err := json.Marshal(map[string]interface{}{
		"updatedCardProperties": []interface{}{
			map[string]interface{}{"id": "p-new", "name": "새 속성", "type": "text", "options": []interface{}{}},
		},
	})
	require.NoError(t, err)

	rec := th.callHandlerWithBody(th.API.handlePatchBoard, http.MethodPatch, "/boards/"+ruleBoardID,
		"editor", map[string]string{"boardID": ruleBoardID}, body)

	require.Equal(t, http.StatusOK, rec.Code)
}
