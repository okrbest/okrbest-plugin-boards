// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	mmModel "github.com/mattermost/mattermost/server/public/model"
)

// Enforcement of the card level decision, as opposed to the decision itself.
//
// The evaluator was already covered when these tests were written; what was not
// covered was whether every write path actually asks it. Three did not: block
// insertion asked nothing at all, so comments and card creation went straight
// past the rules, and a property patch was judged on the card's old value rather
// than the one being written.
//
// Rules under test, chosen so each ladder step is reachable:
//
//	행1  card: C-Level=전략   subject: division=전략     → commenter
//	행2  card: C-Level=전략   subject: duty=본부장       → editor

const (
	ruleBoardID = "board-enforce"
	ruleTeamID  = "team-enforce"

	userHead    = "user-head"    // 전략 본부장 → editor on 전략 cards
	userLead    = "user-lead"    // 전략 팀장   → commenter on 전략 cards
	userOutside = "user-outside" // 생산 팀장   → nothing on 전략 cards
	// 생산 본부장 — full visibility lets them read 전략 cards, the
	// organization gate still keeps them out.
	userOutsideHead = "user-outside-head"
)

func enforcementSettings() *model.PropertyAccessSettings {
	return &model.PropertyAccessSettings{
		Enabled: true,
		// 값은 목록에 담는다 — 공유 대화상자가 값을 하나만 고를 때도 쓰는 모양이다.
		// 픽스처가 옛 단수 필드만 쓰는 동안 카드 생성 경로의 결함이 가려져 있었다.
		Rules: []model.PropertyAccessRule{
			{
				ID: "org", PropertyID: propCLevel, PropertyValueIDs: []string{valueStrategy},
				DivisionID: divStrategy, Permission: model.PropertyAccessCommenter,
			},
			{
				ID: "head", PropertyID: propCLevel, PropertyValueIDs: []string{valueStrategy},
				DutyID: dutyHead, Permission: model.PropertyAccessEditor,
			},
		},
	}
}

// setupRuleBoard wires a board carrying the rule set above, plus the org masters
// and the three profiles the tests draw on. Every store call the evaluator makes
// is registered AnyTimes, so a test only asserts on the write it cares about.
func setupRuleBoard(t *testing.T) (*TestHelper, func()) {
	t.Helper()
	th, tearDown := SetupTestHelper(t)

	value, err := enforcementSettings().AsProperty()
	require.NoError(t, err)

	board := &model.Board{
		ID: ruleBoardID, TeamID: ruleTeamID,
		Properties: map[string]interface{}{model.PropertyAccessKey: value},
	}

	th.Store.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
	th.PermissionsStore.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
	// Editor rather than admin: an admin bypasses the rules entirely (FR-014),
	// which would make every one of these tests pass for the wrong reason.
	th.PermissionsStore.EXPECT().GetMemberForBoard(ruleBoardID, gomock.Any()).
		Return(&model.BoardMember{BoardID: ruleBoardID, SchemeEditor: true}, nil).AnyTimes()
	th.API.EXPECT().HasPermissionToTeam(gomock.Any(), ruleTeamID, gomock.Any()).
		DoAndReturn(func(_, _ string, permission *mmModel.Permission) bool {
			return permission == model.PermissionViewTeam
		}).AnyTimes()

	th.Store.EXPECT().GetOrgUnitsForTeam(ruleTeamID).Return(testOrgUnits(), nil).AnyTimes()
	th.Store.EXPECT().GetDutiesForTeam(ruleTeamID).Return(testDuties(), nil).AnyTimes()
	th.Store.EXPECT().GetUserOrgProfiles(ruleTeamID, gomock.Any()).
		DoAndReturn(func(_ string, userIDs []string) ([]*model.UserOrgProfile, error) {
			all := map[string]*model.UserOrgProfile{
				userHead:        {TeamID: ruleTeamID, UserID: userHead, PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyHead},
				userLead:        {TeamID: ruleTeamID, UserID: userLead, PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyLead},
				userOutside:     {TeamID: ruleTeamID, UserID: userOutside, PrimaryOrgUnitID: depFactory, PrimaryDutyID: dutyLead},
				userOutsideHead: {TeamID: ruleTeamID, UserID: userOutsideHead, PrimaryOrgUnitID: depFactory, PrimaryDutyID: dutyHead},
			}
			out := make([]*model.UserOrgProfile, 0, len(userIDs))
			for _, id := range userIDs {
				if profile, ok := all[id]; ok {
					out = append(out, profile)
				}
			}
			return out, nil
		}).AnyTimes()

	return th, tearDown
}

// strategyCardBlock is a stored card the rules govern.
func strategyCardBlock(createdBy string) *model.Block {
	return &model.Block{
		ID: "card-strategy", BoardID: ruleBoardID, ParentID: ruleBoardID,
		Type: model.TypeCard, CreatedBy: createdBy,
		Fields: map[string]interface{}{
			"properties": map[string]interface{}{propCLevel: valueStrategy},
		},
	}
}

