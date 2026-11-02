// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"sort"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// viewWriteOp names the kind of write a view block is about to receive. The
// gate below judges each kind a little differently (see
// specs/022-view-permission/contracts/view-write-gate.md).
type viewWriteOp int

const (
	viewWritePatch viewWriteOp = iota
	viewWriteDelete
	viewWriteDuplicate
	viewWriteUndelete
	viewWriteUpsert
)

// requireViewWritePermission refuses a write to a view the view's access mode
// does not let this user make.
//
// stored is the view as the store holds it (or, for an undelete, as history
// holds it) — the mode and the author are read from there, never from the
// request. patch is only consulted for a patch or an upsert, where it decides
// whether the write is the one exception an admin-only view grants to editors
// (card order) and whether it moves the view to another mode.
//
// Anything that is not a view passes untouched: cards, comments and content
// answer to the card access rules (009) and to nothing here.
func (a *App) requireViewWritePermission(userID string, stored *model.Block, patch *model.BlockPatch, board *model.Board, op viewWriteOp) error {
	if stored == nil || board == nil || stored.Type != model.TypeView {
		return nil
	}

	mode := model.ViewAccessModeOf(stored)

	// Stage one: may this user touch a view in its current mode at all?
	switch mode {
	case model.ViewAccessAdmin:
		// Card order is how a card is dragged within a column or a table; the
		// user chose to leave that open. A duplicate changes nothing on the
		// source and its copy starts as everyone's (see DuplicateBlock).
		cardOrderOnly := op == viewWritePatch && model.IsCardOrderOnlyPatch(patch)
		if !cardOrderOnly && op != viewWriteDuplicate && !a.isBoardAdmin(userID, board.ID) {
			return model.NewErrPermission("access denied to modify an admin-only view")
		}
	case model.ViewAccessPrivate:
		// A private view is its creator's alone — to read, and so to write in
		// any way, a copy and a restore included. Admins reach it only through
		// the cleanup endpoint, which bypasses this gate on purpose.
		if stored.CreatedBy != userID {
			return model.NewErrPermission("access denied to another user's private view")
		}
	case model.ViewAccessEveryone:
		// Everyone passes the board's own edit permission, which the API
		// already checked.
	}

	// Stage two: may this user move the view into the mode the write asks for?
	// Each mode has its own bar: admin is the admin's to grant, private is the
	// creator's, and everyone is open to whoever may touch the view at all.
	if (op == viewWritePatch || op == viewWriteUpsert) && patchTouchesViewAccess(patch) {
		after := model.ViewAccessModeOf(projectPatch(stored, patch))
		if after != mode {
			switch after {
			case model.ViewAccessAdmin:
				if !a.isBoardAdmin(userID, board.ID) {
					return model.NewErrPermission("only a board admin may make a view admin-only")
				}
			case model.ViewAccessPrivate:
				if stored.CreatedBy != userID {
					return model.NewErrPermission("only the view's creator may make it private")
				}
				if err := a.requireNotLastSharedView(board.ID, stored.ID); err != nil {
					return err
				}
			case model.ViewAccessEveryone:
			}
		}
	}

	// Stage three: the board keeps at least one view the others can see.
	if op == viewWriteDelete && mode != model.ViewAccessPrivate {
		if err := a.requireNotLastSharedView(board.ID, stored.ID); err != nil {
			return err
		}
	}

	return nil
}

// requireViewInsertPermission judges a view that does not exist yet. The only
// thing a brand new view can claim is a mode, and admin is the admin's to claim.
// Private needs no check: the store stamps the requester as the creator.
func (a *App) requireViewInsertPermission(userID string, incoming *model.Block, board *model.Board) error {
	if incoming == nil || board == nil || incoming.Type != model.TypeView {
		return nil
	}
	if model.ViewAccessModeOf(incoming) == model.ViewAccessAdmin && !a.isBoardAdmin(userID, board.ID) {
		return model.NewErrPermission("only a board admin may create an admin-only view")
	}
	return nil
}

// patchTouchesViewAccess reports whether a patch writes or clears the mode.
func patchTouchesViewAccess(patch *model.BlockPatch) bool {
	if patch == nil {
		return false
	}
	if _, ok := patch.UpdatedFields[model.ViewAccessModeKey]; ok {
		return true
	}
	for _, key := range patch.DeletedFields {
		if key == model.ViewAccessModeKey {
			return true
		}
	}
	return false
}

// requireNotLastSharedView refuses to take away the board's last view that is
// not somebody's private one. Allowing it would leave every other member with a
// board that has no view at all — the webapp has no screen for that.
func (a *App) requireNotLastSharedView(boardID, viewID string) error {
	views, err := a.store.GetBlocksWithType(boardID, model.TypeView)
	if err != nil {
		return err
	}
	shared := make([]*model.Block, 0, len(views))
	for _, view := range views {
		if view == nil || view.DeleteAt != 0 || model.ViewAccessModeOf(view) == model.ViewAccessPrivate {
			continue
		}
		shared = append(shared, view)
	}
	if len(shared) == 1 && shared[0].ID == viewID {
		return model.NewErrBadRequest("the board must keep at least one shared view")
	}
	return nil
}

// isBoardAdmin is the bar this feature calls "admin": the same board-level
// permission that guards membership, card access rules and the property editor
// lock (010). Board admins, system admins and team admins who are explicit
// members all clear it.
func (a *App) isBoardAdmin(userID, boardID string) bool {
	return a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles)
}

// GetPrivateViewsForBoard lists a board's private views for its admins: enough
// to recognize and delete each one, none of what it shows (FR-023).
func (a *App) GetPrivateViewsForBoard(boardID string) ([]*model.PrivateViewSummary, error) {
	views, err := a.store.GetBlocksWithType(boardID, model.TypeView)
	if err != nil {
		return nil, err
	}

	summaries := make([]*model.PrivateViewSummary, 0)
	for _, view := range views {
		if view == nil || view.DeleteAt != 0 || model.ViewAccessModeOf(view) != model.ViewAccessPrivate {
			continue
		}
		summaries = append(summaries, &model.PrivateViewSummary{
			ID:        view.ID,
			Title:     view.Title,
			CreatedBy: view.CreatedBy,
			CreateAt:  view.CreateAt,
		})
	}
	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].Title < summaries[j].Title
	})
	return summaries, nil
}

// DeletePrivateViewAsAdmin removes a private view on an admin's behalf — the one
// write to another person's private view that is allowed, and only through
// this path (FR-024). The caller has already required the admin permission.
//
// Anything that is not a live private view of this board is "not found": a
// shared view is deleted through the ordinary path with the ordinary gate, and
// this endpoint must not become a second way to reach it.
func (a *App) DeletePrivateViewAsAdmin(boardID, viewID, userID string) error {
	block, err := a.store.GetBlock(viewID)
	if err != nil {
		return err
	}
	if block == nil || block.BoardID != boardID || block.Type != model.TypeView ||
		model.ViewAccessModeOf(block) != model.ViewAccessPrivate || block.DeleteAt != 0 {
		return model.NewErrNotFound("private view " + viewID)
	}

	board, err := a.store.GetBoard(boardID)
	if err != nil {
		return err
	}

	return a.deleteBlockUnchecked(block, board, userID, false)
}
