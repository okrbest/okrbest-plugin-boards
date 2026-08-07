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

// ownedCard is card() with an author, which is what the creator floor keys on.
func ownedCard(propertyID, valueID, createdBy string) *model.Block {
	block := card(propertyID, valueID)
	block.CreatedBy = createdBy
	return block
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
	return evaluatorForUser("someone-else", orgUnitID, dutyID, boardPermission)
}

// evaluatorForUser is evaluatorFor with the identity spelled out, for the tests
// that care whether the user authored the card.
func evaluatorForUser(userID, orgUnitID, dutyID string, boardPermission model.EffectiveBoardPermission) *PropertyAccessEvaluator {
	var profile *model.UserOrgProfile
	if orgUnitID != "" || dutyID != "" {
		profile = &model.UserOrgProfile{PrimaryOrgUnitID: orgUnitID, PrimaryDutyID: dutyID}
	}

	return NewPropertyAccessEvaluator(EvaluatorInput{
		UserID:          userID,
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

// TestEvaluatorCardOutsideAnyRule covers the revised FR-015. An active rule set
// takes precedence over the board's sharing role, so a card no rule mentions is
// readable rather than editable — the board editor role no longer carries
// through. Only the admin bypass and the creator floor lift it.
//
// This expectation was Edit until the precedence rule was adopted. The change is
// a requirement change, not a regression.
func TestEvaluatorCardOutsideAnyRule(t *testing.T) {
	input := EvaluatorInput{
		Settings:        testSettings(),
		OrgUnits:        testOrgUnits(),
		Duties:          testDuties(),
		BoardPermission: model.EffectiveBoardPermissionEdit,
		Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depFactory},
	}

	evaluator := NewPropertyAccessEvaluator(input)

	t.Run("a value no rule mentions is readable, not editable", func(t *testing.T) {
		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(card(propCLevel, valueProduction)))
	})

	t.Run("a card with no properties at all is readable", func(t *testing.T) {
		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(card("", "")))
	})

	t.Run("a nil card is readable", func(t *testing.T) {
		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(nil))
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

	require.Equal(t, model.EffectiveBoardPermissionView,
		blocked.For(multiSelectCard(propCLevel, valueProduction)),
		"no matching value leaves the card outside every rule, which is read only")
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

		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(strategyCard),
			"the card falls outside every rule, which under an active rule set is read only")
	})

	t.Run("a value that no longer exists matches no card", func(t *testing.T) {
		evaluator := build(model.PropertyAccessRule{
			ID: "r1", PropertyID: propCLevel, PropertyValueID: "opt-deleted",
			DivisionID: divStrategy, Permission: model.PropertyAccessViewer,
		})

		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.For(strategyCard))
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

// The tests below cover the precedence rule adopted after the FY27 KKV OKR
// verification: once a rule set is active it outranks the board's sharing role.
// The decision table they encode is in specs/002-card-property-access/research.md R6.

// TestEvaluatorOwnerFloor covers the creator floor. Whoever authored a card can
// always work on it, which is what keeps a card from stranding: before this,
// setting a value you were not entitled to left a card its own author could
// neither edit nor delete.
func TestEvaluatorOwnerFloor(t *testing.T) {
	const author = "author-1"

	t.Run("the author edits a card whose rule only grants reading", func(t *testing.T) {
		// 팀장 of the matching division takes 행1, which is viewer.
		evaluator := evaluatorForUser(author, depPlanning, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionView,
			evaluator.For(ownedCard(propCLevel, valueStrategy, "somebody-else")))
		require.Equal(t, model.EffectiveBoardPermissionEdit,
			evaluator.For(ownedCard(propCLevel, valueStrategy, author)),
			"the author keeps hold of their own card")
	})

	t.Run("the author edits a card outside every rule", func(t *testing.T) {
		evaluator := evaluatorForUser(author, depFactory, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionEdit,
			evaluator.For(ownedCard("", "", author)),
			"an empty card belongs to whoever just created it")
	})

	t.Run("an anonymous card grants nothing extra", func(t *testing.T) {
		evaluator := evaluatorForUser("", depPlanning, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionView,
			evaluator.For(ownedCard(propCLevel, valueStrategy, "")),
			"an empty user ID must never match an empty CreatedBy")
	})
}

// TestEvaluatorOwnerFloorDoesNotCrossOrgGate is the counterpart to the full
// visibility floor: authorship raises what you may do inside an organization the
// rules already admit you to, and never opens one they keep shut. Otherwise
// creating a card and labeling it with another division would hand the author a
// way through the gate.
func TestEvaluatorOwnerFloorDoesNotCrossOrgGate(t *testing.T) {
	const author = "author-1"

	t.Run("a 팀장 of another division stays out even of their own card", func(t *testing.T) {
		evaluator := evaluatorForUser(author, depFactory, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionNone,
			evaluator.For(ownedCard(propCLevel, valueStrategy, author)))
	})

	t.Run("full visibility still reaches across, authorship does not raise it", func(t *testing.T) {
		evaluator := evaluatorForUser(author, depFactory, dutyHead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionView,
			evaluator.For(ownedCard(propCLevel, valueStrategy, author)),
			"the gate is closed, so only the full visibility floor survives")
	})
}

// TestEvaluatorForByRulesOnly covers the evaluation the condition-property write
// check runs on. It answers "would the rules alone let me edit this card", which
// is deliberately blind to authorship: otherwise an author could walk their own
// card into any state by creating it empty first.
func TestEvaluatorForByRulesOnly(t *testing.T) {
	const author = "author-1"

	strategyCard := ownedCard(propCLevel, valueStrategy, author)

	t.Run("authorship is ignored", func(t *testing.T) {
		evaluator := evaluatorForUser(author, depPlanning, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.For(strategyCard))
		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.ForByRulesOnly(strategyCard),
			"the write check must not be satisfied by the card being yours")
	})

	t.Run("a rule granting editor still reads as editor", func(t *testing.T) {
		evaluator := evaluatorForUser(author, depPlanning, dutyHead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.ForByRulesOnly(strategyCard))
	})

	t.Run("full visibility is kept, since it cannot reach editor anyway", func(t *testing.T) {
		evaluator := evaluatorForUser(author, depFactory, dutyHead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, model.EffectiveBoardPermissionView, evaluator.ForByRulesOnly(strategyCard))
	})
}