func childBlock(id string, blockType model.BlockType, parentID string) *model.Block {
	return &model.Block{
		ID: id, BoardID: ruleBoardID, ParentID: parentID, Type: blockType,
		Fields: map[string]interface{}{},
	}
}

// TestInsertBlocksCommentGate covers the comment half of scenarios 3 and 4: a
// member of the division may comment on its cards, an outsider may not.
//
// Commenting used to answer to the board role alone, which meant a rule granting
// only reading still let the reader post — and, on a board whose members are all
// editors, made the rules' commenter step decorative.
func TestInsertBlocksCommentGate(t *testing.T) {
	cases := []struct {
		name    string
		userID  string
		allowed bool
	}{
		{"a 본부장 who may edit may also comment", userHead, true},
		{"a 팀장 the rule admits as commenter may comment", userLead, true},
		{"a 팀장 of another division may not comment", userOutside, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			th, tearDown := setupRuleBoard(t)
			defer tearDown()

			card := strategyCardBlock("someone-else")
			comment := childBlock("comment-1", model.TypeComment, card.ID)

			th.Store.EXPECT().GetBlock(comment.ID).Return(nil, model.NewErrNotFound("block")).AnyTimes()
			th.Store.EXPECT().GetBlock(card.ID).Return(card, nil).AnyTimes()

			if tc.allowed {
				th.Store.EXPECT().InsertBlock(comment, tc.userID).Return(nil).Times(1)
				th.Store.EXPECT().MarkBoardMentionReplied(tc.userID, card.ID).Return(nil).AnyTimes()
				th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()
			} else {
				th.Store.EXPECT().InsertBlock(gomock.Any(), gomock.Any()).Times(0)
			}

			_, err := th.App.InsertBlocks([]*model.Block{comment}, tc.userID)

			if tc.allowed {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
				require.True(t, model.IsErrForbidden(err), "expected a permission error, got %v", err)
			}
		})
	}
}

// TestInsertBlocksContentGate covers FR-026 from the write side: a description
// or checkbox written into a card is content of that card, so it answers to the
// card's permission rather than the board's. Commenting is not enough.
func TestInsertBlocksContentGate(t *testing.T) {
	cases := []struct {
		name    string
		userID  string
		allowed bool
	}{
		{"an editor of the card may add content", userHead, true},
		{"a commenter of the card may not add content", userLead, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			th, tearDown := setupRuleBoard(t)
			defer tearDown()

			card := strategyCardBlock("someone-else")
			text := childBlock("text-1", model.TypeText, card.ID)

			th.Store.EXPECT().GetBlock(text.ID).Return(nil, model.NewErrNotFound("block")).AnyTimes()
			th.Store.EXPECT().GetBlock(card.ID).Return(card, nil).AnyTimes()

			if tc.allowed {
				th.Store.EXPECT().InsertBlock(text, tc.userID).Return(nil).Times(1)
				th.Store.EXPECT().MarkBoardMentionReplied(tc.userID, card.ID).Return(nil).AnyTimes()
				th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()
			} else {
				th.Store.EXPECT().InsertBlock(gomock.Any(), gomock.Any()).Times(0)
			}

			_, err := th.App.InsertBlocks([]*model.Block{text}, tc.userID)

			if tc.allowed {
				require.NoError(t, err)
			} else {
				require.True(t, model.IsErrForbidden(err), "expected a permission error, got %v", err)
			}
		})
	}
}

// TestInsertBlocksCardCreationGate covers the creation half of scenarios 2, 3
// and 4. Creating a card used to answer to the board role alone, so anyone who
// could open the board could stamp any value on a new card — and then found they
// could not edit or delete what they had just made.
func TestInsertBlocksCardCreationGate(t *testing.T) {
	cases := []struct {
		name    string
		userID  string
		value   string
		allowed bool
	}{
		{"a 본부장 creates a card the rules let them edit", userHead, valueStrategy, true},
		{"a 팀장 may not create a card they could only comment on", userLead, valueStrategy, false},
		{"an outsider may not create a card for another division", userOutside, valueStrategy, false},
		{"anyone may create a card no rule mentions", userLead, valueProduction, true},
		{"anyone may create a blank card", userOutside, "", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			th, tearDown := setupRuleBoard(t)
			defer tearDown()

			properties := map[string]interface{}{}
			if tc.value != "" {
				properties[propCLevel] = tc.value
			}
			newCard := &model.Block{
				ID: "card-new", BoardID: ruleBoardID, ParentID: ruleBoardID,
				Type: model.TypeCard, CreatedBy: tc.userID,
				Fields: map[string]interface{}{"properties": properties},
			}

			th.Store.EXPECT().GetBlock(newCard.ID).Return(nil, model.NewErrNotFound("block")).AnyTimes()

			if tc.allowed {
				th.Store.EXPECT().InsertBlock(newCard, tc.userID).Return(nil).Times(1)
				th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()
			} else {
				th.Store.EXPECT().InsertBlock(gomock.Any(), gomock.Any()).Times(0)
			}

			_, err := th.App.InsertBlocks([]*model.Block{newCard}, tc.userID)

			if tc.allowed {
				require.NoError(t, err)
			} else {
				require.True(t, model.IsErrForbidden(err), "expected a permission error, got %v", err)
			}
		})
	}
}

