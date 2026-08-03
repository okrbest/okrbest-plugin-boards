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

// Contract tests for specs/002-card-property-access/contracts/org-master-api.md.
func TestHandleGetOrgUnits(t *testing.T) {
	const teamID = "team-1"

	t.Run("C-01 rejects a caller without team access", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()

		rec := th.callHandler(th.API.handleGetOrgUnits, "/teams/"+teamID+"/org-units", "outsider",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("C-02 returns divisions and departments linked by parentId", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetOrgUnitsForTeam(teamID).Return([]*model.OrgUnit{
			{ID: "div-strategy", Name: "전략", Type: model.OrgUnitTypeDivision, ParentID: ""},
			{ID: "dep-planning", Name: "경영개선팀", Type: model.OrgUnitTypeDepartment, ParentID: "div-strategy"},
		}, nil)

		rec := th.callHandler(th.API.handleGetOrgUnits, "/teams/"+teamID+"/org-units", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)

		var units []model.OrgUnit
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &units))
		require.Len(t, units, 2)
		require.Equal(t, model.OrgUnitTypeDivision, units[0].Type)
		require.Equal(t, model.OrgUnitTypeDepartment, units[1].Type)
		require.Equal(t, units[0].ID, units[1].ParentID)
	})

	t.Run("C-07 returns an empty array, not an error, when the master is empty", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetOrgUnitsForTeam(teamID).Return(nil, nil)

		rec := th.callHandler(th.API.handleGetOrgUnits, "/teams/"+teamID+"/org-units", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, "[]", rec.Body.String())
	})

	t.Run("C-08 a board admin who is not a team admin can read the master", func(t *testing.T) {
		// The main server's own organization endpoints require team admin.
		// This route deliberately bars on view-team instead, which is why it
		// exists separately.
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("board-admin", teamID)
		th.Store.EXPECT().GetOrgUnitsForTeam(teamID).Return([]*model.OrgUnit{}, nil)

		rec := th.callHandler(th.API.handleGetOrgUnits, "/teams/"+teamID+"/org-units", "board-admin",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestHandleGetDuties(t *testing.T) {
	const teamID = "team-1"

	t.Run("C-01 rejects a caller without team access", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()

		rec := th.callHandler(th.API.handleGetDuties, "/teams/"+teamID+"/duties", "outsider",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("C-06 carries the full visibility flag through unchanged", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetDutiesForTeam(teamID).Return([]*model.Duty{
			{ID: "duty-head", Code: "duty-2", Name: "본부장", Rank: 2, FullVisibility: true},
			{ID: "duty-lead", Code: "duty-3", Name: "팀장", Rank: 3, FullVisibility: false},
		}, nil)

		rec := th.callHandler(th.API.handleGetDuties, "/teams/"+teamID+"/duties", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)

		var duties []model.Duty
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &duties))
		require.Len(t, duties, 2)
		require.True(t, duties[0].FullVisibility)
		require.False(t, duties[1].FullVisibility)
		require.Equal(t, "duty-head", duties[0].ID)
	})

	t.Run("C-07 returns an empty array, not an error, when the master is empty", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetDutiesForTeam(teamID).Return(nil, nil)

		rec := th.callHandler(th.API.handleGetDuties, "/teams/"+teamID+"/duties", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, "[]", rec.Body.String())
	})
}

// C-03, C-04 and C-05 (the active and kind='duty' filters) live in the SQL of
// server/services/store/sqlstore/org_master.go. They cannot be asserted against
// a mocked store; quickstart.md covers them against a real database.
