// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// The decision table these tests encode lives in
// specs/002-card-property-access/research.md R6.
//
// Rules under test:
//
//	행1  card: C-Level=전략   subject: division=전략     → viewer
//	행2  card: C-Level=전략   subject: duty=본부장       → editor
//
// Organization is a gate, duty is additive, full visibility is a floor.

const (
	propCLevel      = "prop-clevel"
	valueStrategy   = "opt-strategy"
	valueProduction = "opt-production"

	divStrategy   = "div-strategy"
	divProduction = "div-production"
	depPlanning   = "dep-planning" // under 전략
	depFactory    = "dep-factory"  // under 생산

	dutyHead = "duty-head" // 본부장, full visibility
	dutyLead = "duty-lead" // 팀장, no full visibility
)

func testOrgUnits() []*model.OrgUnit {
	return []*model.OrgUnit{
		{ID: divStrategy, Type: model.OrgUnitTypeDivision},
		{ID: divProduction, Type: model.OrgUnitTypeDivision},
		{ID: depPlanning, Type: model.OrgUnitTypeDepartment, ParentID: divStrategy},
		{ID: depFactory, Type: model.OrgUnitTypeDepartment, ParentID: divProduction},
	}
}

func testDuties() []*model.Duty {
	return []*model.Duty{
		{ID: dutyHead, Name: "본부장", Rank: 2, FullVisibility: true},
		{ID: dutyLead, Name: "팀장", Rank: 3, FullVisibility: false},
	}
}

func testSettings() *model.PropertyAccessSettings {
	return &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{
			{
				ID: "r1", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DivisionID: divStrategy, Permission: model.PropertyAccessViewer,
			},
			{
				ID: "r2", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DutyID: dutyHead, Permission: model.PropertyAccessEditor,
			},
		},
	}
}

// card builds a card block carrying one property value.
func card(propertyID, valueID string) *model.Block {
	fields := map[string]interface{}{}
	if propertyID != "" {
		fields["properties"] = map[string]interface{}{propertyID: valueID}
	}
	return &model.Block{ID: "card-1", Type: model.TypeCard, Fields: fields}
}

// multiSelectCard builds a card whose property holds several value IDs, which
// is how a multiSelect property is stored.
func multiSelectCard(propertyID string, valueIDs ...string) *model.Block {
	values := make([]interface{}, 0, len(valueIDs))
	for _, valueID := range valueIDs {
		values = append(values, valueID)
	}
	return &model.Block{
		ID:     "card-1",
		Type:   model.TypeCard,
		Fields: map[string]interface{}{"properties": map[string]interface{}{propertyID: values}},
	}
}

// evaluatorFor builds an evaluator for a user sitting in one org unit with one
// duty, against the two rule decision table of research.md R6.
//
//nolint:unparam // the board permission is spelled out at each call site because it is what the rule has to override
func evaluatorFor(orgUnitID, dutyID string, boardPermission model.EffectiveBoardPermission) *PropertyAccessEvaluator {
	var profile *model.UserOrgProfile
	if orgUnitID != "" || dutyID != "" {
		profile = &model.UserOrgProfile{PrimaryOrgUnitID: orgUnitID, PrimaryDutyID: dutyID}
	}

	return NewPropertyAccessEvaluator(EvaluatorInput{
		Settings:        testSettings(),
		OrgUnits:        testOrgUnits(),
		Duties:          testDuties(),
		Profile:         profile,
		BoardPermission: boardPermission,
	})
}

func TestEvaluatorAdminBypass(t *testing.T) {
	input := EvaluatorInput{
		Settings:        testSettings(),
		OrgUnits:        testOrgUnits(),
		Duties:          testDuties(),
		IsAdmin:         true,
		BoardPermission: model.EffectiveBoardPermissionView,
	}

	evaluator := NewPropertyAccessEvaluator(input)

	require.Equal(t, model.EffectiveBoardPermissionManage, evaluator.For(card(propCLevel, valueStrategy)),
		"a board or system admin bypasses the rules entirely")
}

func TestEvaluatorDisabled(t *testing.T) {
	settings := testSettings()
	settings.Enabled = false

	input := EvaluatorInput{
		Settings:        settings,
		OrgUnits:        testOrgUnits(),
		Duties:          testDuties(),
		BoardPermission: model.EffectiveBoardPermissionEdit,
		Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depFactory},
	}

	evaluator := NewPropertyAccessEvaluator(input)

	require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(card(propCLevel, valueStrategy)),
		"with the switch off every card follows the board permission")
}

