// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

//go:generate mockgen -destination=mocks/mockpluginapi.go -package mocks github.com/mattermost/mattermost-server/v6/plugin API
package mmpermissions

import (
	"database/sql"
	"testing"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	mmModel "github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"

	"github.com/stretchr/testify/assert"
)

const (
	testTeamID  = "team-id"
	testBoardID = "board-id"
	testUserID  = "user-id"
)

func TestHasPermissionsToTeam(t *testing.T) {
	th := SetupTestHelper(t)

	t.Run("empty input should always unauthorize", func(t *testing.T) {
		assert.False(t, th.permissions.HasPermissionToTeam("", testTeamID, model.PermissionManageBoardCards))
		assert.False(t, th.permissions.HasPermissionToTeam(testUserID, "", model.PermissionManageBoardCards))
		assert.False(t, th.permissions.HasPermissionToTeam(testUserID, testTeamID, nil))
	})

	t.Run("should authorize if the plugin API does", func(t *testing.T) {
		userID := testUserID
		teamID := testTeamID

		th.api.EXPECT().
			HasPermissionToTeam(userID, teamID, model.PermissionViewTeam).
			Return(true).
			Times(1)

		hasPermission := th.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam)
		assert.True(t, hasPermission)
	})

	t.Run("should not authorize if the plugin API doesn't", func(t *testing.T) {
		userID := testUserID
		teamID := testTeamID

		th.api.EXPECT().
			HasPermissionToTeam(userID, teamID, model.PermissionViewTeam).
			Return(false).
			Times(1)

		hasPermission := th.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam)
		assert.False(t, hasPermission)
	})
}

