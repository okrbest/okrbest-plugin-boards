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
	BoardOwnerUserIDKey     = "board_owner_user_id"
	OrgUnitsMasterKey       = "org_units_master"
	PositionsMasterKey      = "positions_master"
	UserOrgUnitIDsKey       = "org_unit_ids"
	UserPositionCodesKey    = "position_codes"
	UserIsCEOKey            = "is_ceo"
	PermissionDerivedOwner  = "owner"
	PermissionDerivedDirect = "direct_acl"
	PermissionDerivedOrg    = "org_unit_acl"
	PermissionDerivedPos    = "position_acl"
	PermissionDerivedOrgPos = "org_position_acl"
	PermissionDerivedCEO    = "ceo_full_visibility"
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
	EffectiveBoardPermissionNone      EffectiveBoardPermission = "none"
	EffectiveBoardPermissionView      EffectiveBoardPermission = "view"
	EffectiveBoardPermissionCommenter EffectiveBoardPermission = "commenter"
	EffectiveBoardPermissionEdit      EffectiveBoardPermission = "edit"
	EffectiveBoardPermissionManage    EffectiveBoardPermission = "manage"
	EffectiveBoardPermissionDelete    EffectiveBoardPermission = "delete"
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
	CanCommentCard bool `json:"canCommentCard"`
	CanCreateCard  bool `json:"canCreateCard"`
	CanEditCard    bool `json:"canEditCard"`
	CanDeleteCard  bool `json:"canDeleteCard"`
	CanManageBoard bool `json:"canManageBoard"`
	CanDeleteBoard bool `json:"canDeleteBoard"`
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
	IsOwner             bool                        `json:"isOwner"`
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

// EvaluateBoardACLEntries computes the effective permission granted by a
// board's ACL entries for a given user ID and their already-resolved org
// context (org unit IDs, position IDs), along with which kind of ACL entry
// produced it (one of the PermissionDerived* constants, or
// PermissionDerivedDeny if nothing matched). It is a pure function — no DB or
// plugin-API access — so a caller evaluating many boards (e.g. expanding a
// board list/search result) can resolve the org context once and reuse it
// across every candidate board instead of re-resolving it per board.
func EvaluateBoardACLEntries(entries []BoardACLEntry, userID string, orgUnits, positions []string) (EffectiveBoardPermission, string) {
	if directPermission := evaluateACLEntries(entries, BoardACLSubjectUser, userID); directPermission != EffectiveBoardPermissionNone {
		return directPermission, PermissionDerivedDirect
	}

	if !hasOrgScopedACLEntries(entries) {
		return EffectiveBoardPermissionNone, PermissionDerivedDeny
	}

	if orgPositionPermission := evaluateOrgPositionACLEntries(entries, orgUnits, positions); orgPositionPermission != EffectiveBoardPermissionNone {
		return orgPositionPermission, PermissionDerivedOrgPos
	}

	if positionPermission := evaluateAnyACLEntries(entries, BoardACLSubjectPosition, positions); positionPermission != EffectiveBoardPermissionNone {
		return positionPermission, PermissionDerivedPos
	}

	if orgPermission := evaluateAnyACLEntries(entries, BoardACLSubjectOrgUnit, orgUnits); orgPermission != EffectiveBoardPermissionNone {
		return orgPermission, PermissionDerivedOrg
	}

	return EffectiveBoardPermissionNone, PermissionDerivedDeny
}

func evaluateACLEntries(entries []BoardACLEntry, subjectType BoardACLSubjectType, subjectID string) EffectiveBoardPermission {
	highest := EffectiveBoardPermissionNone
	for _, entry := range entries {
		if entry.SubjectType != subjectType || entry.SubjectID != subjectID {
			continue
		}
		normalizedPermission := NormalizeEffectivePermission(entry.Permission)
		if EffectivePermissionRank(normalizedPermission) > EffectivePermissionRank(highest) {
			highest = normalizedPermission
		}
	}
	return highest
}

