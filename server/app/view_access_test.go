// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"sync"
	"testing"
	"time"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/ws"

	mmModel "github.com/mattermost/mattermost/server/public/model"
)

// The view write gate (specs/022-view-permission/contracts/view-write-gate.md).
//
// Case IDs (G-xx) are the contract's. The board carries no card access rules, so
// every judgement here is the view gate's own and not the 009 evaluator's.

const (
	vaBoardID = "board-view-access"
	vaTeamID  = "team-view-access"
	vaViewID  = "view-under-test"

	vaAdmin   = "user-admin"   // board admin
	vaEditor  = "user-editor"  // editor who did not create the view
	vaCreator = "user-creator" // editor who created the view
)

// setupViewAccessBoard wires a private board where vaAdmin manages and everyone
// else edits. Every permission lookup is registered AnyTimes so a test asserts
// only on the write it cares about.
func setupViewAccessBoard(t *testing.T) (*TestHelper, *model.Board, func()) {
	t.Helper()
	th, tearDown := SetupTestHelper(t)

	board := &model.Board{ID: vaBoardID, TeamID: vaTeamID, Type: model.BoardTypePrivate}

	th.Store.EXPECT().GetBoard(vaBoardID).Return(board, nil).AnyTimes()
	th.PermissionsStore.EXPECT().GetBoard(vaBoardID).Return(board, nil).AnyTimes()
	th.PermissionsStore.EXPECT().GetMemberForBoard(vaBoardID, gomock.Any()).
		DoAndReturn(func(_, userID string) (*model.BoardMember, error) {
			member := &model.BoardMember{BoardID: vaBoardID, UserID: userID}
			if userID == vaAdmin {
				member.SchemeAdmin = true
			} else {
				member.SchemeEditor = true
			}
			return member, nil
		}).AnyTimes()
	th.API.EXPECT().HasPermissionToTeam(gomock.Any(), vaTeamID, gomock.Any()).
		DoAndReturn(func(_, _ string, permission *mmModel.Permission) bool {
			return permission == model.PermissionViewTeam
		}).AnyTimes()
	// Websocket fan-out reads the member list; nothing here asserts on it.
	th.Store.EXPECT().GetMembersForBoard(vaBoardID).Return([]*model.BoardMember{}, nil).AnyTimes()

	return th, board, tearDown
}

func viewInMode(mode interface{}, createdBy string) *model.Block {
	fields := map[string]interface{}{"viewType": "table", "cardOrder": []interface{}{"card-1"}}
	if mode != nil {
		fields[model.ViewAccessModeKey] = mode
	}
	return &model.Block{
		ID: vaViewID, BoardID: vaBoardID, ParentID: vaBoardID, Type: model.TypeView,
		Title: "policy view", CreatedBy: createdBy, Fields: fields,
	}
}

func filterPatch() *model.BlockPatch {
	return &model.BlockPatch{UpdatedFields: map[string]interface{}{"filter": map[string]interface{}{"operation": "and", "filters": []interface{}{}}}}
}

func cardOrderPatch() *model.BlockPatch {
	return &model.BlockPatch{UpdatedFields: map[string]interface{}{"cardOrder": []interface{}{"card-2", "card-1"}}}
}

func requirePermissionError(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	var permErr *model.ErrPermission
	require.ErrorAs(t, err, &permErr, "expected a permission error, got %T: %v", err, err)
}

