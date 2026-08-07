// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	mmModel "github.com/mattermost/mattermost/server/public/model"
)

const (
	PermissionDerivedSys    = "system_admin_override"
	PermissionDerivedTeam   = "team_admin_default"
	PermissionDerivedMember = "member_role"
	PermissionDerivedDeny   = "deny"
)

type EffectiveBoardPermission string

const (
	EffectiveBoardPermissionNone      EffectiveBoardPermission = "none"
	EffectiveBoardPermissionView      EffectiveBoardPermission = "view"
	EffectiveBoardPermissionCommenter EffectiveBoardPermission = "commenter"
	EffectiveBoardPermissionEdit      EffectiveBoardPermission = "edit"
	EffectiveBoardPermissionManage    EffectiveBoardPermission = "manage"
	EffectiveBoardPermissionDelete    EffectiveBoardPermission = "delete"
)

type BoardPermissionCapabilities struct {
	CanView        bool `json:"canView"`
	CanCommentCard bool `json:"canCommentCard"`
	CanCreateCard  bool `json:"canCreateCard"`
	CanEditCard    bool `json:"canEditCard"`
	CanDeleteCard  bool `json:"canDeleteCard"`
	CanManageBoard bool `json:"canManageBoard"`
	CanDeleteBoard bool `json:"canDeleteBoard"`
}

type BoardPermissionsResponse struct {
	BoardID             string                      `json:"boardId"`
	EffectivePermission EffectiveBoardPermission    `json:"effectivePermission"`
	Capabilities        BoardPermissionCapabilities `json:"capabilities"`
	DerivedFrom         string                      `json:"derivedFrom"`

	// CardPermissions holds what the card access rules allow on individual
	// cards, keyed by card ID. It is omitted on the boards that have no rules,
	// which is nearly all of them, and the client then falls back to the board
	// wide capabilities above.
	//
	// It exists so the screen can stop offering edits the server will refuse:
	// the rules were enforced but invisible, so a member could type into a card
	// they had no permission to change and only find out when nothing saved.
	CardPermissions map[string]BoardPermissionCapabilities `json:"cardPermissions,omitempty"`
}

func RequiredPermissionLevel(permission *mmModel.Permission) EffectiveBoardPermission {
	if permission == nil {
		return EffectiveBoardPermissionNone
	}

	switch permission {
	case PermissionViewBoard:
		return EffectiveBoardPermissionView
	case PermissionCommentBoardCards:
		return EffectiveBoardPermissionCommenter
	case PermissionManageBoardCards, PermissionManageBoardProperties:
		return EffectiveBoardPermissionEdit
	case PermissionManageBoardRoles, PermissionManageBoardType, PermissionShareBoard,
		PermissionDeleteBoard, PermissionDeleteOthersComments:
		return EffectiveBoardPermissionManage
	default:
		return EffectiveBoardPermissionNone
	}
}

func PermissionSatisfies(effective EffectiveBoardPermission, required *mmModel.Permission) bool {
	requiredLevel := RequiredPermissionLevel(required)
	if requiredLevel == EffectiveBoardPermissionNone {
		return false
	}
	return EffectivePermissionRank(effective) >= EffectivePermissionRank(requiredLevel)
}

func EffectivePermissionRank(permission EffectiveBoardPermission) int {
	switch permission {
	case EffectiveBoardPermissionDelete:
		// Legacy value: treat as manage.
		return 4
	case EffectiveBoardPermissionManage:
		return 4
	case EffectiveBoardPermissionEdit:
		return 3
	case EffectiveBoardPermissionCommenter:
		return 2
	case EffectiveBoardPermissionView:
		return 1
	default:
		return 0
	}
}

func NormalizeEffectivePermission(permission EffectiveBoardPermission) EffectiveBoardPermission {
	switch permission {
	case EffectiveBoardPermissionDelete:
		return EffectiveBoardPermissionManage
	default:
		return permission
	}
}

func BuildCapabilities(permission EffectiveBoardPermission) BoardPermissionCapabilities {
	rank := EffectivePermissionRank(NormalizeEffectivePermission(permission))

	return BoardPermissionCapabilities{
		CanView:        rank >= 1,
		CanCommentCard: rank >= 2,
		CanCreateCard:  rank >= 3,
		CanEditCard:    rank >= 3,
		CanDeleteCard:  rank >= 3,
		CanManageBoard: rank >= 4,
		CanDeleteBoard: rank >= 4,
	}
}