// TestInsertBlocksResolvesParentWithinBatch is the batch case. A card and its
// content arrive in one request — that is how creating from a template looks —
// so the content block's parent is not in the store yet. Reading the parent from
// the store alone returns nothing, which classifies the content as living
// outside any card and skips the check entirely.
func TestInsertBlocksResolvesParentWithinBatch(t *testing.T) {
	th, tearDown := setupRuleBoard(t)
	defer tearDown()

	newCard := &model.Block{
		ID: "card-batch", BoardID: ruleBoardID, ParentID: ruleBoardID,
		Type: model.TypeCard, CreatedBy: userLead,
		Fields: map[string]interface{}{
			"properties": map[string]interface{}{propCLevel: valueStrategy},
		},
	}
	text := childBlock("text-batch", model.TypeText, newCard.ID)

	th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block")).AnyTimes()
	th.Store.EXPECT().InsertBlock(gomock.Any(), gomock.Any()).Times(0)

	_, err := th.App.InsertBlocks([]*model.Block{newCard, text}, userLead)

	require.True(t, model.IsErrForbidden(err),
		"the card in the same batch has to be visible to the check, not looked up in the store")
}

// TestPatchBlockConditionWrite covers scenario 5's boundary. The author of a
// card may always work on it, but not by walking it into a state the rules would
// never have let them create: the check runs on the value being written, not the
// one already stored.
func TestPatchBlockConditionWrite(t *testing.T) {
	t.Run("a 팀장 may not raise their own card to a value they could only comment on", func(t *testing.T) {
		th, tearDown := setupRuleBoard(t)
		defer tearDown()

		// Outside every rule, so the author's floor is what lets them edit at all.
		own := &model.Block{
			ID: "card-own", BoardID: ruleBoardID, ParentID: ruleBoardID,
			Type: model.TypeCard, CreatedBy: userLead,
			Fields: map[string]interface{}{"properties": map[string]interface{}{}},
		}

		th.Store.EXPECT().GetBlock(own.ID).Return(own, nil).AnyTimes()
		th.Store.EXPECT().PatchBlock(gomock.Any(), gomock.Any(), gomock.Any()).Times(0)

		patch := &model.BlockPatch{UpdatedFields: map[string]interface{}{
			"properties": map[string]interface{}{propCLevel: valueStrategy},
		}}

		_, err := th.App.PatchBlock(own.ID, patch, userLead)

		require.True(t, model.IsErrForbidden(err), "expected a permission error, got %v", err)
		require.Equal(t, map[string]interface{}{}, own.Fields["properties"],
			"the refused patch must not have been applied to the block in passing")
	})

	t.Run("a 본부장 may set the value their rule covers", func(t *testing.T) {
		th, tearDown := setupRuleBoard(t)
		defer tearDown()

		own := &model.Block{
			ID: "card-own", BoardID: ruleBoardID, ParentID: ruleBoardID,
			Type: model.TypeCard, CreatedBy: userHead,
			Fields: map[string]interface{}{"properties": map[string]interface{}{}},
		}

		th.Store.EXPECT().GetBlock(own.ID).Return(own, nil).AnyTimes()
		th.Store.EXPECT().PatchBlock(own.ID, gomock.Any(), userHead).Return(nil).Times(1)
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()

		patch := &model.BlockPatch{UpdatedFields: map[string]interface{}{
			"properties": map[string]interface{}{propCLevel: valueStrategy},
		}}

		_, err := th.App.PatchBlock(own.ID, patch, userHead)

		require.NoError(t, err)
	})

	t.Run("the author may still edit the title of a card they may not re-label", func(t *testing.T) {
		th, tearDown := setupRuleBoard(t)
		defer tearDown()

		own := strategyCardBlock(userLead)

		th.Store.EXPECT().GetBlock(own.ID).Return(own, nil).AnyTimes()
		th.Store.EXPECT().PatchBlock(own.ID, gomock.Any(), userLead).Return(nil).Times(1)
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()

		patch := &model.BlockPatch{Title: mmModel.NewPointer("renamed")}

		_, err := th.App.PatchBlock(own.ID, patch, userLead)

		require.NoError(t, err, "authorship covers the card even when the rules only grant commenting")
	})
}

