// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"fmt"
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	mmModel "github.com/mattermost/mattermost/server/public/model"
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

// The websocket fan-out asks one question per broadcast, not one per recipient.
// These cover the batching promise of research.md R3 and the recipient level
// enforcement of FR-029.
func TestFilterBlockRecipients(t *testing.T) {
	const (
		boardID = "board-ws"
		teamID  = "team-ws"
	)

	setup := func(t *testing.T, enabled bool) (*TestHelper, func()) {
		t.Helper()
		th, tearDown := SetupTestHelper(t)

		settings := &model.PropertyAccessSettings{
			Enabled: enabled,
			Rules: []model.PropertyAccessRule{{
				ID: "r1", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DivisionID: divStrategy, Permission: model.PropertyAccessViewer,
			}},
		}
		value, err := settings.AsProperty()
		require.NoError(t, err)

		board := &model.Board{
			ID: boardID, TeamID: teamID,
			Properties: map[string]interface{}{model.PropertyAccessKey: value},
		}

		th.Store.EXPECT().GetBoard(boardID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetBoard(boardID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetMemberForBoard(boardID, gomock.Any()).
			Return(&model.BoardMember{BoardID: boardID, SchemeEditor: true}, nil).AnyTimes()
		// View team only. Granting manage-team as well would make every member a
		// board manager, and admins bypass the rules entirely (FR-014).
		th.API.EXPECT().HasPermissionToTeam(gomock.Any(), teamID, gomock.Any()).
			DoAndReturn(func(_, _ string, permission *mmModel.Permission) bool {
				return permission == model.PermissionViewTeam
			}).AnyTimes()

		th.Store.EXPECT().GetOrgUnitsForTeam(teamID).Return(testOrgUnits(), nil).AnyTimes()
		th.Store.EXPECT().GetDutiesForTeam(teamID).Return(testDuties(), nil).AnyTimes()

		return th, tearDown
	}

	strategyCard := &model.Block{
		ID: "card-1", BoardID: boardID, ParentID: boardID, Type: model.TypeCard,
		Fields: map[string]interface{}{"properties": map[string]interface{}{propCLevel: valueStrategy}},
	}

	t.Run("E-08 and E-09 only recipients the rule admits are kept", func(t *testing.T) {
		th, tearDown := setup(t, true)
		defer tearDown()

		th.Store.EXPECT().GetUserOrgProfiles(teamID, gomock.Any()).Return([]*model.UserOrgProfile{
			{TeamID: teamID, UserID: "insider", PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyLead},
			{TeamID: teamID, UserID: "outsider", PrimaryOrgUnitID: depFactory, PrimaryDutyID: dutyLead},
		}, nil).Times(1)

		kept := th.App.FilterBlockRecipients([]string{"insider", "outsider"}, strategyCard)

		require.Equal(t, []string{"insider"}, kept)
	})

	t.Run("recipient IDs are deduplicated before the organization lookup", func(t *testing.T) {
		th, tearDown := setup(t, true)
		defer tearDown()

		var asked []string
		th.Store.EXPECT().GetUserOrgProfiles(teamID, gomock.Any()).
			DoAndReturn(func(_ string, userIDs []string) ([]*model.UserOrgProfile, error) {
				asked = userIDs
				return []*model.UserOrgProfile{
					{TeamID: teamID, UserID: "insider", PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyLead},
				}, nil
			}).Times(1)

		kept := th.App.FilterBlockRecipients([]string{"insider", "insider", "insider"}, strategyCard)

		require.Equal(t, []string{"insider"}, asked, "one lookup, one entry per user")
		require.Equal(t, []string{"insider"}, kept)
	})

	t.Run("E-11 with the switch off the recipient list is untouched", func(t *testing.T) {
		th, tearDown := setup(t, false)
		defer tearDown()

		kept := th.App.FilterBlockRecipients([]string{"insider", "outsider"}, strategyCard)

		require.Equal(t, []string{"insider", "outsider"}, kept,
			"no organization lookup should happen at all")
	})

	t.Run("a card no rule mentions reaches everyone", func(t *testing.T) {
		th, tearDown := setup(t, true)
		defer tearDown()

		th.Store.EXPECT().GetUserOrgProfiles(teamID, gomock.Any()).Return([]*model.UserOrgProfile{}, nil).Times(1)

		openCard := &model.Block{
			ID: "card-2", BoardID: boardID, ParentID: boardID, Type: model.TypeCard,
			Fields: map[string]interface{}{"properties": map[string]interface{}{propCLevel: valueProduction}},
		}

		require.Equal(t, []string{"outsider"}, th.App.FilterBlockRecipients([]string{"outsider"}, openCard))
	})
}

// TestEvaluatorDutyIsAdditive covers the duty rows of the research.md R6
// decision table: a duty raises what the user may do inside an organization it
// already admits them to, and never opens one it does not.
func TestEvaluatorDutyIsAdditive(t *testing.T) {
	strategyCard := card(propCLevel, valueStrategy)

	t.Run("US3-1 a 본부장 of the matching division takes the higher of both rows", func(t *testing.T) {
		evaluator := evaluatorFor(depPlanning, dutyHead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(strategyCard))
	})

	t.Run("US3-2 a 팀장 of the same division only takes the organization row", func(t *testing.T) {
		evaluator := evaluatorFor(depPlanning, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(strategyCard))
	})

	t.Run("US3-3 a 본부장 of another division gets no rule permission", func(t *testing.T) {
		evaluator := evaluatorFor(depFactory, dutyHead, model.EffectiveBoardPermissionEdit)

		// The gate closed, so the duty row grants nothing. What is left is the
		// full visibility floor this duty carries — see the US4 tests.
		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(strategyCard),
			"the duty must not open an organization the rules keep shut")
	})

	t.Run("a 팀장 of another division is left with nothing", func(t *testing.T) {
		evaluator := evaluatorFor(depFactory, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionNone, evaluator.For(strategyCard))
	})
}

// TestEvaluatorDutyOnlyRule covers US3-4: a row with a duty and no organization
// condition applies wherever that duty is held.
func TestEvaluatorDutyOnlyRule(t *testing.T) {
	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{{
			ID: "r1", PropertyID: propCLevel, PropertyValueID: valueStrategy,
			DutyID: dutyLead, Permission: model.PropertyAccessCommenter,
		}},
	}

	build := func(orgUnitID, dutyID string) *PropertyAccessEvaluator {
		return NewPropertyAccessEvaluator(EvaluatorInput{
			Settings:        settings,
			OrgUnits:        testOrgUnits(),
			Duties:          testDuties(),
			Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: orgUnitID, PrimaryDutyID: dutyID},
			BoardPermission: model.EffectiveBoardPermissionEdit,
		})
	}

	strategyCard := card(propCLevel, valueStrategy)

	require.Equal(t, model.EffectiveBoardPermissionCommenter, build(depPlanning, dutyLead).For(strategyCard))
	require.Equal(t, model.EffectiveBoardPermissionCommenter, build(depFactory, dutyLead).For(strategyCard),
		"no organization row means no gate, so the division does not matter")

	require.Equal(t, model.EffectiveBoardPermissionNone, build(depFactory, "").For(strategyCard),
		"a user without the duty gets nothing from a duty-only row")
}

