//go:generate mockgen -destination=mocks/mockstore.go -package mocks . Store

// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package permissions

import (
	"github.com/mattermost/mattermost-plugin-boards/server/model"

	mmModel "github.com/mattermost/mattermost/server/public/model"
)

type PermissionsService interface {
	HasPermissionTo(userID string, permission *mmModel.Permission) bool
	HasPermissionToTeam(userID, teamID string, permission *mmModel.Permission) bool
	HasPermissionToChannel(userID, channelID string, permission *mmModel.Permission) bool
	HasPermissionToBoard(userID, boardID string, permission *mmModel.Permission) bool
	GetBoardPermissions(userID, boardID string) (*model.BoardPermissionsResponse, error)
	// ResolveOrgContext resolves a user's org unit IDs, position IDs, and
	// full-visibility flag (synced onto user.Props["is_ceo"] by the main
	// server when a position with FullVisibility set is assigned) in a
	// single call, so batch callers (board list/search expansion) can
	// resolve it once instead of once per board.
	ResolveOrgContext(userID string) (orgUnits []string, positions []string, isCEO bool)
}

type Store interface {
	GetBoard(boardID string) (*model.Board, error)
	GetMemberForBoard(boardID, userID string) (*model.BoardMember, error)
	GetBoardHistory(boardID string, opts model.QueryBoardHistoryOptions) ([]*model.Board, error)
}