// TestDeleteBlockOwnerFloor is the other half of scenario 5, and the reason it
// was raised: a card whose value its own author may not set used to be
// undeletable by anyone but a system admin.
func TestDeleteBlockOwnerFloor(t *testing.T) {
	th, tearDown := setupRuleBoard(t)
	defer tearDown()

	own := strategyCardBlock(userLead)

	th.Store.EXPECT().GetBlock(own.ID).Return(own, nil).AnyTimes()
	// Deleting a card sweeps its sub-cards and its editor document.
	th.Store.EXPECT().GetBlocks(gomock.Any()).Return([]*model.Block{}, nil).AnyTimes()
	th.Store.EXPECT().DeleteBlockSuiteDocByCardID(gomock.Any()).Return(nil).AnyTimes()
	th.Store.EXPECT().DeleteBlock(own.ID, userLead).Return(nil).Times(1)
	th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()

	require.NoError(t, th.App.DeleteBlock(own.ID, userLead))
}

// TestDuplicateBlockGate closes the copy route. Duplicating asked the board for
// permission and nothing else, so it was both a way to read a card the rules
// hide — the copy lands on your own board view carrying the original's content —
// and a way around the creation restriction, since the copy arrives already
// wearing a value you could not have set yourself.
func TestDuplicateBlockGate(t *testing.T) {
	cases := []struct {
		name    string
		userID  string
		allowed bool
	}{
		{"a 본부장 may duplicate a card they may edit", userHead, true},
		{"a 팀장 may not duplicate a card they could only comment on", userLead, false},
		{"an outsider may not duplicate a card they cannot even see", userOutside, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			th, tearDown := setupRuleBoard(t)
			defer tearDown()

			source := strategyCardBlock("someone-else")

			th.Store.EXPECT().GetBlock(source.ID).Return(source, nil).AnyTimes()

			if tc.allowed {
				th.Store.EXPECT().DuplicateBlock(ruleBoardID, source.ID, tc.userID, false).
					Return([]*model.Block{source}, nil).Times(1)
				th.Store.EXPECT().GetBlocksByIDs(gomock.Any()).Return([]*model.Block{}, nil).AnyTimes()
				th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()
			} else {
				th.Store.EXPECT().DuplicateBlock(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).Times(0)
			}

			_, err := th.App.DuplicateBlock(ruleBoardID, source.ID, tc.userID, false)

			if tc.allowed {
				require.NoError(t, err)
			} else {
				require.True(t, model.IsErrForbidden(err), "expected a permission error, got %v", err)
			}
		})
	}
}

// TestExportArchiveFiltersCards covers the widest hole the FY27 KKV OKR
// verification found: a member who could see 26 of 87 cards on screen exported
// all 87, card bodies included. The archive was assembled with the rule-free
// block reader, so every enforcement the API layer had was simply not on this
// path.
func TestExportArchiveFiltersCards(t *testing.T) {
	strategy := strategyCardBlock("someone-else")
	production := &model.Block{
		ID: "card-production", BoardID: ruleBoardID, ParentID: ruleBoardID,
		Type: model.TypeCard, Title: "생산 카드",
		Fields: map[string]interface{}{
			"properties": map[string]interface{}{propCLevel: valueProduction},
		},
	}
	secret := &model.Block{
		ID: "text-secret", BoardID: ruleBoardID, ParentID: strategy.ID, Type: model.TypeText,
		Title: "전략 본문", Fields: map[string]interface{}{},
	}

	exportFor := func(t *testing.T, userID string) string {
		t.Helper()
		th, tearDown := setupRuleBoard(t)
		defer tearDown()

		th.Store.EXPECT().GetBlocksForBoard(ruleBoardID).
			Return([]*model.Block{strategy, production, secret}, nil).AnyTimes()
		th.Store.EXPECT().GetMembersForBoard(ruleBoardID).Return([]*model.BoardMember{}, nil).AnyTimes()
		th.Store.EXPECT().GetBlockSuiteDocsByBoardID(ruleBoardID).Return(nil, nil).AnyTimes()

		var buf bytes.Buffer
		require.NoError(t, th.App.ExportArchive(&buf, model.ExportArchiveOptions{
			TeamID:   ruleTeamID,
			BoardIDs: []string{ruleBoardID},
			UserID:   userID,
		}))

		reader, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
		require.NoError(t, err)

		var all strings.Builder
		for _, file := range reader.File {
			rc, openErr := file.Open()
			require.NoError(t, openErr)
			body, readErr := io.ReadAll(rc)
			require.NoError(t, readErr)
			_ = rc.Close()
			all.Write(body)
		}
		return all.String()
	}

	t.Run("a 본부장 of 전략 exports both cards", func(t *testing.T) {
		archive := exportFor(t, userHead)

		require.Contains(t, archive, strategy.ID)
		require.Contains(t, archive, production.ID)
	})

	t.Run("a 팀장 of 생산 exports neither the 전략 card nor its body", func(t *testing.T) {
		archive := exportFor(t, userOutside)

		require.Contains(t, archive, production.ID, "their own division's card is still exported")
		require.NotContains(t, archive, strategy.ID)
		require.NotContains(t, archive, "전략 본문",
			"FR-026 — the card's content has to leave with it")
	})

	t.Run("an internal export with no user keeps every card", func(t *testing.T) {
		archive := exportFor(t, "")

		require.Contains(t, archive, strategy.ID,
			"backup and duplication act on the board's behalf, not a member's")
	})
}