func TestEvaluatorCardOutsideAnyRule(t *testing.T) {
	input := EvaluatorInput{
		Settings:        testSettings(),
		OrgUnits:        testOrgUnits(),
		Duties:          testDuties(),
		BoardPermission: model.EffectiveBoardPermissionEdit,
		Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depFactory},
	}

	evaluator := NewPropertyAccessEvaluator(input)

	t.Run("a value no rule mentions falls through to the board permission", func(t *testing.T) {
		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(card(propCLevel, valueProduction)))
	})

	t.Run("a card with no properties at all falls through", func(t *testing.T) {
		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(card("", "")))
	})

	t.Run("a nil card falls through", func(t *testing.T) {
		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(nil))
	})
}

func TestEvaluatorNoSettings(t *testing.T) {
	input := EvaluatorInput{
		BoardPermission: model.EffectiveBoardPermissionCommenter,
	}

	evaluator := NewPropertyAccessEvaluator(input)

	require.Equal(t, model.EffectiveBoardPermissionCommenter, evaluator.For(card(propCLevel, valueStrategy)),
		"a board that never had rules behaves exactly as before")
}

// TestEvaluatorOrgGate covers the organization rows of the research.md R6
// decision table. Duty rows are exercised by the US3 tests and the full
// visibility floor by the US4 tests.
func TestEvaluatorOrgGate(t *testing.T) {
	strategyCard := card(propCLevel, valueStrategy)

	t.Run("a 팀장 of the matching division passes the gate and takes 행1", func(t *testing.T) {
		evaluator := evaluatorFor(depPlanning, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(strategyCard),
			"the rule replaces the board permission even when it is lower")
	})

	t.Run("a 팀장 of another division is stopped by the gate", func(t *testing.T) {
		evaluator := evaluatorFor(depFactory, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionNone, evaluator.For(strategyCard))
	})

	t.Run("a user with no organization information is stopped by the gate", func(t *testing.T) {
		evaluator := evaluatorFor("", "", model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionNone, evaluator.For(strategyCard),
			"FR-021 — no assignment fails every organization condition")
	})

	t.Run("a division condition matches through the department parent", func(t *testing.T) {
		direct := evaluatorFor(divStrategy, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionView, direct.For(strategyCard),
			"FR-017 — the unit itself counts as its own ancestor")
	})
}

// TestEvaluatorDepartmentCondition checks the department axis on its own, since
// the R6 table only spells out division rows.
func TestEvaluatorDepartmentCondition(t *testing.T) {
	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{{
			ID: "r1", PropertyID: propCLevel, PropertyValueID: valueStrategy,
			DepartmentID: depPlanning, Permission: model.PropertyAccessCommenter,
		}},
	}

	build := func(orgUnitID string) *PropertyAccessEvaluator {
		return NewPropertyAccessEvaluator(EvaluatorInput{
			Settings:        settings,
			OrgUnits:        testOrgUnits(),
			Duties:          testDuties(),
			Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: orgUnitID},
			BoardPermission: model.EffectiveBoardPermissionEdit,
		})
	}

	require.Equal(t, model.EffectiveBoardPermissionCommenter, build(depPlanning).For(card(propCLevel, valueStrategy)))
	require.Equal(t, model.EffectiveBoardPermissionNone, build(depFactory).For(card(propCLevel, valueStrategy)))

	require.Equal(t, model.EffectiveBoardPermissionNone, build(divStrategy).For(card(propCLevel, valueStrategy)),
		"a department condition does not travel down to the parent division's other members")
}

// TestEvaluatorMaxAcrossRows checks that several matching rows combine with max
// rather than the last one winning (FR-010 ladder, R6 step 3).
func TestEvaluatorMaxAcrossRows(t *testing.T) {
	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{
			{
				ID: "r1", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DivisionID: divStrategy, Permission: model.PropertyAccessEditor,
			},
			{
				ID: "r2", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DepartmentID: depPlanning, Permission: model.PropertyAccessViewer,
			},
		},
	}

	evaluator := NewPropertyAccessEvaluator(EvaluatorInput{
		Settings:        settings,
		OrgUnits:        testOrgUnits(),
		Duties:          testDuties(),
		Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depPlanning},
		BoardPermission: model.EffectiveBoardPermissionView,
	})

	require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(card(propCLevel, valueStrategy)),
		"both rows match, so the higher of the two applies")
}

// TestEvaluatorMultiSelectCard covers FR-023: a multiSelect property matches
// when the rule's value is one of the values the card carries.
func TestEvaluatorMultiSelectCard(t *testing.T) {
	blocked := evaluatorFor(depFactory, dutyLead, model.EffectiveBoardPermissionEdit)

	require.Equal(t, model.EffectiveBoardPermissionNone,
		blocked.For(multiSelectCard(propCLevel, valueProduction, valueStrategy)),
		"one matching value is enough to bring the card under the rule")

	require.Equal(t, model.EffectiveBoardPermissionEdit,
		blocked.For(multiSelectCard(propCLevel, valueProduction)),
		"no matching value leaves the card outside every rule")
}
