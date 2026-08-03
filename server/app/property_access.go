// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"fmt"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// Card level access evaluation.
//
// The decision model is documented in specs/002-card-property-access/research.md
// R6. In one line: organization is a gate, duty is additive, full visibility is
// a floor.
//
// Everything expensive happens once, when the evaluator is built. For(card) is
// a map lookup so the websocket fan-out can afford one evaluator per recipient.

// EvaluatorInput is everything the evaluator needs about one (user, board)
// pair. Collecting it is the caller's job; the evaluator performs no I/O.
type EvaluatorInput struct {
	// Settings is the board's rule set. A nil value means the board has no
	// rules, which behaves exactly like a disabled switch.
	Settings *model.PropertyAccessSettings

	// OrgUnits is the team's organization master, used to resolve the
	// ancestors of the user's unit.
	OrgUnits []*model.OrgUnit

	// Duties is the team's duty master, used to find the full visibility flag.
	Duties []*model.Duty

	// Profile is the user's organization assignment. A nil value means the
	// user has no organization information and fails every organization
	// condition (FR-021).
	Profile *model.UserOrgProfile

	// IsAdmin short circuits everything: board admins and system admins keep
	// full access no matter how the rules are set (FR-014).
	IsAdmin bool

	// BoardPermission is the permission the user already has on the board.
	// Cards no rule matches keep it unchanged (FR-015).
	BoardPermission model.EffectiveBoardPermission
}

// newPropertyAccessEvaluator gathers what one (user, board) pair needs and
// returns an evaluator over it.
//
// The lookups are arranged so a board without rules — which is every board until
// someone opens the share dialog — costs nothing beyond reading a map key that
// is not there.
func (a *App) newPropertyAccessEvaluator(userID string, board *model.Board) (*PropertyAccessEvaluator, error) {
	input := EvaluatorInput{}
	if board == nil {
		return NewPropertyAccessEvaluator(input), nil
	}

	settings, err := model.PropertyAccessSettingsFromProperties(board.Properties)
	if err != nil {
		return nil, err
	}
	input.Settings = settings

	if settings == nil || !settings.Enabled {
		return NewPropertyAccessEvaluator(input), nil
	}

	resolved, err := a.permissions.GetBoardPermissions(userID, board.ID)
	if err != nil {
		return nil, err
	}
	input.BoardPermission = model.NormalizeEffectivePermission(resolved.EffectivePermission)
	input.IsAdmin = model.EffectivePermissionRank(input.BoardPermission) >=
		model.EffectivePermissionRank(model.EffectiveBoardPermissionManage)

	// An admin passes every card anyway, so the organization lookups would be
	// wasted work (FR-014).
	if input.IsAdmin {
		return NewPropertyAccessEvaluator(input), nil
	}

	if input.OrgUnits, err = a.GetOrgUnitsForTeam(board.TeamID); err != nil {
		return nil, err
	}
	if input.Duties, err = a.GetDutiesForTeam(board.TeamID); err != nil {
		return nil, err
	}

	profiles, err := a.GetUserOrgProfiles(board.TeamID, []string{userID})
	if err != nil {
		return nil, err
	}
	input.Profile = profiles[userID]

	return NewPropertyAccessEvaluator(input), nil
}

// FilterBlockRecipients narrows a websocket recipient list to the users allowed
// to hear about one block (FR-029).
//
// The whole fan-out is answered in one pass: the board, the organization master
// and every recipient's assignment are read once, and one evaluator per user is
// built over that shared data. Nothing is kept afterwards — a user whose
// assignment changes is judged fresh on the next broadcast (SC-006).
//
// The recipient list arrives with duplicates: the path the block fan-out takes
// through getUserIDsForTeamAndBoard has no deduplication of its own, and today's
// absence of duplicates rests on an upstream accident rather than a guarantee.
func (a *App) FilterBlockRecipients(userIDs []string, block *model.Block) []string {
	if block == nil || len(userIDs) == 0 {
		return userIDs
	}

	board, err := a.GetBoard(block.BoardID)
	if err != nil {
		// Without the board nothing can be judged. Sending anyway would make a
		// lookup failure a way to receive hidden content.
		a.logger.Warn("cannot load board for websocket access filtering",
			mlog.String("boardID", block.BoardID), mlog.Err(err))
		return nil
	}
	if board == nil {
		return userIDs
	}

	settings, err := model.PropertyAccessSettingsFromProperties(board.Properties)
	if err != nil || settings == nil || !settings.Enabled {
		return userIDs
	}

	// A block outside any card — a view, the board description — is never
	// governed by a rule, so the fan-out is left alone.
	card, err := a.cardForBlock(block)
	if err != nil {
		return nil
	}
	if card == nil {
		return userIDs
	}

	unique := dedupeStrings(userIDs)

	orgUnits, err := a.GetOrgUnitsForTeam(board.TeamID)
	if err != nil {
		return nil
	}
	duties, err := a.GetDutiesForTeam(board.TeamID)
	if err != nil {
		return nil
	}
	profiles, err := a.GetUserOrgProfiles(board.TeamID, unique)
	if err != nil {
		return nil
	}

	allowed := make([]string, 0, len(unique))
	for _, userID := range unique {
		resolved, permErr := a.permissions.GetBoardPermissions(userID, board.ID)
		if permErr != nil {
			continue
		}

		boardPermission := model.NormalizeEffectivePermission(resolved.EffectivePermission)
		evaluator := NewPropertyAccessEvaluator(EvaluatorInput{
			Settings:        settings,
			OrgUnits:        orgUnits,
			Duties:          duties,
			Profile:         profiles[userID],
			BoardPermission: boardPermission,
			IsAdmin: model.EffectivePermissionRank(boardPermission) >=
				model.EffectivePermissionRank(model.EffectiveBoardPermissionManage),
		})

		if evaluator.For(card) != model.EffectiveBoardPermissionNone {
			allowed = append(allowed, userID)
		}
	}

	return allowed
}

