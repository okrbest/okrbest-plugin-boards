// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package ws

import (
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	mmModel "github.com/mattermost/mattermost/server/public/model"
)

// Websocket half of the enforcement contract in
// specs/002-card-property-access/contracts/property-access-rules.md §3 — rows
// E-08 and E-09.

// allowListFilter stands in for the app layer's evaluator: it lets through only
// the users named, and records what it was asked.
type allowListFilter struct {
	allowed   map[string]bool
	lastAsked []string
	lastBlock *model.Block
}

func (f *allowListFilter) FilterBlockRecipients(userIDs []string, block *model.Block) []string {
	f.lastAsked = append([]string{}, userIDs...)
	f.lastBlock = block

	kept := []string{}
	for _, userID := range userIDs {
		if f.allowed[userID] {
			kept = append(kept, userID)
		}
	}
	return kept
}

func blockPayload(block *model.Block) map[string]interface{} {
	return utils.StructToMap(UpdateBlockMsg{
		Action: websocketActionUpdateBlock,
		TeamID: "team-1",
		Block:  block,
	})
}

func TestBlockBroadcastAccessFilter(t *testing.T) {
	block := &model.Block{
		ID:      "card-1",
		BoardID: "board-1",
		Type:    model.TypeCard,
		Fields:  map[string]interface{}{"properties": map[string]interface{}{"prop": "value"}},
	}

	t.Run("E-08 and E-09 only the permitted recipient is messaged", func(t *testing.T) {
		th := SetupTestHelper(t)
		filter := &allowListFilter{allowed: map[string]bool{"allowed-user": true}}
		th.pa.SetBlockAccessFilter(filter)

		th.api.EXPECT().
			PublishWebSocketEvent(gomock.Any(), gomock.Any(), &mmModel.WebsocketBroadcast{UserId: "allowed-user"}).
			Times(1)

		th.pa.sendUserMessageSkipCluster(websocketActionUpdateBlock, blockPayload(block),
			th.pa.filterBlockRecipients([]string{"allowed-user", "denied-user"}, blockPayload(block))...)

		require.Equal(t, []string{"allowed-user", "denied-user"}, filter.lastAsked)
		require.NotNil(t, filter.lastBlock)
		require.Equal(t, "card-1", filter.lastBlock.ID)
	})

	t.Run("the block is handed to the filter with its property values intact", func(t *testing.T) {
		th := SetupTestHelper(t)
		filter := &allowListFilter{allowed: map[string]bool{}}
		th.pa.SetBlockAccessFilter(filter)

		th.pa.filterBlockRecipients([]string{"someone"}, blockPayload(block))

		properties, ok := filter.lastBlock.Fields["properties"].(map[string]interface{})
		require.True(t, ok, "without the property values the filter cannot judge the card")
		require.Equal(t, "value", properties["prop"])
	})

	t.Run("a message that carries no block is left alone", func(t *testing.T) {
		th := SetupTestHelper(t)
		filter := &allowListFilter{allowed: map[string]bool{}}
		th.pa.SetBlockAccessFilter(filter)

		payload := utils.StructToMap(UpdateBoardMsg{
			Action: websocketActionUpdateBoard,
			TeamID: "team-1",
			Board:  &model.Board{ID: "board-1"},
		})

		require.Equal(t, []string{"someone"}, th.pa.filterBlockRecipients([]string{"someone"}, payload),
			"board and member messages are not card content")
		require.Nil(t, filter.lastBlock)
	})

	t.Run("with no filter registered nothing is dropped", func(t *testing.T) {
		th := SetupTestHelper(t)

		require.Equal(t, []string{"a", "b"}, th.pa.filterBlockRecipients([]string{"a", "b"}, blockPayload(block)))
	})

	t.Run("a deletion carries the deleted block, so it can be judged", func(t *testing.T) {
		th := SetupTestHelper(t)
		filter := &allowListFilter{allowed: map[string]bool{}}
		th.pa.SetBlockAccessFilter(filter)

		deleted := *block
		deleted.DeleteAt = 1

		th.pa.filterBlockRecipients([]string{"someone"}, blockPayload(&deleted))

		require.NotNil(t, filter.lastBlock)
		require.Equal(t, int64(1), filter.lastBlock.DeleteAt)
		require.NotEmpty(t, filter.lastBlock.Fields,
			"a deletion announced by ID alone would be invisible to the filter")
	})
}

func TestDedupeUserIDs(t *testing.T) {
	require.Equal(t, []string{"a", "b"}, dedupeUserIDs([]string{"a", "b", "a", "b"}),
		"the block fan-out builds its recipient list without deduplicating")
	require.Empty(t, dedupeUserIDs(nil))
}
