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
