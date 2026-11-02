// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package ws

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	mmModel "github.com/mattermost/mattermost/server/public/model"
)

// When a shared view turns private, the people who may no longer see it are
// told to forget it with a tombstone that carries nothing but the ID; its
// creator, who keeps the view, is left out of that message
// (specs/022-view-permission/contracts/private-view-filter.md F-07, F-08).
func TestBroadcastBlockDeleteExcept(t *testing.T) {
	th := SetupTestHelper(t)
	th.connect(t, "conn-1", "creator")
	th.connect(t, "conn-2", "other")
	th.store.EXPECT().GetMembersForBoard(fanoutBoardID).Return([]*model.BoardMember{
		{BoardID: fanoutBoardID, UserID: "creator"},
		{BoardID: fanoutBoardID, UserID: "other"},
	}, nil).AnyTimes()
	th.store.EXPECT().GetBoard(fanoutBoardID).Return(privateBoard(), nil).AnyTimes()
	th.auth.EXPECT().DoesUserHaveTeamAccess(gomock.Any(), fanoutTeamID).Return(true).AnyTimes()

	clusterSent := make(chan mmModel.PluginClusterEvent, 1)
	th.api.EXPECT().PublishPluginClusterEvent(gomock.Any(), gomock.Any()).
		DoAndReturn(func(ev mmModel.PluginClusterEvent, _ mmModel.PluginClusterEventSendOptions) error {
			clusterSent <- ev
			return nil
		}).Times(1)

	var delivered []map[string]interface{}
	th.api.EXPECT().PublishWebSocketEvent(gomock.Any(), gomock.Any(), &mmModel.WebsocketBroadcast{UserId: "other"}).
		Do(func(_ string, payload map[string]interface{}, _ *mmModel.WebsocketBroadcast) {
			delivered = append(delivered, payload)
		}).Times(2)
	th.api.EXPECT().PublishWebSocketEvent(gomock.Any(), gomock.Any(), &mmModel.WebsocketBroadcast{UserId: "creator"}).Times(0)

	th.pa.BroadcastBlockDeleteExcept(fanoutTeamID, "view-1", fanoutBoardID, "creator")

	require.Len(t, delivered, 1, "the direct send reaches the other member once")
	tombstone := blockFromPayload(delivered[0])
	require.NotNil(t, tombstone)
	require.Equal(t, "view-1", tombstone.ID)
	require.Equal(t, fanoutBoardID, tombstone.BoardID)
	require.NotZero(t, tombstone.DeleteAt)
	require.Empty(t, tombstone.Fields, "the tombstone carries none of what the view showed")
	require.Empty(t, tombstone.CreatedBy)
	require.Empty(t, tombstone.Title)

	select {
	case ev := <-clusterSent:
		var msg ClusterMessage
		require.NoError(t, json.Unmarshal(ev.Data, &msg))
		require.Equal(t, []string{"creator"}, msg.ExcludeUsers, "the exclusion travels with the cluster message")
		th.pa.HandleClusterEvent(ev)
	case <-time.After(2 * time.Second):
		t.Fatal("the cluster message was never published")
	}

	require.Len(t, delivered, 2, "a node re-entering the message applies the same exclusion")
}