func TestRequireViewWritePermission_AdminMode(t *testing.T) {
	th, board, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	admin := viewInMode("admin", vaCreator)

	t.Run("G-03 editor may not change the filter", func(t *testing.T) {
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, admin, filterPatch(), board, viewWritePatch))
	})

	t.Run("G-04 editor may not rename", func(t *testing.T) {
		title := "renamed"
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, admin, &model.BlockPatch{Title: &title}, board, viewWritePatch))
	})

	t.Run("G-05 editor may not delete", func(t *testing.T) {
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, admin, nil, board, viewWriteDelete))
	})

	t.Run("G-06 editor may reorder cards", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaEditor, admin, cardOrderPatch(), board, viewWritePatch))
	})

	t.Run("G-07 card order bundled with another field is refused", func(t *testing.T) {
		patch := cardOrderPatch()
		patch.UpdatedFields["sortOptions"] = []interface{}{}
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, admin, patch, board, viewWritePatch))
	})

	t.Run("G-08 admin changes and deletes", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaAdmin, admin, filterPatch(), board, viewWritePatch))
		// Deleting a shared view asks how many are left (stage three).
		th.Store.EXPECT().GetBlocksWithType(vaBoardID, model.TypeView).Return(sharedViews(2), nil)
		require.NoError(t, th.App.requireViewWritePermission(vaAdmin, admin, nil, board, viewWriteDelete))
	})

	t.Run("G-13 editor may duplicate", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaEditor, admin, nil, board, viewWriteDuplicate))
	})

	t.Run("G-22 a card is not judged by the view gate", func(t *testing.T) {
		card := &model.Block{ID: "card-1", BoardID: vaBoardID, Type: model.TypeCard, Fields: map[string]interface{}{model.ViewAccessModeKey: "admin"}}
		require.NoError(t, th.App.requireViewWritePermission(vaEditor, card, filterPatch(), board, viewWritePatch))
	})
}

func TestPatchBlock_AdminViewIsGatedOnTheWritePath(t *testing.T) {
	th, _, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	admin := viewInMode("admin", vaCreator)
	th.Store.EXPECT().GetBlock(vaViewID).Return(admin, nil).AnyTimes()

	t.Run("G-03 through PatchBlock", func(t *testing.T) {
		_, err := th.App.PatchBlock(vaViewID, filterPatch(), vaEditor)
		requirePermissionError(t, err)
	})

	t.Run("G-06 through PatchBlock", func(t *testing.T) {
		patch := cardOrderPatch()
		th.Store.EXPECT().PatchBlock(vaViewID, patch, vaEditor).Return(nil)
		_, err := th.App.PatchBlock(vaViewID, patch, vaEditor)
		require.NoError(t, err)
	})
}

func TestDuplicateBlock_ViewCopyStartsAsEveryone(t *testing.T) {
	th, _, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	source := viewInMode("admin", vaCreator)
	copyID := "view-copy"
	copied := viewInMode("admin", vaEditor)
	copied.ID = copyID

	th.Store.EXPECT().GetBlock(vaViewID).Return(source, nil).AnyTimes()
	th.Store.EXPECT().DuplicateBlock(vaBoardID, vaViewID, vaEditor, false).Return([]*model.Block{copied}, nil)
	th.Store.EXPECT().PatchBlock(copyID, gomock.AssignableToTypeOf(&model.BlockPatch{}), vaEditor).
		DoAndReturn(func(_ string, patch *model.BlockPatch, _ string) error {
			require.Contains(t, patch.DeletedFields, model.ViewAccessModeKey)
			require.Empty(t, patch.UpdatedFields)
			return nil
		})

	blocks, err := th.App.DuplicateBlock(vaBoardID, vaViewID, vaEditor, false)
	require.NoError(t, err)
	require.Len(t, blocks, 1)
	_, stillThere := blocks[0].Fields[model.ViewAccessModeKey]
	require.False(t, stillThere, "G-13: the copy must not carry the source's mode")
}

// US2 — views that never chose a mode behave exactly as before. These pass on
// first run by design; they were proven live by flipping ViewAccessModeOf's
// default to admin and watching all three fail (T012).
func TestRequireViewWritePermission_DefaultIsEveryone(t *testing.T) {
	th, board, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	t.Run("G-01 a view without a mode accepts an editor's patch", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaEditor, viewInMode(nil, vaCreator), filterPatch(), board, viewWritePatch))
	})

	t.Run("G-02 a view without a mode accepts an editor's delete", func(t *testing.T) {
		th.Store.EXPECT().GetBlocksWithType(vaBoardID, model.TypeView).Return(sharedViews(2), nil)
		require.NoError(t, th.App.requireViewWritePermission(vaEditor, viewInMode(nil, vaCreator), nil, board, viewWriteDelete))
	})

	t.Run("G-21 an unknown stored value reads as everyone", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaEditor, viewInMode("locked", vaCreator), filterPatch(), board, viewWritePatch))
	})
}