func evaluateOrgPositionACLEntries(entries []BoardACLEntry, orgUnits []string, positions []string) EffectiveBoardPermission {
	if len(orgUnits) == 0 || len(positions) == 0 {
		return EffectiveBoardPermissionNone
	}

	orgUnitSet := map[string]struct{}{}
	for _, orgUnit := range orgUnits {
		orgUnitSet[orgUnit] = struct{}{}
	}
	positionSet := map[string]struct{}{}
	for _, position := range positions {
		positionSet[position] = struct{}{}
	}

	highest := EffectiveBoardPermissionNone
	for _, entry := range entries {
		if entry.SubjectType != BoardACLSubjectOrgPos {
			continue
		}
		if _, ok := orgUnitSet[entry.OrgUnitID]; !ok {
			continue
		}
		if _, ok := positionSet[entry.PositionCode]; !ok {
			continue
		}
		normalizedPermission := NormalizeEffectivePermission(entry.Permission)
		if EffectivePermissionRank(normalizedPermission) > EffectivePermissionRank(highest) {
			highest = normalizedPermission
		}
	}

	return highest
}

func evaluateAnyACLEntries(entries []BoardACLEntry, subjectType BoardACLSubjectType, subjectIDs []string) EffectiveBoardPermission {
	highest := EffectiveBoardPermissionNone
	for _, subjectID := range subjectIDs {
		permission := evaluateACLEntries(entries, subjectType, subjectID)
		if EffectivePermissionRank(permission) > EffectivePermissionRank(highest) {
			highest = permission
		}
	}
	return highest
}

// HasOrgScopedACLEntries reports whether entries contains any org_unit/
// position/org_position entry, so callers can decide whether it's worth
// resolving a user's org context before evaluating ACL (direct "user"
// entries never need it).
func HasOrgScopedACLEntries(entries []BoardACLEntry) bool {
	return hasOrgScopedACLEntries(entries)
}

func hasOrgScopedACLEntries(entries []BoardACLEntry) bool {
	for _, entry := range entries {
		if entry.SubjectType == BoardACLSubjectOrgPos || entry.SubjectType == BoardACLSubjectOrgUnit || entry.SubjectType == BoardACLSubjectPosition {
			return true
		}
	}
	return false
}

func ACLPermissionFromBoardPermission(permission *mmModel.Permission) EffectiveBoardPermission {
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
	case PermissionManageBoardRoles, PermissionManageBoardType, PermissionShareBoard:
		return EffectiveBoardPermissionManage
	case PermissionDeleteBoard:
		// Board deletion is owner-only, not ACL-derived.
		return EffectiveBoardPermissionNone
	default:
		return EffectiveBoardPermissionNone
	}
}

func PermissionSatisfies(effective EffectiveBoardPermission, required *mmModel.Permission) bool {
	if required == PermissionDeleteBoard {
		return false
	}
	requiredLevel := ACLPermissionFromBoardPermission(required)
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

func ResolveBoardOwnerUserID(board *Board) string {
	if board == nil {
		return ""
	}

	if board.Properties != nil {
		if rawOwner, ok := board.Properties[BoardOwnerUserIDKey]; ok {
			if ownerID, okCast := rawOwner.(string); okCast && ownerID != "" {
				return ownerID
			}
		}
	}

	return board.CreatedBy
}

func BuildCapabilities(permission EffectiveBoardPermission, isOwner bool) BoardPermissionCapabilities {
	rank := EffectivePermissionRank(NormalizeEffectivePermission(permission))

	return BoardPermissionCapabilities{
		CanView:        rank >= 1,
		CanCommentCard: rank >= 2,
		CanCreateCard:  rank >= 3,
		CanEditCard:    rank >= 3,
		CanDeleteCard:  rank >= 3,
		CanManageBoard: rank >= 4,
		CanDeleteBoard: isOwner,
	}
}