// TestEvaluatorDutyIsNotAGate covers FR-018: a member with no duty at all still
// earns what the organization row grants.
func TestEvaluatorDutyIsNotAGate(t *testing.T) {
	evaluator := evaluatorFor(depPlanning, "", model.EffectiveBoardPermissionEdit)

	require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(card(propCLevel, valueStrategy)),
		"membership alone has to be expressible")
}

// TestEvaluatorFullVisibilityFloor covers US4: the floor reaches across
// organization boundaries but never lowers what a rule already granted.
func TestEvaluatorFullVisibilityFloor(t *testing.T) {
	strategyCard := card(propCLevel, valueStrategy)

	t.Run("US4-1 a blocked card is still readable", func(t *testing.T) {
		evaluator := evaluatorFor(depFactory, dutyHead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(strategyCard))
	})

	t.Run("US4-2 the floor does not lower a rule that grants more", func(t *testing.T) {
		evaluator := evaluatorFor(depPlanning, dutyHead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(strategyCard))
	})

	t.Run("a duty without full visibility carries no floor", func(t *testing.T) {
		evaluator := evaluatorFor(depFactory, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionNone, evaluator.For(strategyCard))
	})

	t.Run("the floor also applies to cards no rule mentions", func(t *testing.T) {
		evaluator := evaluatorFor(depFactory, dutyHead, model.EffectiveBoardPermissionNone)

		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(card(propCLevel, valueProduction)),
			"a board member with no board permission still reads what full visibility grants")
	})

	t.Run("a duty the master no longer lists carries no floor", func(t *testing.T) {
		evaluator := NewPropertyAccessEvaluator(EvaluatorInput{
			Settings:        testSettings(),
			OrgUnits:        testOrgUnits(),
			Duties:          testDuties(),
			Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depFactory, PrimaryDutyID: "duty-retired"},
			BoardPermission: model.EffectiveBoardPermissionEdit,
		})

		require.Equal(t, model.EffectiveBoardPermissionNone, evaluator.For(strategyCard),
			"FR-036 — a reference that no longer resolves simply stops matching")
	})
}