func modePatch(mode string) *model.BlockPatch {
	return &model.BlockPatch{UpdatedFields: map[string]interface{}{model.ViewAccessModeKey: mode}}
}

// sharedViews is what GetBlocksWithType returns: the view under test plus n-1
// other shared views, so n == 1 makes the target the last shared view.
func sharedViews(n int) []*model.Block {
	views := []*model.Block{viewInMode(nil, vaCreator)}
	for i := 1; i < n; i++ {
		other := viewInMode(nil, vaCreator)
		other.ID = "view-other"
		views = append(views, other)
	}
	return views
}

func requireBadRequest(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	var badErr *model.ErrBadRequest
	require.ErrorAs(t, err, &badErr, "expected a bad request error, got %T: %v", err, err)
}

func TestRequireViewWritePermission_ModeTransitions(t *testing.T) {
	th, board, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	t.Run("G-09 editor may not reopen an admin view", func(t *testing.T) {
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, viewInMode("admin", vaCreator), modePatch("everyone"), board, viewWritePatch))
	})

	t.Run("G-10 editor may not lock a view", func(t *testing.T) {
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, viewInMode(nil, vaCreator), modePatch("admin"), board, viewWritePatch))
	})

	t.Run("G-11 admin locks a view", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaAdmin, viewInMode(nil, vaCreator), modePatch("admin"), board, viewWritePatch))
	})

	t.Run("G-12 another editor may not make a view private", func(t *testing.T) {
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, viewInMode(nil, vaCreator), modePatch("private"), board, viewWritePatch))
	})

	t.Run("G-14 the creator makes their view private", func(t *testing.T) {
		th.Store.EXPECT().GetBlocksWithType(vaBoardID, model.TypeView).Return(sharedViews(2), nil)
		require.NoError(t, th.App.requireViewWritePermission(vaCreator, viewInMode(nil, vaCreator), modePatch("private"), board, viewWritePatch))
	})

	t.Run("G-15 the last shared view cannot go private", func(t *testing.T) {
		th.Store.EXPECT().GetBlocksWithType(vaBoardID, model.TypeView).Return(sharedViews(1), nil)
		requireBadRequest(t, th.App.requireViewWritePermission(vaCreator, viewInMode(nil, vaCreator), modePatch("private"), board, viewWritePatch))
	})

	t.Run("G-16 the last shared view cannot be deleted", func(t *testing.T) {
		th.Store.EXPECT().GetBlocksWithType(vaBoardID, model.TypeView).Return(sharedViews(1), nil)
		requireBadRequest(t, th.App.requireViewWritePermission(vaAdmin, viewInMode(nil, vaCreator), nil, board, viewWriteDelete))
	})

	t.Run("a shared view that is not the last one is deleted", func(t *testing.T) {
		th.Store.EXPECT().GetBlocksWithType(vaBoardID, model.TypeView).Return(sharedViews(2), nil)
		require.NoError(t, th.App.requireViewWritePermission(vaEditor, viewInMode(nil, vaCreator), nil, board, viewWriteDelete))
	})

	t.Run("a private view is never the last shared one", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaCreator, viewInMode("private", vaCreator), nil, board, viewWriteDelete))
	})

	t.Run("G-20 a creator who is admin moves private to admin", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaAdmin, viewInMode("private", vaAdmin), modePatch("admin"), board, viewWritePatch))
	})

	t.Run("clearing the mode reads as everyone", func(t *testing.T) {
		clear := &model.BlockPatch{DeletedFields: []string{model.ViewAccessModeKey}}
		require.NoError(t, th.App.requireViewWritePermission(vaAdmin, viewInMode("admin", vaCreator), clear, board, viewWritePatch))
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, viewInMode("admin", vaCreator), clear, board, viewWritePatch))
	})

	t.Run("upsert: re-posting a view as admin needs an admin", func(t *testing.T) {
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, viewInMode(nil, vaCreator), modePatch("admin"), board, viewWriteUpsert))
		require.NoError(t, th.App.requireViewWritePermission(vaAdmin, viewInMode(nil, vaCreator), modePatch("admin"), board, viewWriteUpsert))
	})
}

