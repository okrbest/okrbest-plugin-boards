// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package ws

import (
	"sort"
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// Who a board's changes are broadcast to.
//
// Permission and delivery used to read different data. An open board grants
// every team participant a role through minimum_role without writing a
// membership row (see mmpermissions.GetBoardPermissions), but the fan-out
// intersected the connected users with GetMembersForBoard, which knows only
// explicit rows and the ones synthesized from channel membership. The result
// was a board everyone could edit over REST and nobody heard about live —
// whether you got updates depended on whether you happened to be in the linked
// channel.

const (
	fanoutTeamID  = "team-fanout"
	fanoutBoardID = "board-fanout"
)

// connect subscribes a user to the team so the fan-out sees them as a listener.
func (th *TestHelper) connect(t *testing.T, webConnID, userID string) {
	t.Helper()
	th.SubscribeWebConnToTeam(webConnID, userID, fanoutTeamID)
}

func openBoard(minimumRole model.BoardRole) *model.Board {
	return &model.Board{
		ID: fanoutBoardID, TeamID: fanoutTeamID,
		Type: model.BoardTypeOpen, MinimumRole: minimumRole,
	}
}

func privateBoard() *model.Board {
	return &model.Board{ID: fanoutBoardID, TeamID: fanoutTeamID, Type: model.BoardTypePrivate}
}

func TestFanoutForOpenBoard(t *testing.T) {
	t.Run("a team participant who is not a member is still reached", func(t *testing.T) {
		th := SetupTestHelper(t)
		th.connect(t, "conn-1", "member")
		th.connect(t, "conn-2", "non-member")

		th.store.EXPECT().GetMembersForBoard(fanoutBoardID).
			Return([]*model.BoardMember{{BoardID: fanoutBoardID, UserID: "member"}}, nil).AnyTimes()
		th.store.EXPECT().GetBoard(fanoutBoardID).Return(openBoard(model.BoardRoleEditor), nil).AnyTimes()
		th.auth.EXPECT().DoesUserHaveTeamAccess(gomock.Any(), fanoutTeamID).Return(true).AnyTimes()

		got := th.pa.getUserIDsForTeamAndBoard(fanoutTeamID, fanoutBoardID)
		sort.Strings(got)

		require.Equal(t, []string{"member", "non-member"}, got,
			"minimum_role gives the non-member the same role, so they belong in the fan-out")
	})

	t.Run("team access is still required", func(t *testing.T) {
		th := SetupTestHelper(t)
		th.connect(t, "conn-1", "insider")
		th.connect(t, "conn-2", "outsider")

		th.store.EXPECT().GetMembersForBoard(fanoutBoardID).Return([]*model.BoardMember{}, nil).AnyTimes()
		th.store.EXPECT().GetBoard(fanoutBoardID).Return(openBoard(model.BoardRoleEditor), nil).AnyTimes()
		th.auth.EXPECT().DoesUserHaveTeamAccess("insider", fanoutTeamID).Return(true).AnyTimes()
		th.auth.EXPECT().DoesUserHaveTeamAccess("outsider", fanoutTeamID).Return(false).AnyTimes()

		require.Equal(t, []string{"insider"}, th.pa.getUserIDsForTeamAndBoard(fanoutTeamID, fanoutBoardID))
	})

	t.Run("an open board granting no role falls back to membership", func(t *testing.T) {
		th := SetupTestHelper(t)
		th.connect(t, "conn-1", "member")
		th.connect(t, "conn-2", "non-member")

		th.store.EXPECT().GetMembersForBoard(fanoutBoardID).
			Return([]*model.BoardMember{{BoardID: fanoutBoardID, UserID: "member"}}, nil).AnyTimes()
		th.store.EXPECT().GetBoard(fanoutBoardID).Return(openBoard(model.BoardRoleNone), nil).AnyTimes()
		th.auth.EXPECT().DoesUserHaveTeamAccess(gomock.Any(), fanoutTeamID).Return(true).AnyTimes()

		require.Equal(t, []string{"member"}, th.pa.getUserIDsForTeamAndBoard(fanoutTeamID, fanoutBoardID),
			"no minimum role means the board grants nothing, so there is nobody extra to tell")
	})
}

func TestFanoutForPrivateBoard(t *testing.T) {
	th := SetupTestHelper(t)
	th.connect(t, "conn-1", "member")
	th.connect(t, "conn-2", "non-member")

	th.store.EXPECT().GetMembersForBoard(fanoutBoardID).
		Return([]*model.BoardMember{{BoardID: fanoutBoardID, UserID: "member"}}, nil).AnyTimes()
	th.store.EXPECT().GetBoard(fanoutBoardID).Return(privateBoard(), nil).AnyTimes()
	th.auth.EXPECT().DoesUserHaveTeamAccess(gomock.Any(), fanoutTeamID).Return(true).AnyTimes()

	require.Equal(t, []string{"member"}, th.pa.getUserIDsForTeamAndBoard(fanoutTeamID, fanoutBoardID),
		"a private board is reached through membership alone, exactly as before")
}

// TestFanoutFallsBackWhenBoardUnreadable keeps a lookup failure from widening
// the audience. Whatever the board turns out to be, an error must not be read
// as "this is an open board".
func TestFanoutFallsBackWhenBoardUnreadable(t *testing.T) {
	th := SetupTestHelper(t)
	th.connect(t, "conn-1", "member")
	th.connect(t, "conn-2", "non-member")

	th.store.EXPECT().GetMembersForBoard(fanoutBoardID).
		Return([]*model.BoardMember{{BoardID: fanoutBoardID, UserID: "member"}}, nil).AnyTimes()
	th.store.EXPECT().GetBoard(fanoutBoardID).Return(nil, model.NewErrNotFound("board")).AnyTimes()
	th.auth.EXPECT().DoesUserHaveTeamAccess(gomock.Any(), fanoutTeamID).Return(true).AnyTimes()

	require.Equal(t, []string{"member"}, th.pa.getUserIDsForTeamAndBoard(fanoutTeamID, fanoutBoardID))
}

// TestFanoutStillDedupes guards the property the block fan-out depends on: a
// user must appear once, or they are judged and messaged twice.
func TestFanoutStillDedupes(t *testing.T) {
	th := SetupTestHelper(t)
	th.connect(t, "conn-1", "member")

	th.store.EXPECT().GetMembersForBoard(fanoutBoardID).Return([]*model.BoardMember{
		{BoardID: fanoutBoardID, UserID: "member"},
		{BoardID: fanoutBoardID, UserID: "member", Synthetic: true},
	}, nil).AnyTimes()
	th.store.EXPECT().GetBoard(fanoutBoardID).Return(openBoard(model.BoardRoleEditor), nil).AnyTimes()
	th.auth.EXPECT().DoesUserHaveTeamAccess(gomock.Any(), fanoutTeamID).Return(true).AnyTimes()

	require.Equal(t, []string{"member"}, th.pa.getUserIDsForTeamAndBoard(fanoutTeamID, fanoutBoardID))
}