// validatePropertyAccessSettings rejects a rule set the share dialog should
// never have produced. The checks are listed in data-model.md §1.2.
//
// Organization and duty IDs are deliberately not checked for existence: the
// masters belong to the main server and a row may be retired after a rule
// referencing it was written. Such a rule simply stops matching, and the share
// dialog marks it as broken (FR-036).
func validatePropertyAccessSettings(settings *model.PropertyAccessSettings) error {
	if settings == nil {
		return nil
	}

	for i, rule := range settings.Rules {
		switch {
		case rule.PropertyID == "":
			return model.NewErrBadRequest(fmt.Sprintf("propertyAccess rule %d: propertyId is required", i))
		case rule.PropertyValueID == "":
			return model.NewErrBadRequest(fmt.Sprintf("propertyAccess rule %d: propertyValueId is required", i))
		case !rule.HasOrgCondition() && rule.DutyID == "":
			// A row with no subject condition would grant everyone the
			// permission, which is never what an admin means to express.
			return model.NewErrBadRequest(fmt.Sprintf("propertyAccess rule %d: at least one of divisionId, departmentId or dutyId is required", i))
		}

		switch rule.Permission {
		case model.PropertyAccessViewer, model.PropertyAccessCommenter, model.PropertyAccessEditor:
		default:
			return model.NewErrBadRequest(fmt.Sprintf("propertyAccess rule %d: permission %q is not one of viewer, commenter, editor", i, rule.Permission))
		}
	}

	return nil
}

// cardCondition identifies the card side of a rule: one property and one of its
// option values. It is the key both precomputed maps are built on.
type cardCondition struct {
	propertyID string
	valueID    string
}

// orgGate records, for one card condition, whether any rule constrains the
// organization axis and whether this user satisfies at least one of them.
//
// Both facts are needed: a condition with no organization rows lets everyone
// through to the grant map, while a condition that has them and matches none of
// them denies regardless of how high the user's duty is (research.md R6).
type orgGate struct {
	constrained bool
	passed      bool
}

// PropertyAccessEvaluator answers "what may this user do with this card".
// It is immutable and its answers have no side effects.
type PropertyAccessEvaluator struct {
	isAdmin         bool
	enabled         bool
	boardPermission model.EffectiveBoardPermission

	// floor is the minimum granted by a full visibility duty (FR-022).
	floor model.EffectiveBoardPermission

	// gates and grants are keyed by card condition, so evaluating a card is a
	// lookup per property value rather than a scan over every rule (R3).
	gates  map[cardCondition]orgGate
	grants map[cardCondition]model.EffectiveBoardPermission
}