func TestInsertBlocks_NewAdminViewNeedsAdmin(t *testing.T) {
	th, _, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	newView := func() *model.Block {
		view := viewInMode("admin", "")
		view.ID = "view-new"
		return view
	}
	th.Store.EXPECT().GetBlock("view-new").Return(nil, model.NewErrNotFound("block")).AnyTimes()

	t.Run("editor is refused before anything is stored", func(t *testing.T) {
		_, err := th.App.InsertBlocks([]*model.Block{newView()}, vaEditor)
		requirePermissionError(t, err)
	})

	t.Run("admin creates it", func(t *testing.T) {
		view := newView()
		th.Store.EXPECT().InsertBlock(view, vaAdmin).Return(nil)
		_, err := th.App.InsertBlocks([]*model.Block{view}, vaAdmin)
		require.NoError(t, err)
	})
}

// US3 — private views (contracts/view-write-gate.md G-17~G-19,
// contracts/private-view-filter.md F-01~F-06, F-11, F-14).

func TestRequireViewWritePermission_PrivateMode(t *testing.T) {
	th, board, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	private := viewInMode("private", vaCreator)

	t.Run("G-17 the creator changes and deletes", func(t *testing.T) {
		require.NoError(t, th.App.requireViewWritePermission(vaCreator, private, filterPatch(), board, viewWritePatch))
		require.NoError(t, th.App.requireViewWritePermission(vaCreator, private, nil, board, viewWriteDelete))
	})

	t.Run("G-18 another editor is refused on every write", func(t *testing.T) {
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, private, filterPatch(), board, viewWritePatch))
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, private, cardOrderPatch(), board, viewWritePatch))
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, private, nil, board, viewWriteDelete))
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, private, nil, board, viewWriteDuplicate))
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, private, nil, board, viewWriteUndelete))
		requirePermissionError(t, th.App.requireViewWritePermission(vaEditor, private, modePatch("everyone"), board, viewWriteUpsert))
	})

	t.Run("G-19 an admin who did not create it is refused too", func(t *testing.T) {
		requirePermissionError(t, th.App.requireViewWritePermission(vaAdmin, private, filterPatch(), board, viewWritePatch))
		requirePermissionError(t, th.App.requireViewWritePermission(vaAdmin, private, nil, board, viewWriteDelete))
	})
}

func blockIDs(blocks []*model.Block) []string {
	ids := make([]string, 0, len(blocks))
	for _, block := range blocks {
		ids = append(ids, block.ID)
	}
	return ids
}

// The board fixture carries no card access rules, so the 009 evaluator does not
// enforce anything here (F-05): whatever is removed, the private view filter
// removed it.
func TestFilterBlocksForUser_PrivateViews(t *testing.T) {
	th, _, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	private := viewInMode("private", vaCreator)
	public := viewInMode(nil, vaCreator)
	public.ID = "view-public"
	card := &model.Block{ID: "card-1", BoardID: vaBoardID, ParentID: vaBoardID, Type: model.TypeCard, Fields: map[string]interface{}{}}
	blocks := []*model.Block{private, public, card}

	t.Run("F-01 another editor does not receive it and the cards stay", func(t *testing.T) {
		got, err := th.App.FilterBlocksForUser(vaEditor, vaBoardID, blocks)
		require.NoError(t, err)
		require.Equal(t, []string{"view-public", "card-1"}, blockIDs(got))
	})

	t.Run("F-03 the creator keeps it", func(t *testing.T) {
		got, err := th.App.FilterBlocksForUser(vaCreator, vaBoardID, blocks)
		require.NoError(t, err)
		require.Equal(t, []string{vaViewID, "view-public", "card-1"}, blockIDs(got))
	})

	t.Run("F-04 an admin does not receive it either", func(t *testing.T) {
		got, err := th.App.FilterBlocksForUser(vaAdmin, vaBoardID, blocks)
		require.NoError(t, err)
		require.Equal(t, []string{"view-public", "card-1"}, blockIDs(got))
	})

	t.Run("F-11 the archive leaves it out", func(t *testing.T) {
		th.Store.EXPECT().GetBlocksForBoard(vaBoardID).Return(blocks, nil)
		got, err := th.App.blocksForArchive(vaBoardID, vaEditor)
		require.NoError(t, err)
		require.Equal(t, []string{"view-public", "card-1"}, blockIDs(got))
	})
}