// TestCreateCardFillsDefaults covers the OKR ladder. A 팀장 has to be able to
// put a Key Results card under an Object card and a 팀원 a Tasks card under a
// Key Results card, and neither could: a sub-card copied its parent's values, so
// every rung came out as a copy of the rung above and the rules refused it.
//
// The values a new card is born with are read out of the rules instead.
func TestCreateCardFillsDefaults(t *testing.T) {
	t.Run("a card created with no values gets the ones the rules admit", func(t *testing.T) {
		th, tearDown := setupRuleBoard(t)
		defer tearDown()

		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block")).AnyTimes()
		th.Store.EXPECT().InsertBlock(gomock.Any(), userHead).Return(nil).Times(1)
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()

		card, err := th.App.CreateCard(&model.Card{BoardID: ruleBoardID}, ruleBoardID, userHead, true)

		require.NoError(t, err)
		require.Equal(t, valueStrategy, card.Properties[propCLevel],
			"the 본부장 row admits this value, so the card is filed under it")
	})

	t.Run("values the caller sends are left alone", func(t *testing.T) {
		th, tearDown := setupRuleBoard(t)
		defer tearDown()

		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block")).AnyTimes()
		th.Store.EXPECT().InsertBlock(gomock.Any(), userHead).Return(nil).Times(1)
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()

		asked := &model.Card{BoardID: ruleBoardID, Properties: map[string]interface{}{propCLevel: valueStrategy}}
		card, err := th.App.CreateCard(asked, ruleBoardID, userHead, true)

		require.NoError(t, err)
		require.Equal(t, valueStrategy, card.Properties[propCLevel])
	})

	t.Run("a user the rules do not admit still gets a blank card", func(t *testing.T) {
		th, tearDown := setupRuleBoard(t)
		defer tearDown()

		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block")).AnyTimes()
		th.Store.EXPECT().InsertBlock(gomock.Any(), userOutside).Return(nil).Times(1)
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()

		card, err := th.App.CreateCard(&model.Card{BoardID: ruleBoardID}, ruleBoardID, userOutside, true)

		require.NoError(t, err)
		require.Empty(t, card.Properties,
			"nothing admits them, so filling a value would hand them a card they cannot finish")
	})
}

// TestCreateSubCardUsesDefaultsOverInheritance is the heart of the report: the
// sub-card must be the creator's rung of the ladder, not a copy of its parent's.
func TestCreateSubCardUsesDefaultsOverInheritance(t *testing.T) {
	th, tearDown := setupRuleBoard(t)
	defer tearDown()

	parent := strategyCardBlock("someone-else")

	th.Store.EXPECT().GetBlock(parent.ID).Return(parent, nil).AnyTimes()
	th.Store.EXPECT().GetBlock(gomock.Not(gomock.Eq(parent.ID))).Return(nil, model.NewErrNotFound("block")).AnyTimes()
	th.Store.EXPECT().InsertBlock(gomock.Any(), userHead).Return(nil).Times(1)
	th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()

	card, err := th.App.CreateSubCard(&model.Card{BoardID: ruleBoardID}, parent.ID, ruleBoardID, userHead, true)

	require.NoError(t, err)
	require.Equal(t, valueStrategy, card.Properties[propCLevel],
		"the value comes from the rules that admit the creator, not from the parent")
}

