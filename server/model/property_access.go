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

// OrgRelation is how a rule compares the card's organization to the viewer's,
// instead of naming an organization outright.
//
// Naming one means writing a rule per organization, and "본인 본부" cannot be
// written at all — which is what made the standard OKR permission matrix
// inexpressible. See specs/009-card-access-role-matrix/research.md R1.
type OrgRelation = string

const (
	// RelationNone is an old rule: no relation, read the absolute axes.
	RelationNone OrgRelation = ""

	// RelationAny uses a relation but places no organization constraint. It is
	// still a gate — that is what tells it apart from RelationNone.
	RelationAny OrgRelation = "any"

	RelationSameDivision   OrgRelation = "sameDivision"
	RelationOtherDivision  OrgRelation = "otherDivision"
	RelationSameDepartment OrgRelation = "sameDepartment"

	// RelationMine matches when the viewer authored the card or is named in its
	// assignee property. Either one is enough.
	RelationMine OrgRelation = "mine"
)

// IsOrgRelation reports whether a stored value is one this build understands.
// Anything else is refused at save time rather than silently ignored: a relation
// nobody recognizes would change a judgement without anyone seeing it.
func IsOrgRelation(relation OrgRelation) bool {
	switch relation {
	case RelationNone, RelationAny, RelationSameDivision,
		RelationOtherDivision, RelationSameDepartment, RelationMine:
		return true
	default:
		return false
	}
}

// PropertyAccessRule is one row of the rule table.
//
// The card side (PropertyID plus PropertyValueIDs, or the single
// PropertyValueID an older rule carries) selects which cards the row applies to.
// The subject side selects which users; an empty field means "no constraint on
// this axis".
//
// The organization axis comes in two forms. An older rule names a division or a
// department outright. A newer one sets Relation and has the axis judged against
// the card. Relation wins when both are present — two answers to the same
// question cannot both be applied, and reading the row would not say which one
// the author meant.
//
// The absolute axes store IDs: OrgUnits.id for organization and
// PositionDefinitions.id for duty. UserOrgProfiles binds both the same way, so
// no conversion is needed. See specs/002-card-property-access/research.md R5.
type PropertyAccessRule struct {
	ID         string `json:"id"`
	PropertyID string `json:"propertyId"`

	// PropertyValueIDs lets one row name several values — "Objective 또는 Key
	// Result" is one row rather than two. PropertyValueID is what an older rule
	// carries; CardValueIDs reads whichever is present.
	PropertyValueIDs []string `json:"propertyValueIds,omitempty"`
	PropertyValueID  string   `json:"propertyValueId"`

	DivisionID   string `json:"divisionId"`
	DepartmentID string `json:"departmentId"`

	// TierIDs point at duty tiers the team owns. One row can name several —
	// "팀장 또는 팀원" is one row. DutyID is what an older rule carries; the
	// tiers are read first.
	TierIDs []string `json:"tierIds,omitempty"`
	DutyID  string   `json:"dutyId"`

	// Relation replaces the two absolute organization axes when set.
	Relation OrgRelation `json:"relation,omitempty"`

	// OrgPropertyID names the card property a division or department relation
	// reads. A board can carry two 본부 properties — "주관" and "협조" — so the
	// rule says which, rather than the server picking the first and changing its
	// answer when the property order changes.
	OrgPropertyID string `json:"orgPropertyId,omitempty"`

	// AssigneePropertyID names the person property RelationMine reads. Empty is
	// allowed: authorship alone still decides.
	AssigneePropertyID string `json:"assigneePropertyId,omitempty"`

	Permission PropertyAccessPermission `json:"permission"`

	// Source marks the rows the matrix editor owns, so saving from the matrix
	// replaces those and leaves hand-written exceptions alone.
	Source string `json:"source,omitempty"`
}

// SourceMatrix marks a rule the matrix editor generated.
const SourceMatrix = "matrix"

// CardValueIDs returns the values this rule's card side names, reading the list
// first and falling back to the single value an older rule carries.
func (r PropertyAccessRule) CardValueIDs() []string {
	if len(r.PropertyValueIDs) > 0 {
		return r.PropertyValueIDs
	}
	if r.PropertyValueID == "" {
		return nil
	}
	return []string{r.PropertyValueID}
}

// UsesRelation reports whether the row judges organization against the card
// rather than against a named organization.
func (r PropertyAccessRule) UsesRelation() bool {
	return r.Relation != RelationNone
}

// HasOrgCondition reports whether the row constrains the organization axis.
// Rows that do act as a gate: a user matching none of them gets no rule
// permission at all, however high their duty is.
//
// A relation counts, RelationAny included. Leaving it out would drop a matrix
// row that grants nothing to this viewer out of the gate, and the blank cells of
// the matrix would come back as readable instead of hidden (009 FR-009).
func (r PropertyAccessRule) HasOrgCondition() bool {
	if r.UsesRelation() {
		return true
	}
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