// test case for user removed.
func TestHasPermissionToBoard(t *testing.T) {
	th := SetupTestHelper(t)

	t.Run("empty input should always unauthorize", func(t *testing.T) {
		assert.False(t, th.permissions.HasPermissionToBoard("", testBoardID, model.PermissionManageBoardCards))
		assert.False(t, th.permissions.HasPermissionToBoard(testUserID, "", model.PermissionManageBoardCards))
		assert.False(t, th.permissions.HasPermissionToBoard(testUserID, testBoardID, nil))
	})

	userID := testUserID
	boardID := testBoardID
	teamID := testTeamID

	t.Run("nonexistent member", func(t *testing.T) {
		th.store.EXPECT().
			GetBoard(boardID).
			Return(&model.Board{ID: boardID, TeamID: teamID}, nil).
			Times(1)

		th.api.EXPECT().
			HasPermissionToTeam(userID, teamID, model.PermissionViewTeam).
			Return(true).
			Times(1)

		th.store.EXPECT().
			GetMemberForBoard(boardID, userID).
			Return(nil, sql.ErrNoRows).
			Times(1)
		th.api.EXPECT().
			GetUser(userID).
			Return(nil, &mmModel.AppError{}).
			Times(1)

		hasPermission := th.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardCards)
		assert.False(t, hasPermission)
	})

	t.Run("nonexistent board", func(t *testing.T) {
		th.store.EXPECT().
			GetBoard(boardID).
			Return(nil, sql.ErrNoRows).
			Times(1)

		th.store.EXPECT().
			GetBoardHistory(boardID, model.QueryBoardHistoryOptions{Limit: 1, Descending: true}).
			Return(nil, sql.ErrNoRows).
			Times(1)

		hasPermission := th.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardCards)
		assert.False(t, hasPermission)
	})

	t.Run("user that has been removed from the team", func(t *testing.T) {
		member := &model.BoardMember{
			UserID:      userID,
			BoardID:     boardID,
			SchemeAdmin: true,
		}

		th.store.EXPECT().
			GetBoard(boardID).
			Return(&model.Board{ID: boardID, TeamID: teamID}, nil).
			Times(1)

		th.api.EXPECT().
			HasPermissionToTeam(userID, teamID, model.PermissionViewTeam).
			Return(true).
			Times(1)

		th.store.EXPECT().
			GetMemberForBoard(member.BoardID, member.UserID).
			Return(member, nil).
			Times(1)

		hasPermission := th.permissions.HasPermissionToBoard(member.UserID, member.BoardID, model.PermissionViewBoard)
		assert.True(t, hasPermission)
	})

	t.Run("board admin", func(t *testing.T) {
		member := &model.BoardMember{
			UserID:      userID,
			BoardID:     boardID,
			SchemeAdmin: true,
		}

		hasPermissionTo := []*mmModel.Permission{
			model.PermissionManageBoardType,
			model.PermissionManageBoardRoles,
			model.PermissionShareBoard,
			model.PermissionManageBoardCards,
			model.PermissionViewBoard,
			model.PermissionManageBoardProperties,
		}

		hasNotPermissionTo := []*mmModel.Permission{}

		th.checkBoardPermissions("admin", member, teamID, hasPermissionTo, hasNotPermissionTo)
	})

	t.Run("board editor", func(t *testing.T) {
		member := &model.BoardMember{
			UserID:       userID,
			BoardID:      boardID,
			SchemeEditor: true,
		}

		hasPermissionTo := []*mmModel.Permission{
			model.PermissionManageBoardCards,
			model.PermissionViewBoard,
			model.PermissionManageBoardProperties,
		}

		hasNotPermissionTo := []*mmModel.Permission{
			model.PermissionManageBoardType,
			model.PermissionDeleteBoard,
			model.PermissionManageBoardRoles,
			model.PermissionShareBoard,
		}

		th.checkBoardPermissions("editor", member, teamID, hasPermissionTo, hasNotPermissionTo)
	})

	t.Run("board commenter", func(t *testing.T) {
		member := &model.BoardMember{
			UserID:          userID,
			BoardID:         boardID,
			SchemeCommenter: true,
		}

		hasPermissionTo := []*mmModel.Permission{
			model.PermissionViewBoard,
			model.PermissionCommentBoardCards,
		}

		hasNotPermissionTo := []*mmModel.Permission{
			model.PermissionManageBoardType,
			model.PermissionDeleteBoard,
			model.PermissionManageBoardRoles,
			model.PermissionShareBoard,
			model.PermissionManageBoardCards,
			model.PermissionManageBoardProperties,
		}

		th.checkBoardPermissions("commenter", member, teamID, hasPermissionTo, hasNotPermissionTo)
	})

	t.Run("board viewer", func(t *testing.T) {
		member := &model.BoardMember{
			UserID:       userID,
			BoardID:      boardID,
			SchemeViewer: true,
		}

		hasPermissionTo := []*mmModel.Permission{
			model.PermissionViewBoard,
		}

		hasNotPermissionTo := []*mmModel.Permission{
			model.PermissionManageBoardType,
			model.PermissionDeleteBoard,
			model.PermissionManageBoardRoles,
			model.PermissionShareBoard,
			model.PermissionManageBoardCards,
			model.PermissionManageBoardProperties,
			model.PermissionCommentBoardCards,
		}

		th.checkBoardPermissions("viewer", member, teamID, hasPermissionTo, hasNotPermissionTo)
	})

	t.Run("elevate board viewer permissions", func(t *testing.T) {
		member := &model.BoardMember{
			UserID:       userID,
			BoardID:      boardID,
			SchemeViewer: true,
		}

		hasPermissionTo := []*mmModel.Permission{
			model.PermissionManageBoardType,
			model.PermissionManageBoardRoles,
			model.PermissionShareBoard,
			model.PermissionManageBoardCards,
			model.PermissionViewBoard,
			model.PermissionManageBoardProperties,
		}

		hasNotPermissionTo := []*mmModel.Permission{}
		th.checkBoardPermissions("elevated-admin", member, teamID, hasPermissionTo, hasNotPermissionTo)
	})

	t.Run("board owner can delete board", func(t *testing.T) {
		th.store.EXPECT().
			GetBoard(boardID).
			Return(&model.Board{ID: boardID, TeamID: teamID, CreatedBy: userID}, nil).
			Times(1)

		assert.True(t, th.permissions.HasPermissionToBoard(userID, boardID, model.PermissionDeleteBoard))
	})

	t.Run("org_position acl requires both org and position", func(t *testing.T) {
		taggedUserID := "user-id org_unit:dept-a position:leader"

		boardWithACL := &model.Board{
			ID:     boardID,
			TeamID: teamID,
			Properties: map[string]interface{}{
				model.BoardACLPropertyKey: []model.BoardACLEntry{
					{
						ID:           "acl-org-pos",
						SubjectType:  model.BoardACLSubjectOrgPos,
						OrgUnitID:    "dept-a",
						PositionCode: "leader",
						Permission:   model.EffectiveBoardPermissionManage,
					},
				},
			},
		}

		th.store.EXPECT().
			GetBoard(boardID).
			Return(boardWithACL, nil).
			Times(1)
		th.api.EXPECT().
			HasPermissionToTeam(taggedUserID, teamID, model.PermissionViewTeam).
			Return(true).
			Times(1)
		th.store.EXPECT().
			GetMemberForBoard(boardID, taggedUserID).
			Return(nil, sql.ErrNoRows).
			Times(1)

		assert.True(t, th.permissions.HasPermissionToBoard(taggedUserID, boardID, model.PermissionManageBoardCards))
	})

	t.Run("org_position acl denies when one side missing", func(t *testing.T) {
		taggedUserID := "user-id org_unit:dept-a"

		boardWithACL := &model.Board{
			ID:     boardID,
			TeamID: teamID,
			Properties: map[string]interface{}{
				model.BoardACLPropertyKey: []model.BoardACLEntry{
					{
						ID:           "acl-org-pos",
						SubjectType:  model.BoardACLSubjectOrgPos,
						OrgUnitID:    "dept-a",
						PositionCode: "leader",
						Permission:   model.EffectiveBoardPermissionManage,
					},
				},
			},
		}

		th.store.EXPECT().
			GetBoard(boardID).
			Return(boardWithACL, nil).
			Times(1)
		th.api.EXPECT().
			HasPermissionToTeam(taggedUserID, teamID, model.PermissionViewTeam).
			Return(true).
			Times(1)
		th.store.EXPECT().
			GetMemberForBoard(boardID, taggedUserID).
			Return(nil, sql.ErrNoRows).
			Times(1)

		assert.False(t, th.permissions.HasPermissionToBoard(taggedUserID, boardID, model.PermissionManageBoardCards))
	})

	t.Run("ceo gets view on private board without membership", func(t *testing.T) {
		boardWithNoMembership := &model.Board{
			ID:     boardID,
			TeamID: teamID,
			Type:   model.BoardTypePrivate,
		}

		th.store.EXPECT().
			GetBoard(boardID).
			Return(boardWithNoMembership, nil).
			Times(1)
		th.api.EXPECT().
			HasPermissionToTeam(userID, teamID, model.PermissionViewTeam).
			Return(true).
			Times(1)
		th.store.EXPECT().
			GetMemberForBoard(boardID, userID).
			Return(nil, sql.ErrNoRows).
			Times(1)
		th.api.EXPECT().
			GetUser(userID).
			Return(&mmModel.User{
				Props: map[string]string{
					"is_ceo": "true",
				},
			}, nil).
			Times(1)

		hasPermission := th.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard)
		assert.True(t, hasPermission)
	})
}

