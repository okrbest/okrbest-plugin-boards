// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

var errStoreUnavailable = errors.New("store unavailable")

func TestGetOrgUnitsForTeam(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("returns what the store gives, divisions and departments alike", func(t *testing.T) {
		units := []*model.OrgUnit{
			{ID: "div-strategy", Name: "전략", Type: model.OrgUnitTypeDivision, ParentID: ""},
			{ID: "dep-planning", Name: "경영개선팀", Type: model.OrgUnitTypeDepartment, ParentID: "div-strategy"},
		}
		th.Store.EXPECT().GetOrgUnitsForTeam("team-1").Return(units, nil)

		result, err := th.App.GetOrgUnitsForTeam("team-1")

		require.NoError(t, err)
		require.Len(t, result, 2)
		require.Equal(t, "div-strategy", result[0].ID)
		require.Equal(t, "dep-planning", result[1].ID)
		require.Equal(t, "div-strategy", result[1].ParentID)
	})

	t.Run("returns an empty slice, never nil, when the master is empty", func(t *testing.T) {
		th.Store.EXPECT().GetOrgUnitsForTeam("team-empty").Return(nil, nil)

		result, err := th.App.GetOrgUnitsForTeam("team-empty")

		require.NoError(t, err)
		require.NotNil(t, result)
		require.Empty(t, result)
	})

	t.Run("propagates store errors", func(t *testing.T) {
		th.Store.EXPECT().GetOrgUnitsForTeam("team-broken").Return(nil, errStoreUnavailable)

		_, err := th.App.GetOrgUnitsForTeam("team-broken")

		require.Error(t, err)
	})
}

func TestGetDutiesForTeam(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("returns duties with their full visibility flag", func(t *testing.T) {
		duties := []*model.Duty{
			{ID: "duty-ceo", Code: "ceo-2", Name: "CEO", Rank: 0, FullVisibility: true},
			{ID: "duty-head", Code: "duty-2", Name: "본부장", Rank: 2, FullVisibility: true},
			{ID: "duty-lead", Code: "duty-3", Name: "팀장", Rank: 3, FullVisibility: false},
		}
		th.Store.EXPECT().GetDutiesForTeam("team-1").Return(duties, nil)

		result, err := th.App.GetDutiesForTeam("team-1")

		require.NoError(t, err)
		require.Len(t, result, 3)
		require.True(t, result[1].FullVisibility)
		require.False(t, result[2].FullVisibility)
	})

	t.Run("returns an empty slice, never nil, when the master is empty", func(t *testing.T) {
		th.Store.EXPECT().GetDutiesForTeam("team-empty").Return(nil, nil)

		result, err := th.App.GetDutiesForTeam("team-empty")

		require.NoError(t, err)
		require.NotNil(t, result)
		require.Empty(t, result)
	})
}