// TestCreateSubCardRequiresParentAccess closes the way around the organization
// gate that filling defaults opened.
//
// A 본부장 sees every card through the full visibility floor, and a sub-card is
// born with their own division's values rather than the parent's — so attaching
// one to another division's card was accepted, and the card landed inside a tree
// its author has no business in. Creating the same card at the top level was
// refused, which is the inconsistency that gave it away.
//
// Commenting is the line. It means the organization gate admitted you. The full
// visibility floor deliberately does not: it grants reading across the boundary
// and nothing more (FR-022).
// TestCreateSubCardRequiresParentAccess closes the way around the organization
// gate that filling defaults opened.
//
// A 본부장 sees every card through the full visibility floor, and a sub-card is
// born with their own division's values rather than the parent's. So attaching
// one to another division's card was accepted — the new card was perfectly legal
// on its own — and it landed inside a tree its author has no part in. Creating
// the same card at the top level was refused, and that inconsistency is what
// gave it away.
//
// Commenting is the line. It means the organization gate admitted you. The full
// visibility floor deliberately does not: it grants reading across the boundary
// and nothing more (FR-022).
func TestCreateSubCardRequiresParentAccess(t *testing.T) {
	// A board shaped like the real one: one property carries the organization
	// gate, another the duty ladder. A 본부장 of either division can build a
	// legal card of their own, which is what makes the parent the only thing
	// standing between them and another division's tree.
	const (
		ladderType   = "prop-type"
		ladderObject = "opt-object"
		valueFactory = "opt-production-clevel"
	)

	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{
			{ID: "org-a", PropertyID: propCLevel, PropertyValueID: valueStrategy, DivisionID: divStrategy, Permission: model.PropertyAccessCommenter},
			{ID: "org-b", PropertyID: propCLevel, PropertyValueID: valueFactory, DivisionID: divProduction, Permission: model.PropertyAccessCommenter},
			{ID: "duty", PropertyID: ladderType, PropertyValueID: ladderObject, DutyID: dutyHead, Permission: model.PropertyAccessEditor},
		},
	}

	setup := func(t *testing.T) (*TestHelper, func()) {
		t.Helper()
		th, tearDown := SetupTestHelper(t)

		value, err := settings.AsProperty()
		require.NoError(t, err)
		board := &model.Board{ID: ruleBoardID, TeamID: ruleTeamID, Properties: map[string]interface{}{model.PropertyAccessKey: value}}

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetMemberForBoard(ruleBoardID, gomock.Any()).
			Return(&model.BoardMember{BoardID: ruleBoardID, SchemeEditor: true}, nil).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(gomock.Any(), ruleTeamID, gomock.Any()).
			DoAndReturn(func(_, _ string, permission *mmModel.Permission) bool {
				return permission == model.PermissionViewTeam
			}).AnyTimes()
		th.Store.EXPECT().GetOrgUnitsForTeam(ruleTeamID).Return(testOrgUnits(), nil).AnyTimes()
		th.Store.EXPECT().GetDutiesForTeam(ruleTeamID).Return(testDuties(), nil).AnyTimes()
		th.Store.EXPECT().GetUserOrgProfiles(ruleTeamID, gomock.Any()).
			DoAndReturn(func(_ string, userIDs []string) ([]*model.UserOrgProfile, error) {
				all := map[string]*model.UserOrgProfile{
					userHead:        {TeamID: ruleTeamID, UserID: userHead, PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyHead},
					userOutsideHead: {TeamID: ruleTeamID, UserID: userOutsideHead, PrimaryOrgUnitID: depFactory, PrimaryDutyID: dutyHead},
					userOutside:     {TeamID: ruleTeamID, UserID: userOutside, PrimaryOrgUnitID: depFactory, PrimaryDutyID: dutyLead},
				}
				out := make([]*model.UserOrgProfile, 0, len(userIDs))
				for _, id := range userIDs {
					if p, ok := all[id]; ok {
						out = append(out, p)
					}
				}
				return out, nil
			}).AnyTimes()

		return th, tearDown
	}

	// A 전략 card carrying both axes, so it is fully governed.
	parent := &model.Block{
		ID: "card-strategy", BoardID: ruleBoardID, ParentID: ruleBoardID, Type: model.TypeCard,
		Fields: map[string]interface{}{"properties": map[string]interface{}{
			propCLevel: valueStrategy, ladderType: ladderObject,
		}},
	}

	expectParentReads := func(th *TestHelper) {
		th.Store.EXPECT().GetBlock(parent.ID).Return(parent, nil).AnyTimes()
		th.Store.EXPECT().GetBlock(gomock.Not(gomock.Eq(parent.ID))).Return(nil, model.NewErrNotFound("block")).AnyTimes()
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()
	}

	t.Run("the division's own 본부장 may add one", func(t *testing.T) {
		th, tearDown := setup(t)
		defer tearDown()
		expectParentReads(th)
		th.Store.EXPECT().InsertBlock(gomock.Any(), userHead).Return(nil).Times(1)

		card, err := th.App.CreateSubCard(&model.Card{BoardID: ruleBoardID}, parent.ID, ruleBoardID, userHead, true)

		require.NoError(t, err)
		require.Equal(t, valueStrategy, card.Properties[propCLevel])
	})

	t.Run("another division's 본부장 may not, though full visibility shows them the card", func(t *testing.T) {
		th, tearDown := setup(t)
		defer tearDown()
		expectParentReads(th)
		th.Store.EXPECT().InsertBlock(gomock.Any(), gomock.Any()).Times(0)

		_, err := th.App.CreateSubCard(&model.Card{BoardID: ruleBoardID}, parent.ID, ruleBoardID, userOutsideHead, true)

		require.True(t, model.IsErrForbidden(err),
			"the card it would create is legal on its own — the parent is what they have no part in")
	})

	t.Run("a card they cannot see at all is refused too", func(t *testing.T) {
		th, tearDown := setup(t)
		defer tearDown()
		expectParentReads(th)
		th.Store.EXPECT().InsertBlock(gomock.Any(), gomock.Any()).Times(0)

		_, err := th.App.CreateSubCard(&model.Card{BoardID: ruleBoardID}, parent.ID, ruleBoardID, userOutside, true)

		require.True(t, model.IsErrForbidden(err), "expected a permission error, got %v", err)
	})
}