type fallbackStore struct {
	board                   *model.Board
	fullVisibilityPositions []string
	userOrgProfile          *model.UserOrgProfile
}

func (s *fallbackStore) GetBoard(boardID string) (*model.Board, error) {
	return s.board, nil
}

func (s *fallbackStore) GetMemberForBoard(boardID, userID string) (*model.BoardMember, error) {
	return nil, sql.ErrNoRows
}

func (s *fallbackStore) GetBoardHistory(boardID string, opts model.QueryBoardHistoryOptions) ([]*model.Board, error) {
	return nil, sql.ErrNoRows
}

func (s *fallbackStore) GetFullVisibilityPositionIDs(teamID string) ([]string, error) {
	return s.fullVisibilityPositions, nil
}

func (s *fallbackStore) GetUserOrgProfile(teamID, userID string) (*model.UserOrgProfile, error) {
	return s.userOrgProfile, nil
}

type fallbackAPI struct {
	user *mmModel.User
}

func (a *fallbackAPI) HasPermissionTo(userID string, permission *mmModel.Permission) bool {
	return false
}

func (a *fallbackAPI) HasPermissionToTeam(userID string, teamID string, permission *mmModel.Permission) bool {
	return true
}

func (a *fallbackAPI) HasPermissionToChannel(userID string, channelID string, permission *mmModel.Permission) bool {
	return false
}