// NewPropertyAccessEvaluator precomputes everything that does not depend on the
// card, so evaluating one card later costs a lookup rather than a rule scan.
func NewPropertyAccessEvaluator(input EvaluatorInput) *PropertyAccessEvaluator {
	evaluator := &PropertyAccessEvaluator{
		isAdmin:         input.IsAdmin,
		boardPermission: input.BoardPermission,
		floor:           model.EffectiveBoardPermissionNone,
		gates:           map[cardCondition]orgGate{},
		grants:          map[cardCondition]model.EffectiveBoardPermission{},
	}

	if input.Settings == nil {
		return evaluator
	}
	evaluator.enabled = input.Settings.Enabled
	if !evaluator.enabled {
		return evaluator
	}

	var orgUnitID, dutyID string
	if input.Profile != nil {
		orgUnitID = input.Profile.PrimaryOrgUnitID
		dutyID = input.Profile.PrimaryDutyID
	}

	// A division condition is satisfied by the user's own unit or any of its
	// ancestors, so a rule written against a division covers every department
	// beneath it (FR-017).
	units := orgUnitAncestors(input.OrgUnits, orgUnitID)

	for _, rule := range input.Settings.Rules {
		condition := cardCondition{propertyID: rule.PropertyID, valueID: rule.PropertyValueID}
		orgMatches := ruleOrgMatches(rule, units)

		if rule.HasOrgCondition() {
			gate := evaluator.gates[condition]
			gate.constrained = true
			gate.passed = gate.passed || orgMatches
			evaluator.gates[condition] = gate
		} else if _, seen := evaluator.gates[condition]; !seen {
			// Record the condition even when the row places no organization
			// constraint, so For() can tell "no rule mentions this value" from
			// "a rule mentions it and lets everyone through".
			evaluator.gates[condition] = orgGate{}
		}

		if !orgMatches || (rule.DutyID != "" && rule.DutyID != dutyID) {
			continue
		}
		granted := rule.Permission.AsEffectivePermission()
		evaluator.grants[condition] = higherPermission(evaluator.grants[condition], granted)
	}

	return evaluator
}

// ruleOrgMatches reports whether the user satisfies the organization axes this
// row specifies. Axes the row leaves empty place no constraint; axes it sets
// must all match.
func ruleOrgMatches(rule model.PropertyAccessRule, userUnits map[string]bool) bool {
	if rule.DivisionID != "" && !userUnits[rule.DivisionID] {
		return false
	}
	if rule.DepartmentID != "" && !userUnits[rule.DepartmentID] {
		return false
	}
	return true
}

// Enforces reports whether this evaluator can deny anything at all. Callers use
// it to skip the filtering work on the overwhelming majority of boards, which
// have no rules, and for admins, who pass everything.
func (e *PropertyAccessEvaluator) Enforces() bool {
	return e.enabled && !e.isAdmin
}

// For returns the permission the user has on one card.
//
// The card's property values are looked up against the precomputed maps. A card
// no rule mentions keeps the board permission untouched (FR-015).
func (e *PropertyAccessEvaluator) For(card *model.Block) model.EffectiveBoardPermission {
	if e.isAdmin {
		return model.EffectiveBoardPermissionManage
	}

	if !e.enabled {
		return e.boardPermission
	}

	var (
		matched        bool
		gated          bool
		gatePassed     bool
		rulePermission = model.EffectiveBoardPermissionNone
	)

	for condition := range cardConditions(card) {
		gate, ok := e.gates[condition]
		if !ok {
			continue
		}
		matched = true
		gated = gated || gate.constrained
		gatePassed = gatePassed || gate.passed
		rulePermission = higherPermission(rulePermission, e.grants[condition])
	}

	if !matched {
		return higherPermission(e.boardPermission, e.floor)
	}

	if gated && !gatePassed {
		// The gate closed. The full visibility floor still applies — it is the
		// one thing that reaches across organization boundaries (FR-022).
		return e.floor
	}

	return higherPermission(rulePermission, e.floor)
}

// cardConditions returns every (property, value) pair the card carries. A
// multiSelect property contributes one pair per selected value (FR-023).
func cardConditions(card *model.Block) map[cardCondition]bool {
	conditions := map[cardCondition]bool{}
	if card == nil {
		return conditions
	}

	properties, ok := card.Fields["properties"].(map[string]interface{})
	if !ok {
		return conditions
	}

	for propertyID, raw := range properties {
		for _, valueID := range propertyValueIDs(raw) {
			conditions[cardCondition{propertyID: propertyID, valueID: valueID}] = true
		}
	}

	return conditions
}

// propertyValueIDs flattens one stored property value. Select properties store
// a string, multiSelect properties a list; both arrive as interface{} because
// the block fields round trip through JSON.
func propertyValueIDs(raw interface{}) []string {
	switch value := raw.(type) {
	case string:
		if value == "" {
			return nil
		}
		return []string{value}
	case []string:
		return value
	case []interface{}:
		values := make([]string, 0, len(value))
		for _, item := range value {
			if str, ok := item.(string); ok && str != "" {
				values = append(values, str)
			}
		}
		return values
	default:
		return nil
	}
}

// higherPermission returns whichever of the two ranks higher on the shared
// board permission ladder.
func higherPermission(a, b model.EffectiveBoardPermission) model.EffectiveBoardPermission {
	if model.EffectivePermissionRank(a) >= model.EffectivePermissionRank(b) {
		return a
	}
	return b
}
