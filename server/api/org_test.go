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

// Contract tests for specs/005-org-scoped-properties/contracts/org-profiles-api.md.
//
// The candidate pool is the team, not the board: personSelector.tsx searches
// team wide whenever the board is open, so a board scoped membership list would
// not cover the users that search turns up.
func TestHandleGetOrgProfiles(t *testing.T) {
	const teamID = "team-1"

	t.Run("rejects a caller without team access", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()

		rec := th.callHandler(th.API.handleGetOrgProfiles, "/teams/"+teamID+"/org-profiles", "outsider",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("returns the memberships of the team's users", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetUserByID("member").Return(&model.User{ID: "member"}, nil)
		th.Store.EXPECT().
			SearchUsersByTeam(teamID, "", "", true, false, false).
			Return([]*model.User{{ID: "u-head"}, {ID: "u-lead"}}, nil)
		th.Store.EXPECT().
			GetUserOrgProfiles(teamID, []string{"u-head", "u-lead"}).
			Return([]*model.UserOrgProfile{
				{TeamID: teamID, UserID: "u-head", PrimaryOrgUnitID: "div-production"},
				{TeamID: teamID, UserID: "u-lead", PrimaryOrgUnitID: "dep-production"},
			}, nil)

		rec := th.callHandler(th.API.handleGetOrgProfiles, "/teams/"+teamID+"/org-profiles", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)

		var memberships []model.UserOrgMembership
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &memberships))
		require.Len(t, memberships, 2)
		byUser := map[string]string{}
		for _, m := range memberships {
			byUser[m.UserID] = m.OrgUnitID
		}
		require.Equal(t, "div-production", byUser["u-head"])
		require.Equal(t, "dep-production", byUser["u-lead"])
	})

	t.Run("omits users who have no assignment rather than sending a blank one", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetUserByID("member").Return(&model.User{ID: "member"}, nil)
		th.Store.EXPECT().
			SearchUsersByTeam(teamID, "", "", true, false, false).
			Return([]*model.User{{ID: "u-head"}, {ID: "u-unassigned"}}, nil)
		th.Store.EXPECT().
			GetUserOrgProfiles(teamID, []string{"u-head", "u-unassigned"}).
			Return([]*model.UserOrgProfile{
				{TeamID: teamID, UserID: "u-head", PrimaryOrgUnitID: "div-production"},
				// Present in the table but bound to nothing.
				{TeamID: teamID, UserID: "u-unassigned", PrimaryOrgUnitID: ""},
			}, nil)

		rec := th.callHandler(th.API.handleGetOrgProfiles, "/teams/"+teamID+"/org-profiles", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)

		var memberships []model.UserOrgMembership
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &memberships))
		require.Len(t, memberships, 1)
		require.Equal(t, "u-head", memberships[0].UserID)
	})

	t.Run("excludes bots, matching the person selector's own search", func(t *testing.T) {
		// exclude_bots is passed as true, so a bot never reaches the profile
		// lookup and can never appear in the narrowed candidate list.
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetUserByID("member").Return(&model.User{ID: "member"}, nil)
		th.Store.EXPECT().
			SearchUsersByTeam(teamID, "", "", true, false, false).
			Return([]*model.User{{ID: "u-head"}}, nil)
		th.Store.EXPECT().
			GetUserOrgProfiles(teamID, []string{"u-head"}).
			Return([]*model.UserOrgProfile{
				{TeamID: teamID, UserID: "u-head", PrimaryOrgUnitID: "div-production"},
			}, nil)

		rec := th.callHandler(th.API.handleGetOrgProfiles, "/teams/"+teamID+"/org-profiles", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("returns an empty array, not an error, when nobody is assigned", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetUserByID("member").Return(&model.User{ID: "member"}, nil)
		th.Store.EXPECT().
			SearchUsersByTeam(teamID, "", "", true, false, false).
			Return([]*model.User{{ID: "u-head"}}, nil)
		th.Store.EXPECT().
			GetUserOrgProfiles(teamID, []string{"u-head"}).
			Return(nil, nil)

		rec := th.callHandler(th.API.handleGetOrgProfiles, "/teams/"+teamID+"/org-profiles", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, "[]", rec.Body.String())
	})

	t.Run("returns an empty array when the team has no users", func(t *testing.T) {
		th, tearDown := setupAPITestHelper(t)
		defer tearDown()
		th.Permissions.allowTeam("member", teamID)
		th.Store.EXPECT().GetUserByID("member").Return(&model.User{ID: "member"}, nil)
		th.Store.EXPECT().
			SearchUsersByTeam(teamID, "", "", true, false, false).
			Return([]*model.User{}, nil)

		rec := th.callHandler(th.API.handleGetOrgProfiles, "/teams/"+teamID+"/org-profiles", "member",
			map[string]string{"teamID": teamID})

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, "[]", rec.Body.String())
	})
}

// C-03, C-04 and C-05 (the active and kind='duty' filters) live in the SQL of
// server/services/store/sqlstore/org_master.go. They cannot be asserted against
// a mocked store; quickstart.md covers them against a real database.