// TestInsertBlocksRelationMatrixCreation is the 수행업무 board report, end to
// end: 팀장 and 팀원 pressed 생성 and got "이 카드를 편집할 권한이 없습니다".
//
// The view they were on filters by 유형, so the card the screen sends arrives
// wearing that value and nothing else — no 본부, no 부서, no 담당자. Every row of
// that board's matrix is a relation, and a relation reads the organization off
// the card, so the creation check was answering a question the card could not
// yet be asked. Creating the same card blank and labeling it afterwards went
// straight through, which is what showed the refusal protected nothing.
//
// The duty axis is the half a new card can answer, and these cases hold it: a
// 팀장 still may not create a card in a 유형 only 본부장 may put a card in.
func TestInsertBlocksRelationMatrixCreation(t *testing.T) {
	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{
			{
				ID: "lead", PropertyID: propType, PropertyValueIDs: []string{valTask},
				Relation: model.RelationSameDepartment, OrgPropertyID: propDivision,
				DutyID: dutyLead, Permission: model.PropertyAccessEditor,
			},
			{
				ID: "head", PropertyID: propType, PropertyValueIDs: []string{valObjective},
				Relation: model.RelationSameDivision, OrgPropertyID: propDivision,
				DutyID: dutyHead, Permission: model.PropertyAccessEditor,
			},
		},
	}

	setup := func(t *testing.T) (*TestHelper, func()) {
		t.Helper()
		th, tearDown := SetupTestHelper(t)

		value, err := settings.AsProperty()
		require.NoError(t, err)
		board := &model.Board{ID: ruleBoardID, TeamID: ruleTeamID, Properties: map[string]interface{}{model.PropertyAccessKey: value}}

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetMemberForBoard(ruleBoardID, gomock.Any()).
			Return(&model.BoardMember{BoardID: ruleBoardID, SchemeEditor: true}, nil).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(gomock.Any(), ruleTeamID, gomock.Any()).
			DoAndReturn(func(_, _ string, permission *mmModel.Permission) bool {
				return permission == model.PermissionViewTeam
			}).AnyTimes()
		th.Store.EXPECT().GetOrgUnitsForTeam(ruleTeamID).Return(testOrgUnits(), nil).AnyTimes()
		th.Store.EXPECT().GetDutiesForTeam(ruleTeamID).Return(testDuties(), nil).AnyTimes()
		th.Store.EXPECT().GetUserOrgProfiles(ruleTeamID, gomock.Any()).
			DoAndReturn(func(_ string, userIDs []string) ([]*model.UserOrgProfile, error) {
				all := map[string]*model.UserOrgProfile{
					userLead: {TeamID: ruleTeamID, UserID: userLead, PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyLead},
					userHead: {TeamID: ruleTeamID, UserID: userHead, PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyHead},
				}
				out := make([]*model.UserOrgProfile, 0, len(userIDs))
				for _, id := range userIDs {
					if profile, ok := all[id]; ok {
						out = append(out, profile)
					}
				}
				return out, nil
			}).AnyTimes()

		return th, tearDown
	}

	cases := []struct {
		name    string
		userID  string
		typeVal string
		orgUnit string
		allowed bool
	}{
		{"a 팀장 may create the card the view's filter labeled for them", userLead, valTask, "", true},
		{"a 팀장 may not file that card under another department", userLead, valTask, depFactory, false},
		{"a 팀장 may not create a card in a 유형 only a 본부장 may reach", userLead, valObjective, "", false},
		{"a 본부장 may create their own 유형 the same way", userHead, valObjective, "", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			th, tearDown := setup(t)
			defer tearDown()

			properties := map[string]interface{}{propType: tc.typeVal}
			if tc.orgUnit != "" {
				properties[propDivision] = []interface{}{tc.orgUnit}
			}
			newCard := &model.Block{
				ID: "card-new", BoardID: ruleBoardID, ParentID: ruleBoardID,
				Type: model.TypeCard, CreatedBy: tc.userID,
				Fields: map[string]interface{}{"properties": properties},
			}

			th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block")).AnyTimes()
			if tc.allowed {
				th.Store.EXPECT().InsertBlock(newCard, tc.userID).Return(nil).Times(1)
				th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()
			} else {
				th.Store.EXPECT().InsertBlock(gomock.Any(), gomock.Any()).Times(0)
			}

			_, err := th.App.InsertBlocks([]*model.Block{newCard}, tc.userID)

			if tc.allowed {
				require.NoError(t, err)
			} else {
				require.True(t, model.IsErrForbidden(err), "expected a permission error, got %v", err)
			}
		})
	}
}

