// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// Organization unit types stored in the OrgUnits master table.
const (
	OrgUnitTypeDivision   = "division"   // 본부
	OrgUnitTypeDepartment = "department" // 부서
)

// Card property types that name a part of the organization. A card wearing one
// of these says where in the company it belongs, which is what a sub-card has to
// take from its parent while everything else starts empty.
//
// The same three strings live in webapp/src/properties/orgLabels.ts. They are
// stored on the board, so neither side may rename them alone.
const (
	PropertyTypeOrgDivision   = "orgDivision"   // 본부
	PropertyTypeOrgDepartment = "orgDepartment" // 부서
	PropertyTypeOrgDuty       = "orgDuty"       // 직책
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

// UserOrgMembership is one row of the team-scoped membership list the card
// property editors use to narrow their person choices.
//
// It carries only the two fields the screens need. Duty and effective window are
// deliberately left out: the narrowing is an input convenience, and the fewer
// organization details cross the wire the smaller the exposure.
//
// A user with no assignment is omitted from the list rather than sent with an
// empty OrgUnitID, so "no organization" and "empty organization" never have to
// be told apart on the client.
type UserOrgMembership struct {
	UserID    string `json:"userId"`
	OrgUnitID string `json:"orgUnitId"`
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
