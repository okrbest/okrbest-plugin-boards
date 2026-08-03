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

// Enforcement contract tests for
// specs/002-card-property-access/contracts/property-access-rules.md §2.
//
// These live here rather than in server/integrationtests because that package
// needs a database carrying the main server's schema, which the test setup does
// not have. The rows they cover are E-01 through E-06.

const (
	accessPropertyID  = "prop-clevel"
	accessValueHidden = "opt-strategy"
	accessValueOpen   = "opt-production"

	accessDivision   = "div-strategy"
	accessDepartment = "dep-planning"

	hiddenCardID  = "card-hidden"
	openCardID    = "card-open"
	commentCardID = "comment-on-hidden"
)

// accessBoard is a board whose rule grants 전략본부 members viewer access to
// cards tagged 전략, and therefore hides those cards from everyone else.
func accessBoard(t *testing.T, enabled bool, permission model.PropertyAccessPermission) *model.Board {
	t.Helper()

	settings := &model.PropertyAccessSettings{
		Enabled: enabled,
		Rules: []model.PropertyAccessRule{{
			ID:              "r1",
			PropertyID:      accessPropertyID,
			PropertyValueID: accessValueHidden,
			DivisionID:      accessDivision,
			Permission:      permission,
		}},
	}
	value, err := settings.AsProperty()
	require.NoError(t, err)

	return &model.Board{
		ID:         ruleBoardID,
		TeamID:     ruleTeamID,
		Properties: map[string]interface{}{model.PropertyAccessKey: value},
	}
}

func accessCard(id, valueID string) *model.Block {
	return &model.Block{
		ID:       id,
		BoardID:  ruleBoardID,
		ParentID: ruleBoardID,
		Type:     model.TypeCard,
		Fields:   map[string]interface{}{"properties": map[string]interface{}{accessPropertyID: valueID}},
	}
}

// expectOrgMaster answers the three organization lookups the evaluator makes.
// outsider is placed in a department under a different division, so the gate
// closes on them.
func expectOrgMaster(th *APITestHelper, userID, orgUnitID string) {
	th.Store.EXPECT().GetOrgUnitsForTeam(ruleTeamID).Return([]*model.OrgUnit{
		{ID: accessDivision, Type: model.OrgUnitTypeDivision},
		{ID: "div-production", Type: model.OrgUnitTypeDivision},
		{ID: accessDepartment, Type: model.OrgUnitTypeDepartment, ParentID: accessDivision},
		{ID: "dep-factory", Type: model.OrgUnitTypeDepartment, ParentID: "div-production"},
	}, nil).AnyTimes()

	th.Store.EXPECT().GetDutiesForTeam(ruleTeamID).Return([]*model.Duty{
		{ID: "duty-lead", Name: "팀장", Rank: 3},
	}, nil).AnyTimes()

	th.Store.EXPECT().GetUserOrgProfiles(ruleTeamID, gomock.Any()).Return([]*model.UserOrgProfile{
		{TeamID: ruleTeamID, UserID: userID, PrimaryOrgUnitID: orgUnitID, PrimaryDutyID: "duty-lead"},
	}, nil).AnyTimes()
}

