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
// a floor, authorship is a floor inside the gate.
//
// An active rule set takes precedence over the board's sharing role. A card no
// rule mentions is therefore readable rather than editable: the board editor
// role no longer carries through (FR-015). Only the admin bypass and the creator
// floor lift it.
//
// The two floors sit on opposite sides of the organization gate, and that
// placement is the whole design:
//
//   - full visibility is outside — it is the one thing meant to reach across
//     organization boundaries (FR-022)
//   - authorship is inside — otherwise creating a card and labeling it with
//     another division would be a way through the gate
//
// Everything expensive happens once, when the evaluator is built. For(card) is
// a map lookup so the websocket fan-out can afford one evaluator per recipient.

// EvaluatorInput is everything the evaluator needs about one (user, board)
// pair. Collecting it is the caller's job; the evaluator performs no I/O.
type EvaluatorInput struct {
	// UserID identifies whose access is being judged. It is compared against a
	// card's CreatedBy to apply the creator floor, so an empty value must never
	// match an equally empty CreatedBy.
	UserID string

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
	input := EvaluatorInput{UserID: userID}
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
	card, err := a.cardForBlock(block, nil)
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
			UserID:          userID,
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

	// userID is compared against a card's CreatedBy for the creator floor.
	userID string

	// floor is the minimum granted by a full visibility duty (FR-022).
	floor model.EffectiveBoardPermission

	// gates and grants are keyed by card condition, so evaluating a card is a
	// lookup per property value rather than a scan over every rule (R3).
	gates  map[cardCondition]orgGate
	grants map[cardCondition]model.EffectiveBoardPermission

	// admitted records, per property, the values whose rules admit this user.
	// A new card is filled from it, so the card starts life in the one place
	// the rules let its author work.
	admitted map[string]map[string]bool
}

// NewPropertyAccessEvaluator precomputes everything that does not depend on the
// card, so evaluating one card later costs a lookup rather than a rule scan.
func NewPropertyAccessEvaluator(input EvaluatorInput) *PropertyAccessEvaluator {
	evaluator := &PropertyAccessEvaluator{
		isAdmin:         input.IsAdmin,
		boardPermission: input.BoardPermission,
		userID:          input.UserID,
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

	// "보드 전체보기" is the one thing that reaches across the organization gate.
	// It is a floor rather than a grant: it guarantees reading and never lowers
	// what a rule already gave (FR-022).
	if hasFullVisibility(input.Duties, dutyID) {
		evaluator.floor = model.EffectiveBoardPermissionView
	}

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

		// The row admits this user, so its value is a place they are meant to
		// work. Collected whatever permission it grants: on the OKR board the
		// organization row only grants commenting, yet its value is still the
		// one a new card belongs under.
		if evaluator.admitted == nil {
			evaluator.admitted = map[string]map[string]bool{}
		}
		if evaluator.admitted[rule.PropertyID] == nil {
			evaluator.admitted[rule.PropertyID] = map[string]bool{}
		}
		evaluator.admitted[rule.PropertyID][rule.PropertyValueID] = true
	}

	return evaluator
}