// TestInsertBlocksJudgesAuthorAsStored is the 팀원 half of the same report.
//
// 본인 holds when the viewer authored the card (FR-005), and a card being
// created is authored by whoever is creating it — but not yet. The store stamps
// created_by while inserting, which is after this check, and the screen sends
// the field empty. So the one relation written to cover a 팀원's own work was
// false on every card they made.
//
// The stamp is what the check has to read, not the field the client sent: a
// block that does not exist yet belongs to the requester whatever it claims, and
// one that does keeps the author the store recorded.
func TestInsertBlocksJudgesAuthorAsStored(t *testing.T) {
	settings := &model.PropertyAccessSettings{
		Enabled: true,
		Rules: []model.PropertyAccessRule{{
			ID: "member", PropertyID: propType, PropertyValueIDs: []string{valTask},
			Relation: model.RelationMine, OrgPropertyID: propDivision,
			AssigneePropertyID: propPerson, DutyID: dutyLead,
			Permission: model.PropertyAccessEditor,
		}},
	}

	setup := func(t *testing.T) (*TestHelper, func()) {
		t.Helper()
		th, tearDown := SetupTestHelper(t)

		value, err := settings.AsProperty()
		require.NoError(t, err)
		board := &model.Board{ID: ruleBoardID, TeamID: ruleTeamID, Properties: map[string]interface{}{model.PropertyAccessKey: value}}

		th.Store.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetBoard(ruleBoardID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetMemberForBoard(ruleBoardID, gomock.Any()).
			Return(&model.BoardMember{BoardID: ruleBoardID, SchemeEditor: true}, nil).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(gomock.Any(), ruleTeamID, gomock.Any()).
			DoAndReturn(func(_, _ string, permission *mmModel.Permission) bool {
				return permission == model.PermissionViewTeam
			}).AnyTimes()
		th.Store.EXPECT().GetOrgUnitsForTeam(ruleTeamID).Return(testOrgUnits(), nil).AnyTimes()
		th.Store.EXPECT().GetDutiesForTeam(ruleTeamID).Return(testDuties(), nil).AnyTimes()
		th.Store.EXPECT().GetUserOrgProfiles(ruleTeamID, gomock.Any()).
			DoAndReturn(func(_ string, userIDs []string) ([]*model.UserOrgProfile, error) {
				out := make([]*model.UserOrgProfile, 0, len(userIDs))
				for _, id := range userIDs {
					if id == userLead {
						out = append(out, &model.UserOrgProfile{TeamID: ruleTeamID, UserID: userLead, PrimaryOrgUnitID: depPlanning, PrimaryDutyID: dutyLead})
					}
				}
				return out, nil
			}).AnyTimes()

		return th, tearDown
	}

	newCard := func(createdBy string) *model.Block {
		return &model.Block{
			ID: "card-new", BoardID: ruleBoardID, ParentID: ruleBoardID,
			Type: model.TypeCard, CreatedBy: createdBy,
			Fields: map[string]interface{}{"properties": map[string]interface{}{propType: valTask}},
		}
	}

	t.Run("the screen sends no author, and the requester is the author", func(t *testing.T) {
		th, tearDown := setup(t)
		defer tearDown()

		card := newCard("")
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block")).AnyTimes()
		th.Store.EXPECT().InsertBlock(card, userLead).Return(nil).Times(1)
		th.Store.EXPECT().GetMembersForBoard(gomock.Any()).AnyTimes()

		_, err := th.App.InsertBlocks([]*model.Block{card}, userLead)

		require.NoError(t, err)
	})

	t.Run("a card the store already holds keeps the author the store recorded", func(t *testing.T) {
		th, tearDown := setup(t)
		defer tearDown()

		stored := newCard("someone-else")
		stored.Fields = map[string]interface{}{"properties": map[string]interface{}{}}

		th.Store.EXPECT().GetBlock("card-new").Return(stored, nil).AnyTimes()
		th.Store.EXPECT().InsertBlock(gomock.Any(), gomock.Any()).Times(0)

		_, err := th.App.InsertBlocks([]*model.Block{newCard("")}, userLead)

		require.True(t, model.IsErrForbidden(err),
			"claiming a 유형 on someone else's card is what the check is for")
	})
}