// TestEvaluatorBrokenReferences covers FR-036 from the evaluation side: a rule that
// points at something the master no longer has simply stops matching. The share
// dialog marks such a row; the evaluator must not guess at what was meant.
func TestEvaluatorBrokenReferences(t *testing.T) {
	build := func(rule model.PropertyAccessRule) *PropertyAccessEvaluator {
		return NewPropertyAccessEvaluator(EvaluatorInput{
			Settings:        &model.PropertyAccessSettings{Enabled: true, Rules: []model.PropertyAccessRule{rule}},
			OrgUnits:        testOrgUnits(),
			Duties:          testDuties(),
			Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyLead},
			BoardPermission: model.EffectiveBoardPermissionEdit,
		})
	}

	strategyCard := card(propCLevel, valueStrategy)

	t.Run("a property that no longer exists matches no card", func(t *testing.T) {
		evaluator := build(model.PropertyAccessRule{
			ID: "r1", PropertyID: "prop-deleted", PropertyValueID: valueStrategy,
			DivisionID: divStrategy, Permission: model.PropertyAccessViewer,
		})

		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(strategyCard),
			"the card falls outside every rule and keeps the board permission")
	})

	t.Run("a value that no longer exists matches no card", func(t *testing.T) {
		evaluator := build(model.PropertyAccessRule{
			ID: "r1", PropertyID: propCLevel, PropertyValueID: "opt-deleted",
			DivisionID: divStrategy, Permission: model.PropertyAccessViewer,
		})

		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(strategyCard))
	})

	t.Run("a division that no longer exists closes the gate on everyone", func(t *testing.T) {
		evaluator := build(model.PropertyAccessRule{
			ID: "r1", PropertyID: propCLevel, PropertyValueID: valueStrategy,
			DivisionID: "div-deleted", Permission: model.PropertyAccessViewer,
		})

		require.Equal(t, model.EffectiveBoardPermissionNone, evaluator.For(strategyCard),
			"the row still constrains the organization axis, and nobody satisfies it")
	})

	t.Run("a duty that no longer exists grants nothing", func(t *testing.T) {
		evaluator := build(model.PropertyAccessRule{
			ID: "r1", PropertyID: propCLevel, PropertyValueID: valueStrategy,
			DutyID: "duty-deleted", Permission: model.PropertyAccessEditor,
		})

		require.Equal(t, model.EffectiveBoardPermissionNone, evaluator.For(strategyCard),
			"a duty-only row that matches nobody leaves the card with no rule permission")
	})
}

// BenchmarkEvaluatorHundredRules backs SC-006: a board carrying a hundred rules
// must not cost meaningfully more per card than a board carrying none. The work
// that scales with the rule count happens once, when the evaluator is built.
func BenchmarkEvaluatorHundredRules(b *testing.B) {
	rules := make([]model.PropertyAccessRule, 0, 100)
	for i := 0; i < 100; i++ {
		rules = append(rules, model.PropertyAccessRule{
			ID:              fmt.Sprintf("r%d", i),
			PropertyID:      propCLevel,
			PropertyValueID: fmt.Sprintf("opt-%d", i),
			DivisionID:      divStrategy,
			Permission:      model.PropertyAccessViewer,
		})
	}
	rules = append(rules, model.PropertyAccessRule{
		ID: "r-match", PropertyID: propCLevel, PropertyValueID: valueStrategy,
		DivisionID: divStrategy, Permission: model.PropertyAccessViewer,
	})

	evaluator := NewPropertyAccessEvaluator(EvaluatorInput{
		Settings:        &model.PropertyAccessSettings{Enabled: true, Rules: rules},
		OrgUnits:        testOrgUnits(),
		Duties:          testDuties(),
		Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyLead},
		BoardPermission: model.EffectiveBoardPermissionEdit,
	})
	target := card(propCLevel, valueStrategy)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		evaluator.For(target)
	}
}

// BenchmarkEvaluatorNoRules is the comparison point for the benchmark above.
func BenchmarkEvaluatorNoRules(b *testing.B) {
	evaluator := NewPropertyAccessEvaluator(EvaluatorInput{
		BoardPermission: model.EffectiveBoardPermissionEdit,
	})
	target := card(propCLevel, valueStrategy)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		evaluator.For(target)
	}
}
