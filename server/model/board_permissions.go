// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"encoding/json"
	"fmt"

	mmModel "github.com/mattermost/mattermost/server/public/model"
)

const (
	BoardACLPropertyKey     = "board_acl_entries"
	BoardACLManagersKey     = "board_acl_managers"
	OrgUnitsMasterKey       = "org_units_master"
	PositionsMasterKey      = "positions_master"
	UserOrgUnitIDsKey       = "org_unit_ids"
	UserPositionCodesKey    = "position_codes"
	UserIsCEOKey            = "is_ceo"
	PermissionDerivedOwner  = "owner"
	PermissionDerivedDirect = "direct_acl"
	PermissionDerivedOrg    = "org_unit_acl"
	PermissionDerivedPos    = "position_acl"
	PermissionDerivedMgr    = "board_manager"
	PermissionDerivedSys    = "system_admin_override"
	PermissionDerivedTeam   = "team_admin_default"
	PermissionDerivedMember = "member_role"
	PermissionDerivedDeny   = "deny"
)

type BoardACLSubjectType string

const (
	BoardACLSubjectUser     BoardACLSubjectType = "user"
	BoardACLSubjectOrgUnit  BoardACLSubjectType = "org_unit"
	BoardACLSubjectPosition BoardACLSubjectType = "position"
	BoardACLSubjectOrgPos   BoardACLSubjectType = "org_position"
)

type EffectiveBoardPermission string

const (
	EffectiveBoardPermissionNone   EffectiveBoardPermission = "none"
	EffectiveBoardPermissionView   EffectiveBoardPermission = "view"
	EffectiveBoardPermissionEdit   EffectiveBoardPermission = "edit"
	EffectiveBoardPermissionManage EffectiveBoardPermission = "manage"
	EffectiveBoardPermissionDelete EffectiveBoardPermission = "delete"
)

type BoardACLEntry struct {
	ID           string                   `json:"id"`
	SubjectType  BoardACLSubjectType      `json:"subjectType"`
	SubjectID    string                   `json:"subjectId"`
	OrgUnitID    string                   `json:"orgUnitId,omitempty"`
	PositionCode string                   `json:"positionCode,omitempty"`
	Permission   EffectiveBoardPermission `json:"permission"`
}

type BoardPermissionCapabilities struct {
	CanView        bool `json:"canView"`
	CanCreateCard  bool `json:"canCreateCard"`
	CanEditCard    bool `json:"canEditCard"`
	CanDeleteCard  bool `json:"canDeleteCard"`
	CanManageBoard bool `json:"canManageBoard"`
}

type ACLSubjectOption struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type BoardPermissionsResponse struct {
	BoardID             string                      `json:"boardId"`
	EffectivePermission EffectiveBoardPermission    `json:"effectivePermission"`
	Capabilities        BoardPermissionCapabilities `json:"capabilities"`
	DerivedFrom         string                      `json:"derivedFrom"`
}

func ParseBoardACLFromProperties(properties map[string]interface{}) ([]BoardACLEntry, error) {
	if properties == nil {
		return []BoardACLEntry{}, nil
	}

	raw, ok := properties[BoardACLPropertyKey]
	if !ok || raw == nil {
		return []BoardACLEntry{}, nil
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal board ACL property: %w", err)
	}

	entries := []BoardACLEntry{}
	if err := json.Unmarshal(encoded, &entries); err != nil {
		return nil, fmt.Errorf("failed to unmarshal board ACL property: %w", err)
	}

	return entries, nil
}

func ACLPermissionFromBoardPermission(permission *mmModel.Permission) EffectiveBoardPermission {
	if permission == nil {
		return EffectiveBoardPermissionNone
	}

	switch permission {
	case PermissionViewBoard:
		return EffectiveBoardPermissionView
	case PermissionCommentBoardCards:
		return EffectiveBoardPermissionEdit
	case PermissionManageBoardCards, PermissionManageBoardProperties:
		return EffectiveBoardPermissionEdit
	case PermissionManageBoardRoles, PermissionManageBoardType, PermissionShareBoard:
		return EffectiveBoardPermissionManage
	case PermissionDeleteBoard:
		return EffectiveBoardPermissionDelete
	default:
		return EffectiveBoardPermissionNone
	}
}

func PermissionSatisfies(effective EffectiveBoardPermission, required *mmModel.Permission) bool {
	requiredLevel := ACLPermissionFromBoardPermission(required)
	return EffectivePermissionRank(effective) >= EffectivePermissionRank(requiredLevel)
}

func EffectivePermissionRank(permission EffectiveBoardPermission) int {
	switch permission {
	case EffectiveBoardPermissionDelete:
		return 4
	case EffectiveBoardPermissionManage:
		return 3
	case EffectiveBoardPermissionEdit:
		return 2
	case EffectiveBoardPermissionView:
		return 1
	default:
		return 0
	}
}

func BuildCapabilities(permission EffectiveBoardPermission) BoardPermissionCapabilities {
	rank := EffectivePermissionRank(permission)

	return BoardPermissionCapabilities{
		CanView:        rank >= 1,
		CanCreateCard:  rank >= 2,
		CanEditCard:    rank >= 2,
		CanDeleteCard:  rank >= 4 || rank >= 3,
		CanManageBoard: rank >= 3,
	}
}
