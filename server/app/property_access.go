// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"github.com/mattermost/mattermost-plugin-boards/server/model"
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

// PropertyAccessEvaluator answers "what may this user do with this card".
// It is immutable and its answers have no side effects.
type PropertyAccessEvaluator struct {
	isAdmin         bool
	enabled         bool
	boardPermission model.EffectiveBoardPermission

	// floor is the minimum granted by a full visibility duty (FR-022).
	floor model.EffectiveBoardPermission
}

// NewPropertyAccessEvaluator precomputes everything that does not depend on the
// card, so evaluating one card later costs a lookup rather than a rule scan.
func NewPropertyAccessEvaluator(input EvaluatorInput) *PropertyAccessEvaluator {
	evaluator := &PropertyAccessEvaluator{
		isAdmin:         input.IsAdmin,
		boardPermission: input.BoardPermission,
		floor:           model.EffectiveBoardPermissionNone,
	}

	if input.Settings != nil {
		evaluator.enabled = input.Settings.Enabled
	}

	return evaluator
}

// For returns the permission the user has on one card.
func (e *PropertyAccessEvaluator) For(_ *model.Block) model.EffectiveBoardPermission {
	if e.isAdmin {
		return model.EffectiveBoardPermissionManage
	}

	if !e.enabled {
		return e.boardPermission
	}

	return higherPermission(e.boardPermission, e.floor)
}

// higherPermission returns whichever of the two ranks higher on the shared
// board permission ladder.
func higherPermission(a, b model.EffectiveBoardPermission) model.EffectiveBoardPermission {
	if model.EffectivePermissionRank(a) >= model.EffectivePermissionRank(b) {
		return a
	}
	return b
}
