// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// Organization unit types stored in the OrgUnits master table.
const (
	OrgUnitTypeDivision   = "division"   // 본부
	OrgUnitTypeDepartment = "department" // 부서
)

// DutyKind is the PositionDefinitions.kind value this plugin reads. Rows with
// kind "position" (직위) are ignored everywhere — see FR-024.
const DutyKind = "duty"

// Tables owned by the main server's Org Role Management feature. This plugin
// reads them and never writes.
const (
	OrgUnitsTable          = "OrgUnits"
	PositionDefinitionsTbl = "PositionDefinitions"
	UserOrgProfilesTable   = "UserOrgProfiles"
)

// OrgUnit is one row of the organization master, exposed read-only so the
// share dialog can populate its division and department selectors.
type OrgUnit struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	ParentID string `json:"parentId"`
}

// Duty is one 직책 entry, exposed read-only for the duty selector.
//
// FullVisibility is the "보드 전체보기" flag: a user holding such a duty is
// guaranteed at least viewer on every card of a board they can already open.
type Duty struct {
	ID             string `json:"id"`
	Code           string `json:"code"`
	Name           string `json:"name"`
	Rank           int    `json:"rank"`
	FullVisibility bool   `json:"fullVisibility"`
}

// UserOrgProfile is a user's organization binding, read from the main server's
// UserOrgProfiles table. This plugin only reads it.
//
// PrimaryPositionID (직위) and ExtraPositions are deliberately not modeled —
// this feature never considers them (FR-024).
type UserOrgProfile struct {
	TeamID           string
	UserID           string
	PrimaryOrgUnitID string
	PrimaryDutyID    string
	EffectiveFrom    int64
	EffectiveTo      int64
}

// IsEffectiveAt reports whether the assignment is in force at the given instant
// (milliseconds). A zero bound means unbounded on that side.
func (p UserOrgProfile) IsEffectiveAt(nowMillis int64) bool {
	if p.EffectiveFrom != 0 && nowMillis < p.EffectiveFrom {
		return false
	}
	if p.EffectiveTo != 0 && nowMillis >= p.EffectiveTo {
		return false
	}
	return true
}

// IsEmpty reports whether the user has no organization information at all.
// Such users fail every organization condition (FR-021).
func (p UserOrgProfile) IsEmpty() bool {
	return p.PrimaryOrgUnitID == "" && p.PrimaryDutyID == ""
}