func TestFilterBlockRecipients_PrivateViews(t *testing.T) {
	th, _, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	everyone := []string{vaCreator, vaEditor, vaAdmin}

	t.Run("F-06 only the creator hears about a private view", func(t *testing.T) {
		require.Equal(t, []string{vaCreator}, th.App.FilterBlockRecipients(everyone, viewInMode("private", vaCreator)))
	})

	t.Run("a shared view reaches everyone", func(t *testing.T) {
		require.Equal(t, everyone, th.App.FilterBlockRecipients(everyone, viewInMode("admin", vaCreator)))
	})

	t.Run("F-14 a card is left to the card rules", func(t *testing.T) {
		card := &model.Block{ID: "card-1", BoardID: vaBoardID, ParentID: vaBoardID, Type: model.TypeCard, Fields: map[string]interface{}{}}
		require.Equal(t, everyone, th.App.FilterBlockRecipients(everyone, card))
	})

	t.Run("a private view's deletion is announced to the creator only", func(t *testing.T) {
		require.Equal(t, []string{vaCreator}, th.App.FilterBlockRecipients(everyone, deletedBlockMessage(viewInMode("private", vaCreator))))
	})
}

// recordingAdapter stands in for the websocket adapter so the app's
// announcements can be asserted. Methods not listed panic through the nil
// embedded interface — a test that reaches one is asking about the wrong path.
type recordingAdapter struct {
	ws.Adapter
	mu         sync.Mutex
	changes    []*model.Block
	tombstones [][]string // blockID, boardID, excluded...
}

func (r *recordingAdapter) BroadcastBlockChange(_ string, block *model.Block) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.changes = append(r.changes, block)
}

func (r *recordingAdapter) BroadcastBlockDeleteExcept(_ string, blockID, boardID string, exceptUserIDs ...string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tombstones = append(r.tombstones, append([]string{blockID, boardID}, exceptUserIDs...))
}

func (r *recordingAdapter) snapshot() (int, [][]string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.changes), append([][]string{}, r.tombstones...)
}

// F-07: turning a shared view private announces the change to the creator
// (the normal block change, which the recipient filter narrows) and tells
// everyone else to forget the view with an ID-only tombstone.
func TestPatchBlock_PrivateTransitionAnnouncesATombstone(t *testing.T) {
	th, _, tearDown := setupViewAccessBoard(t)
	defer tearDown()
	recorder := &recordingAdapter{}
	th.App.wsAdapter = recorder

	shared := viewInMode(nil, vaCreator)
	nowPrivate := viewInMode("private", vaCreator)

	t.Run("shared to private", func(t *testing.T) {
		gomock.InOrder(
			th.Store.EXPECT().GetBlock(vaViewID).Return(shared, nil),
			th.Store.EXPECT().PatchBlock(vaViewID, gomock.Any(), vaCreator).Return(nil),
			th.Store.EXPECT().GetBlock(vaViewID).Return(nowPrivate, nil),
		)
		th.Store.EXPECT().GetBlocksWithType(vaBoardID, model.TypeView).Return(sharedViews(2), nil)

		_, err := th.App.PatchBlock(vaViewID, modePatch("private"), vaCreator)
		require.NoError(t, err)

		require.Eventually(t, func() bool {
			changes, tombstones := recorder.snapshot()
			return changes == 1 && len(tombstones) == 1
		}, 2*time.Second, 10*time.Millisecond, "one block change and one tombstone")
		_, tombstones := recorder.snapshot()
		require.Equal(t, []string{vaViewID, vaBoardID, vaCreator}, tombstones[0])
	})

	t.Run("a change that keeps the view shared sends no tombstone", func(t *testing.T) {
		gomock.InOrder(
			th.Store.EXPECT().GetBlock(vaViewID).Return(shared, nil),
			th.Store.EXPECT().PatchBlock(vaViewID, gomock.Any(), vaCreator).Return(nil),
			th.Store.EXPECT().GetBlock(vaViewID).Return(shared, nil),
		)

		_, err := th.App.PatchBlock(vaViewID, filterPatch(), vaCreator)
		require.NoError(t, err)

		require.Eventually(t, func() bool {
			changes, _ := recorder.snapshot()
			return changes == 2
		}, 2*time.Second, 10*time.Millisecond)
		_, tombstones := recorder.snapshot()
		require.Len(t, tombstones, 1, "still only the tombstone from the first step")
	})
}