func TestGetBlocksPropertyAccess(t *testing.T) {
	t.Run("E-01 and E-02 the hidden card and its children are removed", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("outsider", ruleBoardID)
		th.Permissions.setBoardPermission("outsider", ruleBoardID, model.EffectiveBoardPermissionEdit)
		expectOrgMaster(th, "outsider", "dep-factory")

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().GetBlocksForBoard(ruleBoardID).Return([]*model.Block{
			accessCard(hiddenCardID, accessValueHidden),
			accessCard(openCardID, accessValueOpen),
			{ID: commentCardID, BoardID: ruleBoardID, ParentID: hiddenCardID, Type: model.TypeComment, Fields: map[string]interface{}{}},
		}, nil)

		rec := th.callHandler(th.API.handleGetBlocks, "/boards/"+ruleBoardID+"/blocks?all=true", "outsider",
			map[string]string{"boardID": ruleBoardID})

		require.Equal(t, http.StatusOK, rec.Code)

		var blocks []*model.Block
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &blocks))
		require.Len(t, blocks, 1)
		require.Equal(t, openCardID, blocks[0].ID)
	})

	t.Run("a member of the division keeps the card", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("insider", ruleBoardID)
		th.Permissions.setBoardPermission("insider", ruleBoardID, model.EffectiveBoardPermissionEdit)
		expectOrgMaster(th, "insider", accessDepartment)

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().GetBlocksForBoard(ruleBoardID).Return([]*model.Block{
			accessCard(hiddenCardID, accessValueHidden),
			{ID: commentCardID, BoardID: ruleBoardID, ParentID: hiddenCardID, Type: model.TypeComment, Fields: map[string]interface{}{}},
		}, nil)

		rec := th.callHandler(th.API.handleGetBlocks, "/boards/"+ruleBoardID+"/blocks?all=true", "insider",
			map[string]string{"boardID": ruleBoardID})

		require.Equal(t, http.StatusOK, rec.Code)

		var blocks []*model.Block
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &blocks))
		require.Len(t, blocks, 2)
	})

	t.Run("E-11 the switch off returns everything", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("outsider", ruleBoardID)
		th.Permissions.setBoardPermission("outsider", ruleBoardID, model.EffectiveBoardPermissionEdit)

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, false, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().GetBlocksForBoard(ruleBoardID).Return([]*model.Block{
			accessCard(hiddenCardID, accessValueHidden),
			accessCard(openCardID, accessValueOpen),
		}, nil)

		rec := th.callHandler(th.API.handleGetBlocks, "/boards/"+ruleBoardID+"/blocks?all=true", "outsider",
			map[string]string{"boardID": ruleBoardID})

		require.Equal(t, http.StatusOK, rec.Code)

		var blocks []*model.Block
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &blocks))
		require.Len(t, blocks, 2)
	})

	t.Run("E-10 a board admin is not filtered", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("admin", ruleBoardID)
		th.Permissions.setBoardPermission("admin", ruleBoardID, model.EffectiveBoardPermissionManage)

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().GetBlocksForBoard(ruleBoardID).Return([]*model.Block{
			accessCard(hiddenCardID, accessValueHidden),
			accessCard(openCardID, accessValueOpen),
		}, nil)

		rec := th.callHandler(th.API.handleGetBlocks, "/boards/"+ruleBoardID+"/blocks?all=true", "admin",
			map[string]string{"boardID": ruleBoardID})

		require.Equal(t, http.StatusOK, rec.Code)

		var blocks []*model.Block
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &blocks))
		require.Len(t, blocks, 2)
	})
}

