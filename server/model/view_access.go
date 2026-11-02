// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// ViewAccessMode says who may see a view and who may change what it shows.
//
// It lives in the view block's fields next to the filter and the sort, under
// ViewAccessModeKey, and is absent on every view that was never given one.
type ViewAccessMode string

const (
	// ViewAccessEveryone is the default: every board reader sees the view and
	// every board editor may change its configuration. Absent means this.
	ViewAccessEveryone ViewAccessMode = "everyone"

	// ViewAccessAdmin keeps the view visible to everyone but leaves its
	// configuration to board admins. Card order is the one field editors keep.
	ViewAccessAdmin ViewAccessMode = "admin"

	// ViewAccessPrivate shows the view to its creator only. Nobody else
	// receives it, reads it or writes it.
	ViewAccessPrivate ViewAccessMode = "private"
)

// ViewAccessModeKey is the view block field that stores the mode.
const ViewAccessModeKey = "accessMode"

// ViewAccessModeOf reads a view's mode.
//
// Everyone is the answer for everything that is not one of the other two
// values spelled exactly: a view that never set it, a value that is not a
// string, and a string nobody defined. Reading a half understood value as
// locked or hidden would take a view away from people nobody meant to shut out.
func ViewAccessModeOf(block *Block) ViewAccessMode {
	if block == nil || block.Fields == nil {
		return ViewAccessEveryone
	}
	stored, ok := block.Fields[ViewAccessModeKey].(string)
	if !ok {
		return ViewAccessEveryone
	}
	switch ViewAccessMode(stored) {
	case ViewAccessAdmin:
		return ViewAccessAdmin
	case ViewAccessPrivate:
		return ViewAccessPrivate
	case ViewAccessEveryone:
		return ViewAccessEveryone
	default:
		return ViewAccessEveryone
	}
}

// ViewHiddenFrom reports whether this block is a private view that userID did
// not create — the one case in which a block is kept from a board reader
// regardless of card access rules.
func ViewHiddenFrom(block *Block, userID string) bool {
	if block == nil || block.Type != TypeView {
		return false
	}
	return ViewAccessModeOf(block) == ViewAccessPrivate && block.CreatedBy != userID
}

// IsCardOrderOnlyPatch reports whether a patch changes the view's card order and
// nothing else. Dragging a card within a column or a table writes exactly this,
// and it is the one change an admin-only view still accepts from an editor.
func IsCardOrderOnlyPatch(patch *BlockPatch) bool {
	if patch == nil {
		return false
	}
	if patch.ParentID != nil || patch.Schema != nil || patch.Type != nil || patch.Title != nil {
		return false
	}
	if len(patch.DeletedFields) != 0 || len(patch.UpdatedFields) != 1 {
		return false
	}
	_, ok := patch.UpdatedFields["cardOrder"]
	return ok
}

// PrivateViewSummary is what a board admin sees of a private view: enough to
// recognize and delete it, none of what it shows.
type PrivateViewSummary struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedBy string `json:"createdBy"`
	CreateAt  int64  `json:"createAt"`
}