func (a *fallbackAPI) GetUser(userID string) (*mmModel.User, *mmModel.AppError) {
	return a.user, nil
}

func TestResolveOrgContextForTeam_FullVisibilityFallback(t *testing.T) {
	service := New(
		&fallbackStore{
			board: &model.Board{
				ID:     "board-id",
				TeamID: "team-id",
				Type:   model.BoardTypePrivate,
			},
			fullVisibilityPositions: []string{"position-ceo"},
		},
		&fallbackAPI{
			user: &mmModel.User{
				Props: map[string]string{
					"position_codes": "position-ceo",
				},
			},
		},
		mlog.CreateConsoleTestLogger(t),
	)

	orgUnits, positions, fullVisibilityPositionIDs, orgContextSource, isCEOFromProps, isCEOFromFallback, isCEO := service.ResolveOrgContextDebugForTeam("user-id", "team-id")
	assert.Empty(t, orgUnits)
	assert.Equal(t, []string{"position-ceo"}, positions)
	assert.Equal(t, []string{"position-ceo"}, fullVisibilityPositionIDs)
	assert.Equal(t, "props", orgContextSource)
	assert.False(t, isCEOFromProps)
	assert.True(t, isCEOFromFallback)
	assert.True(t, isCEO)

	resolved, err := service.GetBoardPermissions("user-id", "board-id")
	assert.NoError(t, err)
	assert.Equal(t, model.EffectiveBoardPermissionCommenter, resolved.EffectivePermission)
	assert.Equal(t, model.PermissionDerivedCEO, resolved.DerivedFrom)
}

func TestResolveOrgContextForTeam_DBFirstProfile(t *testing.T) {
	service := New(
		&fallbackStore{
			board: &model.Board{
				ID:     "board-id",
				TeamID: "team-id",
				Type:   model.BoardTypePrivate,
			},
			fullVisibilityPositions: []string{"position-ceo"},
			userOrgProfile: &model.UserOrgProfile{
				TeamID:            "team-id",
				UserID:            "user-id",
				PrimaryOrgUnitID:  "org-main",
				PrimaryPositionID: "position-ceo",
				ExtraPositions:    []string{},
			},
		},
		&fallbackAPI{
			user: &mmModel.User{
				Props: map[string]string{},
			},
		},
		mlog.CreateConsoleTestLogger(t),
	)

	orgUnits, positions, fullVisibilityPositionIDs, orgContextSource, isCEOFromProps, isCEOFromFallback, isCEO := service.ResolveOrgContextDebugForTeam("user-id", "team-id")
	assert.Equal(t, []string{"org-main"}, orgUnits)
	assert.Equal(t, []string{"position-ceo"}, positions)
	assert.Equal(t, []string{"position-ceo"}, fullVisibilityPositionIDs)
	assert.Equal(t, "db", orgContextSource)
	assert.False(t, isCEOFromProps)
	assert.True(t, isCEOFromFallback)
	assert.True(t, isCEO)

	resolved, err := service.GetBoardPermissions("user-id", "board-id")
	assert.NoError(t, err)
	assert.Equal(t, model.EffectiveBoardPermissionCommenter, resolved.EffectivePermission)
	assert.Equal(t, model.PermissionDerivedCEO, resolved.DerivedFrom)
}
