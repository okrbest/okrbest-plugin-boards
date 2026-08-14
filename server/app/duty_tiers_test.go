// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	mmModel "github.com/mattermost/mattermost/server/public/model"
)

// 009 US2 계약 5절 — 묶음은 팀이 갖는다. 한 사람의 편집이 팀의 모든 보드에 걸리므로
// 고칠 수 있는 사람을 시스템 관리자와 팀 관리자로 올린다.

const (
	tierTeamID = "team-1"
	tierUserID = "user-1"
)

func TestCanEditDutyTiers(t *testing.T) {
	t.Run("5-1 시스템 관리자는 고칠 수 있다", func(t *testing.T) {
		th, tearDown := SetupTestHelper(t)
		defer tearDown()

		th.API.EXPECT().HasPermissionTo(tierUserID, mmModel.PermissionManageSystem).Return(true).AnyTimes()

		require.True(t, th.App.CanEditDutyTiers(tierUserID, tierTeamID))
	})

	t.Run("5-2 팀 관리자는 고칠 수 있다", func(t *testing.T) {
		th, tearDown := SetupTestHelper(t)
		defer tearDown()

		th.API.EXPECT().HasPermissionTo(tierUserID, mmModel.PermissionManageSystem).Return(false).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(tierUserID, tierTeamID, mmModel.PermissionManageTeam).Return(true).AnyTimes()

		require.True(t, th.App.CanEditDutyTiers(tierUserID, tierTeamID))
	})

	t.Run("5-3 보드 관리자는 못 고친다", func(t *testing.T) {
		th, tearDown := SetupTestHelper(t)
		defer tearDown()

		// 보드 관리자라는 사실은 여기서 아무것도 주지 않는다. 팀 관리자가 아니면
		// 팀 전체에 걸리는 값을 고칠 수 없다.
		th.API.EXPECT().HasPermissionTo(tierUserID, mmModel.PermissionManageSystem).Return(false).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(tierUserID, tierTeamID, mmModel.PermissionManageTeam).Return(false).AnyTimes()

		require.False(t, th.App.CanEditDutyTiers(tierUserID, tierTeamID))
	})
}

func TestGetDutyTiers(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	th.Store.EXPECT().GetTeam(tierTeamID).Return(&model.Team{
		ID: tierTeamID,
		Settings: map[string]interface{}{
			model.DutyTiersKey: []interface{}{
				map[string]interface{}{"id": "t1", "name": "C-Level", "dutyIds": []interface{}{"duty-cso"}},
			},
		},
	}, nil).AnyTimes()

	tiers, err := th.App.GetDutyTiers(tierTeamID)

	require.NoError(t, err)
	require.Len(t, tiers, 1)
	require.Equal(t, "C-Level", tiers[0].Name)
}

func TestGetDutyTiersMissingTeam(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	th.Store.EXPECT().GetTeam(tierTeamID).Return(nil, nil).AnyTimes()

	tiers, err := th.App.GetDutyTiers(tierTeamID)

	require.NoError(t, err, "팀이 없는 것은 오류가 아니라 묶음이 없는 것이다")
	require.Empty(t, tiers)
}

func TestSetDutyTiers(t *testing.T) {
	t.Run("고칠 권한이 있으면 저장한다", func(t *testing.T) {
		th, tearDown := SetupTestHelper(t)
		defer tearDown()

		th.API.EXPECT().HasPermissionTo(tierUserID, mmModel.PermissionManageSystem).Return(true).AnyTimes()
		th.Store.EXPECT().GetTeam(tierTeamID).Return(&model.Team{
			ID:       tierTeamID,
			Settings: map[string]interface{}{"somethingElse": "keep me"},
		}, nil).AnyTimes()

		// 다른 키를 건드리지 않는 것까지 확인한다 — 이 가방은 여러 기능이 나눠 쓴다.
		th.Store.EXPECT().UpsertTeamSettings(gomock.Any()).DoAndReturn(func(team model.Team) error {
			require.Equal(t, "keep me", team.Settings["somethingElse"])
			require.NotNil(t, team.Settings[model.DutyTiersKey])
			return nil
		}).Times(1)

		err := th.App.SetDutyTiers(tierUserID, tierTeamID, []model.DutyTier{{ID: "t1", Name: "대표", DutyIDs: []string{"duty-ceo"}}})

		require.NoError(t, err)
	})

	t.Run("5-3 고칠 권한이 없으면 거절한다", func(t *testing.T) {
		th, tearDown := SetupTestHelper(t)
		defer tearDown()

		th.API.EXPECT().HasPermissionTo(tierUserID, mmModel.PermissionManageSystem).Return(false).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(tierUserID, tierTeamID, mmModel.PermissionManageTeam).Return(false).AnyTimes()

		err := th.App.SetDutyTiers(tierUserID, tierTeamID, []model.DutyTier{{ID: "t1", Name: "대표"}})

		require.Error(t, err)

		var permissionErr *model.ErrPermission
		require.ErrorAs(t, err, &permissionErr, "권한 오류로 나와야 403이 된다")
	})

	t.Run("이름이 빈 묶음은 거절한다", func(t *testing.T) {
		th, tearDown := SetupTestHelper(t)
		defer tearDown()

		th.API.EXPECT().HasPermissionTo(tierUserID, mmModel.PermissionManageSystem).Return(true).AnyTimes()

		err := th.App.SetDutyTiers(tierUserID, tierTeamID, []model.DutyTier{{ID: "t1", Name: ""}})

		require.Error(t, err)
	})
}