// TestEvaluatorMatchesAnyCondition covers the escape hatch that keeps blank card
// creation working: a card no rule condition mentions is not subject to the
// write check at all.
func TestEvaluatorMatchesAnyCondition(t *testing.T) {
	evaluator := evaluatorForUser("author-1", depPlanning, dutyLead, model.EffectiveBoardPermissionEdit)

	require.True(t, evaluator.MatchesAnyCondition(card(propCLevel, valueStrategy)))
	require.False(t, evaluator.MatchesAnyCondition(card(propCLevel, valueProduction)),
		"a value no rule mentions is not a condition")
	require.False(t, evaluator.MatchesAnyCondition(card("", "")),
		"a blank card carries no condition, so it may always be created")
	require.False(t, evaluator.MatchesAnyCondition(nil))
}

// TestEvaluatorSuperiorWithoutRuleHasNoEdit pins scenario 7 down: rank does not
// leak edit rights. A 본부장 holds no rule for the value a 팀장 owns, so the
// 본부장 may read and comment but not edit. This is the intended design, and the
// test exists so a later "surely the boss should be able to" change has to argue
// with a failing test first.
func TestEvaluatorSuperiorWithoutRuleHasNoEdit(t *testing.T) {
	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{
			{
				ID: "org", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DivisionID: divStrategy, Permission: model.PropertyAccessCommenter,
			},
			{
				ID: "lead-only", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DutyID: dutyLead, Permission: model.PropertyAccessEditor,
			},
		},
	}

	build := func(dutyID string) *PropertyAccessEvaluator {
		return NewPropertyAccessEvaluator(EvaluatorInput{
			UserID:          "user-1",
			Settings:        settings,
			OrgUnits:        testOrgUnits(),
			Duties:          testDuties(),
			Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyID},
			BoardPermission: model.EffectiveBoardPermissionEdit,
		})
	}

	strategyCard := card(propCLevel, valueStrategy)

	require.Equal(t, model.EffectiveBoardPermissionEdit, build(dutyLead).For(strategyCard),
		"the 팀장 holds the rule, so the 팀장 edits")
	require.Equal(t, model.EffectiveBoardPermissionCommenter, build(dutyHead).For(strategyCard),
		"the 본부장 outranks the 팀장 but holds no rule for this value, so commenting is the ceiling")
}