func TestWriteEnforcementPropertyAccess(t *testing.T) {
	patchBody := func(t *testing.T) []byte {
		t.Helper()
		title := "changed"
		body, err := json.Marshal(&model.BlockPatch{Title: &title})
		require.NoError(t, err)
		return body
	}

	t.Run("E-03 patching a card the rule hides is refused", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("outsider", ruleBoardID)
		th.Permissions.setBoardPermission("outsider", ruleBoardID, model.EffectiveBoardPermissionEdit)
		expectOrgMaster(th, "outsider", "dep-factory")

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().GetBlock(hiddenCardID).Return(accessCard(hiddenCardID, accessValueHidden), nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handlePatchBlock, http.MethodPatch,
			"/boards/"+ruleBoardID+"/blocks/"+hiddenCardID, "outsider",
			map[string]string{"boardID": ruleBoardID, "blockID": hiddenCardID}, patchBody(t))

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("E-04 viewer level access is not enough to patch", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("insider", ruleBoardID)
		th.Permissions.setBoardPermission("insider", ruleBoardID, model.EffectiveBoardPermissionEdit)
		expectOrgMaster(th, "insider", accessDepartment)

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().GetBlock(hiddenCardID).Return(accessCard(hiddenCardID, accessValueHidden), nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handlePatchBlock, http.MethodPatch,
			"/boards/"+ruleBoardID+"/blocks/"+hiddenCardID, "insider",
			map[string]string{"boardID": ruleBoardID, "blockID": hiddenCardID}, patchBody(t))

		require.Equal(t, http.StatusForbidden, rec.Code,
			"the rule lowers what an editor may do to this card")
	})

	t.Run("a rule granting editor lets the patch through", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("insider", ruleBoardID)
		th.Permissions.setBoardPermission("insider", ruleBoardID, model.EffectiveBoardPermissionEdit)
		expectOrgMaster(th, "insider", accessDepartment)

		card := accessCard(hiddenCardID, accessValueHidden)
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessEditor), nil).AnyTimes()
		th.Store.EXPECT().GetBlock(hiddenCardID).Return(card, nil).AnyTimes()
		th.Store.EXPECT().PatchBlock(hiddenCardID, gomock.Any(), "insider").Return(nil)
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).Return([]*model.BoardMember{}, nil).AnyTimes()
		th.Store.EXPECT().GetSubscribersForBlock(gomock.Any()).Return(nil, nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handlePatchBlock, http.MethodPatch,
			"/boards/"+ruleBoardID+"/blocks/"+hiddenCardID, "insider",
			map[string]string{"boardID": ruleBoardID, "blockID": hiddenCardID}, patchBody(t))

		require.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("E-05 deleting a card the rule hides is refused", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("outsider", ruleBoardID)
		th.Permissions.setBoardPermission("outsider", ruleBoardID, model.EffectiveBoardPermissionEdit)
		expectOrgMaster(th, "outsider", "dep-factory")

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().GetBlock(hiddenCardID).Return(accessCard(hiddenCardID, accessValueHidden), nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handleDeleteBlock, http.MethodDelete,
			"/boards/"+ruleBoardID+"/blocks/"+hiddenCardID, "outsider",
			map[string]string{"boardID": ruleBoardID, "blockID": hiddenCardID}, nil)

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("a change to a child of a hidden card is refused too", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("outsider", ruleBoardID)
		th.Permissions.setBoardPermission("outsider", ruleBoardID, model.EffectiveBoardPermissionEdit)
		expectOrgMaster(th, "outsider", "dep-factory")

		comment := &model.Block{ID: commentCardID, BoardID: ruleBoardID, ParentID: hiddenCardID, Type: model.TypeComment, Fields: map[string]interface{}{}}
		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().GetBlock(commentCardID).Return(comment, nil).AnyTimes()
		th.Store.EXPECT().GetBlock(hiddenCardID).Return(accessCard(hiddenCardID, accessValueHidden), nil).AnyTimes()

		rec := th.callHandlerWithBody(th.API.handlePatchBlock, http.MethodPatch,
			"/boards/"+ruleBoardID+"/blocks/"+commentCardID, "outsider",
			map[string]string{"boardID": ruleBoardID, "blockID": commentCardID}, patchBody(t))

		require.Equal(t, http.StatusForbidden, rec.Code,
			"editing the comment of a hidden card would write into content the rule hides")
	})

	t.Run("E-06 creating a card is allowed by the board permission alone", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowBoard("outsider", ruleBoardID)
		th.Permissions.setBoardPermission("outsider", ruleBoardID, model.EffectiveBoardPermissionEdit)

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(accessBoard(t, true, model.PropertyAccessViewer), nil).AnyTimes()
		th.Store.EXPECT().InsertBlock(gomock.Any(), "outsider").Return(nil).AnyTimes()
		th.Store.EXPECT().InsertBlocks(gomock.Any(), "outsider").Return(nil).AnyTimes()
		th.Store.EXPECT().GetBlock(gomock.Any()).DoAndReturn(func(id string) (*model.Block, error) {
			return accessCard(id, accessValueHidden), nil
		}).AnyTimes()
		th.Store.EXPECT().GetBlocksByIDs(gomock.Any()).DoAndReturn(func(ids []string) ([]*model.Block, error) {
			return []*model.Block{accessCard(ids[0], accessValueHidden)}, nil
		}).AnyTimes()
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).Return([]*model.BoardMember{}, nil).AnyTimes()
		th.Store.EXPECT().GetSubscribersForBlock(gomock.Any()).Return(nil, nil).AnyTimes()

		now := utils.GetMillis()
		body, err := json.Marshal([]*model.Block{{
			ID: utils.NewID(utils.IDTypeBlock), BoardID: ruleBoardID, ParentID: ruleBoardID, Type: model.TypeCard,
			CreateAt: now, UpdateAt: now,
			Fields: map[string]interface{}{"properties": map[string]interface{}{accessPropertyID: accessValueHidden}},
		}})
		require.NoError(t, err)

		rec := th.callHandlerWithBody(th.API.handlePostBlocks, http.MethodPost,
			"/boards/"+ruleBoardID+"/blocks", "outsider",
			map[string]string{"boardID": ruleBoardID}, body)

		require.Equal(t, http.StatusOK, rec.Code,
			"FR-032 — rules never bar creation, only what happens to a card afterwards")
	})
}