// hasFullVisibility reports whether the duty the user holds carries the board
// wide read flag.
//
// A duty ID the master no longer lists carries nothing: the master belongs to
// the main server and a duty may be retired after someone was assigned it
// (FR-036).
func hasFullVisibility(duties []*model.Duty, dutyID string) bool {
	if dutyID == "" {
		return false
	}
	for _, duty := range duties {
		if duty != nil && duty.ID == dutyID {
			return duty.FullVisibility
		}
	}
	return false
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
func (e *PropertyAccessEvaluator) For(card *model.Block) model.EffectiveBoardPermission {
	return e.evaluate(card, e.ownerFloor(card))
}

// ForByRulesOnly answers "what would the rules alone allow", ignoring the fact
// that the user may have authored the card.
//
// The condition-property write check is built on this rather than on For: an
// author who could satisfy the check by authorship would be able to walk their
// own card into any state simply by creating it blank first, which is exactly
// the escalation the check exists to stop.
func (e *PropertyAccessEvaluator) ForByRulesOnly(card *model.Block) model.EffectiveBoardPermission {
	return e.evaluate(card, model.EffectiveBoardPermissionNone)
}

// evaluate is For with the creator floor supplied by the caller, so the two
// public entry points cannot drift apart.
func (e *PropertyAccessEvaluator) evaluate(card *model.Block, ownerFloor model.EffectiveBoardPermission) model.EffectiveBoardPermission {
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

	// Walked in place rather than collected first: this runs once per card per
	// request, and once per card per recipient in the websocket fan-out.
	eachCardCondition(card, func(condition cardCondition) {
		gate, ok := e.gates[condition]
		if !ok {
			return
		}
		matched = true
		gated = gated || gate.constrained
		gatePassed = gatePassed || gate.passed
		rulePermission = higherPermission(rulePermission, e.grants[condition])
	})

	if !matched {
		// An active rule set outranks the board's sharing role, so a card no
		// rule mentions is readable rather than editable (FR-015 as revised).
		// The author of the card is the exception.
		return higherPermission(model.EffectiveBoardPermissionView, ownerFloor)
	}

	if gated && !gatePassed {
		// The gate closed. The full visibility floor still applies — it is the
		// one thing that reaches across organization boundaries (FR-022).
		// Authorship deliberately does not: see the type comment.
		return e.floor
	}

	return higherPermission(higherPermission(rulePermission, e.floor), ownerFloor)
}

// ownerFloor reports the minimum the card's author is guaranteed on it.
//
// Whoever created a card can always work on it, which is what stops a card from
// stranding: setting a value you are not entitled to used to leave a card its
// own author could neither edit nor delete, and only a system admin could clear.
func (e *PropertyAccessEvaluator) ownerFloor(card *model.Block) model.EffectiveBoardPermission {
	if e.userID == "" || card == nil || card.CreatedBy != e.userID {
		return model.EffectiveBoardPermissionNone
	}
	return model.EffectiveBoardPermissionEdit
}

// MatchesAnyCondition reports whether any rule's card side mentions a value this
// card carries.
//
// The condition-property write check uses it as an escape hatch: a card no rule
// condition mentions is not governed by any rule, so creating one — the blank
// card every new row starts as — is always allowed.
func (e *PropertyAccessEvaluator) MatchesAnyCondition(card *model.Block) bool {
	return len(e.conditionsOf(card)) > 0
}

// SameConditions reports whether two versions of a card sit under exactly the
// same rule conditions.
//
// The write check keys on this rather than on the card's final state. Judging
// the state alone would refuse a 팀장 renaming their own 전략 card, because the
// value the card already carries is one they could not have set — the check is
// about the change, not about where the card already stood.
func (e *PropertyAccessEvaluator) SameConditions(before, after *model.Block) bool {
	from := e.conditionsOf(before)
	to := e.conditionsOf(after)

	if len(from) != len(to) {
		return false
	}
	for condition := range from {
		if !to[condition] {
			return false
		}
	}
	return true
}

// conditionsOf collects the rule conditions a card satisfies.
func (e *PropertyAccessEvaluator) conditionsOf(card *model.Block) map[cardCondition]bool {
	if !e.enabled {
		return nil
	}

	var matched map[cardCondition]bool
	eachCardCondition(card, func(condition cardCondition) {
		if _, ok := e.gates[condition]; !ok {
			return
		}
		if matched == nil {
			matched = map[cardCondition]bool{}
		}
		matched[condition] = true
	})
	return matched
}

// eachCardCondition visits every (property, value) pair the card carries. A
// multiSelect property contributes one pair per selected value (FR-023).
//
// Repeats do not need filtering out: the caller combines with max and with or,
// so seeing the same pair twice changes nothing.
func eachCardCondition(card *model.Block, visit func(cardCondition)) {
	if card == nil {
		return
	}

	properties, ok := card.Fields["properties"].(map[string]interface{})
	if !ok {
		return
	}

	for propertyID, raw := range properties {
		eachPropertyValueID(raw, func(valueID string) {
			visit(cardCondition{propertyID: propertyID, valueID: valueID})
		})
	}
}

// eachPropertyValueID visits one stored property value. Select properties store
// a string, multiSelect properties a list; both arrive as interface{} because
// the block fields round trip through JSON.
func eachPropertyValueID(raw interface{}, visit func(string)) {
	switch value := raw.(type) {
	case string:
		if value != "" {
			visit(value)
		}
	case []string:
		for _, item := range value {
			if item != "" {
				visit(item)
			}
		}
	case []interface{}:
		for _, item := range value {
			if str, ok := item.(string); ok && str != "" {
				visit(str)
			}
		}
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

// GetCardPermissionsForUser reports what the rules allow this user on each of a
// board's cards, keyed by card ID.
//
// It answers the screen's question rather than the API's: the rules were being
// enforced but were invisible, so a member could type into a card they had no
// permission to change and only discover it when the save was refused.
//
// A board without an active rule set returns nil, and the client falls back to
// the board wide capabilities. That is the overwhelming majority of boards, and
// it costs a map lookup rather than a pass over every card.
func (a *App) GetCardPermissionsForUser(userID, boardID string) (map[string]model.BoardPermissionCapabilities, error) {
	board, err := a.GetBoard(boardID)
	if err != nil || board == nil {
		return nil, err
	}

	evaluator, err := a.newPropertyAccessEvaluator(userID, board)
	if err != nil {
		return nil, err
	}
	if !evaluator.Enforces() {
		return nil, nil
	}

	blocks, err := a.GetBlocksForBoard(boardID)
	if err != nil {
		return nil, err
	}

	permissions := map[string]model.BoardPermissionCapabilities{}
	for _, block := range blocks {
		if block == nil || block.Type != model.TypeCard {
			continue
		}
		granted := evaluator.For(block)
		if granted == model.EffectiveBoardPermissionNone {
			// The card is filtered out of the response anyway, so naming it here
			// would leak the fact that it exists.
			continue
		}
		permissions[block.ID] = model.BuildCapabilities(granted)
	}

	return permissions, nil
}

// DefaultConditionValues reports the rule condition values a new card should be
// born with, keyed by property ID.
//
// A sub-card used to copy its parent's values, which meant a 팀장 adding one
// under an Object card produced another Object card — a shape the rules never
// let them create. The OKR ladder (Object → Key Results → Tasks) therefore had
// no way to be built: every rung came out as a copy of the rung above.
//
// The values are read out of the rules instead. Whichever value's row admits
// this user is the one they get, so the card starts life in the one place they
// are meant to work. Nothing about OKR is encoded here; the rows carry it.
//
// A property two rows admit is left empty. Choosing for the user would be a
// guess, and the wrong guess files the card somewhere they did not ask for.
func (e *PropertyAccessEvaluator) DefaultConditionValues() map[string]string {
	if !e.enabled || len(e.admitted) == 0 {
		return nil
	}

	defaults := map[string]string{}
	for propertyID, values := range e.admitted {
		if len(values) != 1 {
			continue
		}
		for valueID := range values {
			defaults[propertyID] = valueID
		}
	}

	if len(defaults) == 0 {
		return nil
	}
	return defaults
}
