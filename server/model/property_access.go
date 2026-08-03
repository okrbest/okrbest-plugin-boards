// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import "encoding/json"

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
// All three subject axes store IDs: OrgUnits.id for the organization axes and
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

// HasOrgCondition reports whether the row constrains the organization axis.
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

// PropertyAccessSettingsFromProperties reads the rule set out of a board's
// properties bag.
//
// Board.Properties is an untyped map that round trips through the database as
// JSON, so the stored value arrives as a generic map. Re-encoding is the
// cheapest way to get a typed value back without hand walking the map.
//
// A board with no rule set is not an error — it returns nil, which every caller
// treats exactly like a disabled switch.
func PropertyAccessSettingsFromProperties(properties map[string]interface{}) (*PropertyAccessSettings, error) {
	raw, ok := properties[PropertyAccessKey]
	if !ok || raw == nil {
		return nil, nil
	}

	if settings, ok := raw.(*PropertyAccessSettings); ok {
		return settings, nil
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, NewErrBadRequest("invalid propertyAccess: " + err.Error())
	}

	settings := &PropertyAccessSettings{}
	if err := json.Unmarshal(encoded, settings); err != nil {
		return nil, NewErrBadRequest("invalid propertyAccess: " + err.Error())
	}

	return settings, nil
}

// AsProperty renders the rule set back into the generic shape Board.Properties
// holds, so what a patch writes and what a later read parses are identical.
func (s *PropertyAccessSettings) AsProperty() (map[string]interface{}, error) {
	if s.Rules == nil {
		s.Rules = []PropertyAccessRule{}
	}

	encoded, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}

	value := map[string]interface{}{}
	if err := json.Unmarshal(encoded, &value); err != nil {
		return nil, err
	}

	return value, nil
}