// TestEvaluatorDefaultConditionValues covers the values a new card is born
// with.
//
// A sub-card used to copy its parent's, which meant a 팀장 adding one under an
// Object card produced an Object card — a shape the rules never let them create,
// so the OKR ladder (Object → Key Results → Tasks) had no way to be built at
// all. The values are read out of the rules instead: whichever value's rule
// admits this user is the one they get.
func TestEvaluatorDefaultConditionValues(t *testing.T) {
	// 행1 places 전략 division on the C-Level value, 행2 places 본부장 on it.
	// Only 행2 grants editing, so a 팀장 has no default here and a 본부장 does.
	t.Run("a 본부장 of the matching division gets the value both rows admit", func(t *testing.T) {
		evaluator := evaluatorForUser("user-1", depPlanning, dutyHead, model.EffectiveBoardPermissionEdit)

		require.Equal(t, map[string]string{propCLevel: valueStrategy}, evaluator.DefaultConditionValues())
	})

	t.Run("a user the rules do not admit gets nothing", func(t *testing.T) {
		evaluator := evaluatorForUser("user-1", depFactory, dutyLead, model.EffectiveBoardPermissionEdit)

		require.Empty(t, evaluator.DefaultConditionValues(),
			"filling a value they cannot edit would hand them a card they cannot finish")
	})

	t.Run("nothing is offered when the rules are switched off", func(t *testing.T) {
		settings := testSettings()
		settings.Enabled = false
		evaluator := NewPropertyAccessEvaluator(EvaluatorInput{
			UserID: "user-1", Settings: settings, OrgUnits: testOrgUnits(), Duties: testDuties(),
			Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyHead},
			BoardPermission: model.EffectiveBoardPermissionEdit,
		})

		require.Empty(t, evaluator.DefaultConditionValues())
	})
}

// TestEvaluatorDefaultsSpanProperties is the case the OKR board actually has:
// one property carries the organization gate and another carries the duty
// ladder, and a usable card needs a value from each. Neither value alone reaches
// editing — the C-Level row only grants commenting — so the defaults have to be
// offered together or not at all.
func TestEvaluatorDefaultsSpanProperties(t *testing.T) {
	const propType = "prop-type"
	const valueKR = "opt-kr"

	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{
			{
				ID: "org", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DivisionID: divStrategy, Permission: model.PropertyAccessCommenter,
			},
			{
				ID: "duty", PropertyID: propType, PropertyValueID: valueKR,
				DutyID: dutyLead, Permission: model.PropertyAccessEditor,
			},
		},
	}

	build := func(orgUnitID, dutyID string) *PropertyAccessEvaluator {
		return NewPropertyAccessEvaluator(EvaluatorInput{
			UserID: "user-1", Settings: settings, OrgUnits: testOrgUnits(), Duties: testDuties(),
			Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: orgUnitID, PrimaryDutyID: dutyID},
			BoardPermission: model.EffectiveBoardPermissionEdit,
		})
	}

	t.Run("a 팀장 of the division gets both halves", func(t *testing.T) {
		defaults := build(depPlanning, dutyLead).DefaultConditionValues()

		require.Equal(t, map[string]string{propCLevel: valueStrategy, propType: valueKR}, defaults)
	})

	t.Run("the pair is editable, which is the point of offering it", func(t *testing.T) {
		evaluator := build(depPlanning, dutyLead)
		defaults := evaluator.DefaultConditionValues()

		properties := map[string]interface{}{}
		for propertyID, valueID := range defaults {
			properties[propertyID] = valueID
		}
		card := &model.Block{ID: "card-new", Type: model.TypeCard, Fields: map[string]interface{}{"properties": properties}}

		require.Equal(t, model.EffectiveBoardPermissionEdit, evaluator.ForByRulesOnly(card))
	})

	t.Run("a 팀장 of another division gets only the half that admits them", func(t *testing.T) {
		defaults := build(depFactory, dutyLead).DefaultConditionValues()

		require.Equal(t, map[string]string{propType: valueKR}, defaults,
			"the organization row does not admit them, so no C-Level is offered")
	})
}

// TestEvaluatorDefaultsSkipAmbiguity covers a user two rows on the same property
// admit. Picking one for them would be a guess, and the wrong guess puts the
// card somewhere they did not ask for.
func TestEvaluatorDefaultsSkipAmbiguity(t *testing.T) {
	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{
			{
				ID: "a", PropertyID: propCLevel, PropertyValueID: valueStrategy,
				DivisionID: divStrategy, Permission: model.PropertyAccessEditor,
			},
			{
				ID: "b", PropertyID: propCLevel, PropertyValueID: valueProduction,
				DutyID: dutyHead, Permission: model.PropertyAccessEditor,
			},
		},
	}

	evaluator := NewPropertyAccessEvaluator(EvaluatorInput{
		UserID: "user-1", Settings: settings, OrgUnits: testOrgUnits(), Duties: testDuties(),
		Profile:         &model.UserOrgProfile{PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyHead},
		BoardPermission: model.EffectiveBoardPermissionEdit,
	})

	require.Empty(t, evaluator.DefaultConditionValues(),
		"both rows admit this user, so the property is left for them to choose")
}
