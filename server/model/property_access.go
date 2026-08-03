// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// PropertyAccessKey is the board properties key that holds the card level
// access rules. See specs/002-card-property-access/data-model.md.
const PropertyAccessKey = "propertyAccess"

// Legacy keys left behind by the removed board ACL feature. They are no longer
// read by any code and are stripped when a board is saved.
var LegacyAccessKeys = []string{
	"card_acl_rules",
	"card_acl_enabled",
	"card_acl_org_map",
	"board_owner_user_id",
}

// PropertyAccessPermission is the permission a rule grants. It is a subset of
// EffectiveBoardPermission: rules can never grant manage.
type PropertyAccessPermission string

const (
	PropertyAccessViewer    PropertyAccessPermission = "viewer"
	PropertyAccessCommenter PropertyAccessPermission = "commenter"
	PropertyAccessEditor    PropertyAccessPermission = "editor"
)

// AsEffectivePermission maps a rule permission onto the shared board permission
// ladder so rule results and board results can be compared with
// EffectivePermissionRank.
func (p PropertyAccessPermission) AsEffectivePermission() EffectiveBoardPermission {
	switch p {
	case PropertyAccessEditor:
		return EffectiveBoardPermissionEdit
	case PropertyAccessCommenter:
		return EffectiveBoardPermissionCommenter
	case PropertyAccessViewer:
		return EffectiveBoardPermissionView
	default:
		return EffectiveBoardPermissionNone
	}
}

// PropertyAccessRule is one row of the rule table.
//
// The card side (PropertyID, PropertyValueID) selects which cards the row
// applies to. The subject side (DivisionID, DepartmentID, DutyID) selects
// which users it applies to; an empty field means "no constraint on this axis".
//
// All three subject axes store IDs: OrgUnits.id for the organisation axes and
// PositionDefinitions.id for the duty axis. UserOrgProfiles binds both the same
// way, so no conversion is needed. See specs/002-card-property-access/research.md R5.
type PropertyAccessRule struct {
	ID              string                   `json:"id"`
	PropertyID      string                   `json:"propertyId"`
	PropertyValueID string                   `json:"propertyValueId"`
	DivisionID      string                   `json:"divisionId"`
	DepartmentID    string                   `json:"departmentId"`
	DutyID          string                   `json:"dutyId"`
	Permission      PropertyAccessPermission `json:"permission"`
}

// HasOrgCondition reports whether the row constrains the organisation axis.
// Rows that do act as a gate: a user matching none of them gets no rule
// permission at all, however high their duty is.
func (r PropertyAccessRule) HasOrgCondition() bool {
	return r.DivisionID != "" || r.DepartmentID != ""
}

// PropertyAccessSettings is the whole rule set of one board. It is stored under
// PropertyAccessKey inside Board.Properties.
type PropertyAccessSettings struct {
	Enabled   bool                 `json:"enabled"`
	UpdatedBy string               `json:"updatedBy"`
	UpdatedAt int64                `json:"updatedAt"`
	Rules     []PropertyAccessRule `json:"rules"`
}