func TestGetUserOrgProfiles(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	t.Run("deduplicates user IDs before hitting the store", func(t *testing.T) {
		// A duplicated ID multiplies the IN clause for no benefit. The caller
		// (websocket fan-out) builds its list from a path that does not
		// deduplicate, so this layer must.
		th.Store.EXPECT().
			GetUserOrgProfiles("team-1", []string{"user-a", "user-b"}).
			Return([]*model.UserOrgProfile{}, nil)

		_, err := th.App.GetUserOrgProfiles("team-1", []string{"user-a", "user-b", "user-a", "user-b"})

		require.NoError(t, err)
	})

	t.Run("does not hit the store for an empty list", func(t *testing.T) {
		result, err := th.App.GetUserOrgProfiles("team-1", nil)

		require.NoError(t, err)
		require.NotNil(t, result)
		require.Empty(t, result)
	})

	t.Run("keys the result by user ID", func(t *testing.T) {
		profiles := []*model.UserOrgProfile{
			{TeamID: "team-1", UserID: "user-a", PrimaryOrgUnitID: "dep-planning", PrimaryDutyID: "duty-lead"},
		}
		th.Store.EXPECT().GetUserOrgProfiles("team-1", []string{"user-a"}).Return(profiles, nil)

		result, err := th.App.GetUserOrgProfiles("team-1", []string{"user-a"})

		require.NoError(t, err)
		require.Contains(t, result, "user-a")
		require.Equal(t, "duty-lead", result["user-a"].PrimaryDutyID)
	})

	t.Run("drops assignments that are not in force yet", func(t *testing.T) {
		profiles := []*model.UserOrgProfile{
			{TeamID: "team-1", UserID: "user-future", PrimaryOrgUnitID: "dep-planning", EffectiveFrom: 9_000_000_000_000},
		}
		th.Store.EXPECT().GetUserOrgProfiles("team-1", []string{"user-future"}).Return(profiles, nil)

		result, err := th.App.GetUserOrgProfiles("team-1", []string{"user-future"})

		require.NoError(t, err)
		require.NotContains(t, result, "user-future")
	})

	t.Run("drops assignments that have already ended", func(t *testing.T) {
		profiles := []*model.UserOrgProfile{
			{TeamID: "team-1", UserID: "user-past", PrimaryOrgUnitID: "dep-planning", EffectiveTo: 1},
		}
		th.Store.EXPECT().GetUserOrgProfiles("team-1", []string{"user-past"}).Return(profiles, nil)

		result, err := th.App.GetUserOrgProfiles("team-1", []string{"user-past"})

		require.NoError(t, err)
		require.NotContains(t, result, "user-past")
	})

	t.Run("keeps assignments with no bounds", func(t *testing.T) {
		profiles := []*model.UserOrgProfile{
			{TeamID: "team-1", UserID: "user-open", PrimaryOrgUnitID: "dep-planning"},
		}
		th.Store.EXPECT().GetUserOrgProfiles("team-1", []string{"user-open"}).Return(profiles, nil)

		result, err := th.App.GetUserOrgProfiles("team-1", []string{"user-open"})

		require.NoError(t, err)
		require.Contains(t, result, "user-open")
	})
}

func TestOrgUnitAncestors(t *testing.T) {
	// 전략(division) ─ 경영개선팀(department) ─ 파트(가상 3단계)
	units := []*model.OrgUnit{
		{ID: "div-strategy", Type: model.OrgUnitTypeDivision, ParentID: ""},
		{ID: "dep-planning", Type: model.OrgUnitTypeDepartment, ParentID: "div-strategy"},
		{ID: "part-a", Type: model.OrgUnitTypeDepartment, ParentID: "dep-planning"},
		{ID: "div-production", Type: model.OrgUnitTypeDivision, ParentID: ""},
	}

	t.Run("includes the unit itself", func(t *testing.T) {
		got := orgUnitAncestors(units, "dep-planning")
		require.Contains(t, got, "dep-planning")
	})

	t.Run("walks up one level", func(t *testing.T) {
		got := orgUnitAncestors(units, "dep-planning")
		require.Contains(t, got, "div-strategy")
		require.NotContains(t, got, "div-production")
	})

	t.Run("walks up an arbitrary depth", func(t *testing.T) {
		got := orgUnitAncestors(units, "part-a")
		require.Contains(t, got, "part-a")
		require.Contains(t, got, "dep-planning")
		require.Contains(t, got, "div-strategy")
	})

	t.Run("returns an empty set for an unknown unit", func(t *testing.T) {
		got := orgUnitAncestors(units, "nope")
		require.Empty(t, got)
	})

	t.Run("returns an empty set for an empty unit", func(t *testing.T) {
		got := orgUnitAncestors(units, "")
		require.Empty(t, got)
	})

	t.Run("survives a parent cycle", func(t *testing.T) {
		cyclic := []*model.OrgUnit{
			{ID: "a", ParentID: "b"},
			{ID: "b", ParentID: "a"},
		}
		got := orgUnitAncestors(cyclic, "a")
		require.Len(t, got, 2)
	})
}
