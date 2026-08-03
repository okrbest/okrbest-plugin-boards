// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

//go:build integration
// +build integration

package integrationtests

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/client"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// Enforcement contract tests for
// specs/002-card-property-access/contracts/property-access-rules.md §3.
//
// The organization chart these lean on is fixed in pluginteststore.go: the
// "editor" fixture sits under 전략본부 and the "commenter" fixture under
// 생산본부. Both are given the same board role, so any difference in what they
// see comes from the rule and not from the board.

const (
	propCLevel      = "prop-clevel"
	valueStrategy   = "opt-strategy"
	valueProduction = "opt-production"

	cardStrategyID   = "card-strategy"
	cardProductionID = "card-production"
	commentID        = "comment-on-strategy"
)

type accessTestData struct {
	board *model.Board
}

func setupPropertyAccessData(t *testing.T, th *TestHelper) accessTestData {
	t.Helper()

	board, err := th.Server.App().CreateBoard(
		&model.Board{Title: "Rules board", TeamID: "test-team", Type: model.BoardTypePrivate, MinimumRole: "viewer"},
		userAdminID, true)
	require.NoError(t, err)

	// Both non-admins get the same board role on purpose: the rule is the only
	// thing that may separate them.
	for _, userID := range []string{userEditorID, userCommenterID} {
		_, err = th.Server.App().AddMemberToBoard(&model.BoardMember{BoardID: board.ID, UserID: userID, SchemeEditor: true})
		require.NoError(t, err)
	}

	cards := []*model.Block{
		{
			ID: cardStrategyID, Title: "전략 카드", Type: model.TypeCard, BoardID: board.ID,
			ParentID: board.ID,
			Fields:   map[string]interface{}{"properties": map[string]interface{}{propCLevel: valueStrategy}},
		},
		{
			ID: cardProductionID, Title: "생산 카드", Type: model.TypeCard, BoardID: board.ID,
			ParentID: board.ID,
			Fields:   map[string]interface{}{"properties": map[string]interface{}{propCLevel: valueProduction}},
		},
		{
			ID: commentID, Title: "숨겨야 하는 댓글", Type: model.TypeComment, BoardID: board.ID,
			ParentID: cardStrategyID,
			Fields:   map[string]interface{}{},
		},
	}
	for _, block := range cards {
		require.NoError(t, th.Server.App().InsertBlock(block, userAdminID))
	}

	return accessTestData{board: board}
}

// setRules writes the rule set onto the board through the same path the share
// dialog uses.
func setRules(t *testing.T, th *TestHelper, boardID string, enabled bool) {
	t.Helper()

	settings := &model.PropertyAccessSettings{
		Enabled: enabled,
		Rules: []model.PropertyAccessRule{{
			ID:              "r1",
			PropertyID:      propCLevel,
			PropertyValueID: valueStrategy,
			DivisionID:      orgDivStrategy,
			Permission:      model.PropertyAccessViewer,
		}},
	}
	value, err := settings.AsProperty()
	require.NoError(t, err)

	_, err = th.Server.App().PatchBoard(&model.BoardPatch{
		UpdatedProperties: map[string]interface{}{model.PropertyAccessKey: value},
	}, boardID, userAdminID)
	require.NoError(t, err)
}

func blockIDs(blocks []*model.Block) []string {
	ids := make([]string, 0, len(blocks))
	for _, block := range blocks {
		ids = append(ids, block.ID)
	}
	return ids
}

func fetchBlocks(t *testing.T, c *client.Client, boardID string) []string {
	t.Helper()

	blocks, resp := c.GetAllBlocksForBoard(boardID)
	require.NoError(t, resp.Error)
	return blockIDs(blocks)
}

func TestPropertyAccessReadEnforcement(t *testing.T) {
	th := SetupTestHelperPluginMode(t)
	defer th.TearDown()
	clients := setupClients(th)
	data := setupPropertyAccessData(t, th)

	setRules(t, th, data.board.ID, true)

	t.Run("E-01 a card the rule hides is absent from the block response", func(t *testing.T) {
		ids := fetchBlocks(t, clients.Commenter, data.board.ID)

		require.NotContains(t, ids, cardStrategyID)
		require.Contains(t, ids, cardProductionID)
	})

	t.Run("E-02 the hidden card's children are absent too", func(t *testing.T) {
		ids := fetchBlocks(t, clients.Commenter, data.board.ID)

		require.NotContains(t, ids, commentID,
			"leaving the comment behind would leak the content the rule hides")
	})

	t.Run("a user inside the division still sees the card and its children", func(t *testing.T) {
		ids := fetchBlocks(t, clients.Editor, data.board.ID)

		require.Contains(t, ids, cardStrategyID)
		require.Contains(t, ids, commentID)
	})

	t.Run("E-10 a board admin is not filtered", func(t *testing.T) {
		ids := fetchBlocks(t, clients.Admin, data.board.ID)

		require.Contains(t, ids, cardStrategyID)
		require.Contains(t, ids, cardProductionID)
		require.Contains(t, ids, commentID)
	})

	t.Run("E-12 a card no rule mentions is returned to everyone", func(t *testing.T) {
		for name, c := range map[string]*client.Client{
			"editor": clients.Editor, "commenter": clients.Commenter, "admin": clients.Admin,
		} {
			require.Contains(t, fetchBlocks(t, c, data.board.ID), cardProductionID, name)
		}
	})

	t.Run("the card endpoints apply the same filter", func(t *testing.T) {
		cards, resp := clients.Commenter.GetCards(data.board.ID, 0, 100)
		require.NoError(t, resp.Error)

		for _, card := range cards {
			require.NotEqual(t, cardStrategyID, card.ID)
		}
	})

	t.Run("E-11 turning the switch off restores the board permission everywhere", func(t *testing.T) {
		setRules(t, th, data.board.ID, false)
		defer setRules(t, th, data.board.ID, true)

		ids := fetchBlocks(t, clients.Commenter, data.board.ID)

		require.Contains(t, ids, cardStrategyID)
		require.Contains(t, ids, commentID)
	})
}