// US6 — the admin's private view list and cleanup delete
// (contracts/admin-private-views-api.md, app half).

func TestGetPrivateViewsForBoard(t *testing.T) {
	th, _, tearDown := setupViewAccessBoard(t)
	defer tearDown()

	withMeta := func(view *model.Block, title string, createAt, deleteAt int64) *model.Block {
		view.ID = "view-" + title
		view.Title = title
		view.CreateAt = createAt
		view.DeleteAt = deleteAt
		return view
	}
	th.Store.EXPECT().GetBlocksWithType(vaBoardID, model.TypeView).Return([]*model.Block{
		withMeta(viewInMode("private", vaCreator), "beta", 20, 0),
		withMeta(viewInMode(nil, vaCreator), "shared", 30, 0),
		withMeta(viewInMode("private", vaEditor), "alpha", 10, 0),
		withMeta(viewInMode("private", vaEditor), "gone", 40, 99),
		withMeta(viewInMode("admin", vaAdmin), "locked", 50, 0),
	}, nil)

	got, err := th.App.GetPrivateViewsForBoard(vaBoardID)
	require.NoError(t, err)
	require.Equal(t, []*model.PrivateViewSummary{
		{ID: "view-alpha", Title: "alpha", CreatedBy: vaEditor, CreateAt: 10},
		{ID: "view-beta", Title: "beta", CreatedBy: vaCreator, CreateAt: 20},
	}, got, "private, not deleted, sorted by title, nothing of the configuration")
}

func TestDeletePrivateViewAsAdmin(t *testing.T) {
	th, _, tearDown := setupViewAccessBoard(t)
	defer tearDown()
	recorder := &recordingAdapter{}
	th.App.wsAdapter = recorder

	t.Run("a shared view is not found through this path", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(vaViewID).Return(viewInMode(nil, vaCreator), nil)
		err := th.App.DeletePrivateViewAsAdmin(vaBoardID, vaViewID, vaAdmin)
		require.True(t, model.IsErrNotFound(err), "got %v", err)
	})

	t.Run("a view of another board is not found", func(t *testing.T) {
		elsewhere := viewInMode("private", vaCreator)
		elsewhere.BoardID = "board-elsewhere"
		th.Store.EXPECT().GetBlock(vaViewID).Return(elsewhere, nil)
		err := th.App.DeletePrivateViewAsAdmin(vaBoardID, vaViewID, vaAdmin)
		require.True(t, model.IsErrNotFound(err), "got %v", err)
	})

	t.Run("a private view is deleted past the gate and announced", func(t *testing.T) {
		private := viewInMode("private", vaCreator)
		th.Store.EXPECT().GetBlock(vaViewID).Return(private, nil)
		th.Store.EXPECT().DeleteBlock(vaViewID, vaAdmin).Return(nil)

		require.NoError(t, th.App.DeletePrivateViewAsAdmin(vaBoardID, vaViewID, vaAdmin))

		require.Eventually(t, func() bool {
			changes, _ := recorder.snapshot()
			return changes == 1
		}, 2*time.Second, 10*time.Millisecond)
		recorder.mu.Lock()
		defer recorder.mu.Unlock()
		require.NotZero(t, recorder.changes[0].DeleteAt, "announced as a deletion the creator's client understands")
		require.Equal(t, vaViewID, recorder.changes[0].ID)
	})
}
