// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"errors"
	"fmt"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

var ErrBlocksFromMultipleBoards = errors.New("the block set contain blocks from multiple boards")

func (a *App) GetBlocks(boardID, parentID string, blockType string) ([]*model.Block, error) {
	if boardID == "" {
		return []*model.Block{}, nil
	}

	if blockType != "" && parentID != "" {
		return a.store.GetBlocksWithParentAndType(boardID, parentID, blockType)
	}

	if blockType != "" {
		return a.store.GetBlocksWithType(boardID, blockType)
	}

	return a.store.GetBlocksWithParent(boardID, parentID)
}

// GetBlocksForUser is GetBlocks with card level access applied. The rule-free
// GetBlocks stays as it is for the internal callers that act on the board's own
// behalf — duplication, export, notifications — rather than on a user's.
func (a *App) GetBlocksForUser(userID, boardID, parentID, blockType string) ([]*model.Block, error) {
	blocks, err := a.GetBlocks(boardID, parentID, blockType)
	if err != nil {
		return nil, err
	}
	return a.FilterBlocksForUser(userID, boardID, blocks)
}

// GetBlocksForBoardForUser is GetBlocksForBoard with card level access applied.
func (a *App) GetBlocksForBoardForUser(userID, boardID string) ([]*model.Block, error) {
	blocks, err := a.GetBlocksForBoard(boardID)
	if err != nil {
		return nil, err
	}
	return a.FilterBlocksForUser(userID, boardID, blocks)
}

// FilterBlocksForUser removes the cards the user may not read together with the
// blocks that hang off them (FR-025, FR-026).
//
// Dropping the card alone would leave its description, comments and attachments
// in the response, which is the whole of the content the rule was written to
// hide.
func (a *App) FilterBlocksForUser(userID, boardID string, blocks []*model.Block) ([]*model.Block, error) {
	if len(blocks) == 0 {
		return blocks, nil
	}

	board, err := a.GetBoard(boardID)
	if err != nil {
		return nil, err
	}

	evaluator, err := a.newPropertyAccessEvaluator(userID, board)
	if err != nil {
		return nil, err
	}
	if !evaluator.Enforces() {
		return blocks, nil
	}

	denied := a.deniedCardIDs(evaluator, blocks)
	if len(denied) == 0 {
		return blocks, nil
	}

	filtered := make([]*model.Block, 0, len(blocks))
	for _, block := range blocks {
		if block == nil || denied[block.ID] || denied[block.ParentID] {
			continue
		}
		filtered = append(filtered, block)
	}

	return filtered, nil
}

// FilterCardsForUser is FilterBlocksForUser for the card shaped endpoints.
func (a *App) FilterCardsForUser(userID, boardID string, cards []*model.Card) ([]*model.Card, error) {
	if len(cards) == 0 {
		return cards, nil
	}

	board, err := a.GetBoard(boardID)
	if err != nil {
		return nil, err
	}

	evaluator, err := a.newPropertyAccessEvaluator(userID, board)
	if err != nil {
		return nil, err
	}
	if !evaluator.Enforces() {
		return cards, nil
	}

	allowed := make([]*model.Card, 0, len(cards))
	for _, card := range cards {
		if card == nil {
			continue
		}
		if evaluator.For(model.Card2Block(card)) == model.EffectiveBoardPermissionNone {
			continue
		}
		allowed = append(allowed, card)
	}

	return allowed, nil
}

// requireCardEditPermission refuses a change to a card the rules do not let this
// user edit (FR-027).
func (a *App) requireCardEditPermission(userID string, block *model.Block, board *model.Board) error {
	return a.requireCardPermission(userID, block, board, model.EffectiveBoardPermissionEdit, nil)
}

// requireCardPermission refuses a write to a card the rules do not let this user
// reach at the given level (FR-027).
//
// The judgement is made on the card the block belongs to, not on the block
// itself: writing a comment or a description writes into the card's content, so
// it answers to the card's permission rather than the board's. The level is what
// separates the two — a comment needs commenting, everything else needs editing.
//
// batch carries the blocks arriving in the same request. A card and its content
// are inserted together, so the content's parent is not in the store yet, and
// looking only there would classify it as living outside any card and skip the
// check entirely.
func (a *App) requireCardPermission(
	userID string,
	block *model.Block,
	board *model.Board,
	minimum model.EffectiveBoardPermission,
	batch map[string]*model.Block,
) error {
	if block == nil || board == nil {
		return nil
	}

	evaluator, err := a.newPropertyAccessEvaluator(userID, board)
	if err != nil {
		return err
	}
	if !evaluator.Enforces() {
		return nil
	}

	card, err := a.cardForBlock(block, batch)
	if err != nil {
		// The card could not be read, so it cannot be judged. Refusing is the
		// only safe answer: otherwise a lookup failure becomes a way to write
		// into a card the rules protect.
		return model.NewErrPermission("access denied to card")
	}
	if card == nil {
		// The block hangs off the board rather than a card — a view, or the
		// board description. No rule applies to it.
		return nil
	}

	if model.EffectivePermissionRank(evaluator.For(card)) < model.EffectivePermissionRank(minimum) {
		return model.NewErrPermission("access denied to card")
	}

	return nil
}

// requireConditionWrite refuses to move a card into a state the rules would
// never have let this user create it in.
//
// before is the card as stored, or nil when it is being created. The check only
// fires when the change actually moves the card between rule conditions: judging
// the resulting state alone would refuse a 팀장 renaming their own 전략 card,
// since the value already on it is one they could not have set.
//
// It is deliberately blind to authorship. The creator floor lets an author work
// on their own card, but an author who could satisfy this check by authorship
// would be able to walk that card into any state by creating it blank first —
// which is the escalation the check exists to stop (scenario 5).
func (a *App) requireConditionWrite(userID string, before, after *model.Block, board *model.Board) error {
	if after == nil || board == nil || after.Type != model.TypeCard {
		return nil
	}

	evaluator, err := a.newPropertyAccessEvaluator(userID, board)
	if err != nil {
		return err
	}
	if !evaluator.Enforces() {
		return nil
	}

	if evaluator.SameConditions(before, after) {
		return nil
	}

	// A card no rule condition mentions is governed by no rule, so moving one
	// there — clearing a value, or creating the blank card every new row starts
	// as — stays open.
	if !evaluator.MatchesAnyCondition(after) {
		return nil
	}

	if model.EffectivePermissionRank(evaluator.ForConditionWrite(after)) <
		model.EffectivePermissionRank(model.EffectiveBoardPermissionEdit) {
		return model.NewErrPermission("access denied: no permission to give a card these property values")
	}

	return nil
}

// requireInsertPermission judges a batch of blocks before any of it is written.
//
// Insertion used to ask nothing at all, which left two holes: a comment on a
// card the rules hide went straight through, and a card could be created
// carrying any property value — after which its own author often could not edit
// or delete it. Both are closed here rather than at each call site, because the
// three callers (the blocks endpoint, CreateCard and CreateSubCard) would
// otherwise have to agree with each other.
//
// The whole batch is judged before anything is stored, so a refusal leaves no
// half written card behind.
func (a *App) requireInsertPermission(blocks []*model.Block, userID string, board *model.Board) error {
	if board == nil || len(blocks) == 0 {
		return nil
	}

	// Asked once for the whole batch. Resolving authorship below costs a store
	// read per block, and a board with no rules — which is nearly every board —
	// must not pay for a judgement that would grant everything anyway.
	evaluator, err := a.newPropertyAccessEvaluator(userID, board)
	if err != nil {
		return err
	}
	if !evaluator.Enforces() {
		return nil
	}

	judged := make([]*model.Block, 0, len(blocks))
	batch := make(map[string]*model.Block, len(blocks))
	for _, block := range blocks {
		if block == nil {
			continue
		}
		authored := a.asAuthorStored(block, userID)
		judged = append(judged, authored)
		batch[authored.ID] = authored
	}

	for _, block := range judged {
		if block.Type == model.TypeCard {
			// A new card answers for the values it arrives carrying (FR-032 as
			// revised). Its own content and comments are judged below like any
			// other block.
			if err := a.requireConditionWrite(userID, nil, block, board); err != nil {
				return err
			}
			continue
		}

		minimum := model.EffectiveBoardPermissionEdit
		if block.Type == model.TypeComment {
			minimum = model.EffectiveBoardPermissionCommenter
		}

		if err := a.requireCardPermission(userID, block, board, minimum, batch); err != nil {
			return err
		}
	}

	return nil
}

// asAuthorStored returns the block with the author the store will hold, which is
// the only field of it this judgement may not take from the request.
//
// 본인 holds for the card's author (009 FR-005), and a card being created is
// authored by whoever is creating it — but not yet at this point. created_by is
// stamped inside the insert, which happens after the check, and the screen sends
// the field empty. So the relation written to cover a 팀원's own work read as
// false on every card they made, and 생성 came back refused.
//
// The claim on the request is never the answer. A block the store does not hold
// is about to be inserted and will belong to the requester whatever it says it
// is; one the store does hold keeps the author already recorded, so re-posting a
// card is not a way to take it over.
func (a *App) asAuthorStored(block *model.Block, userID string) *model.Block {
	author := userID
	if stored, err := a.store.GetBlock(block.ID); err == nil && stored != nil {
		author = stored.CreatedBy
	}

	if block.CreatedBy == author {
		return block
	}

	authored := *block
	authored.CreatedBy = author
	return &authored
}

// requireDuplicatePermission judges a copy request against both halves of the
// rules.
//
// Duplicating used to ask the board and nothing else, which made it two things
// at once: a way to read a card the rules hide, since the copy lands in the
// requester's own view carrying the original's content, and a way around the
// creation restriction, since the copy arrives already wearing a value the
// requester could not have set.
func (a *App) requireDuplicatePermission(userID, blockID string, board *model.Board) error {
	evaluator, err := a.newPropertyAccessEvaluator(userID, board)
	if err != nil {
		return err
	}
	if !evaluator.Enforces() {
		return nil
	}

	source, err := a.store.GetBlock(blockID)
	if model.IsErrNotFound(err) {
		return nil
	}
	if err != nil {
		return model.NewErrPermission("access denied to card")
	}

	card, err := a.cardForBlock(source, nil)
	if err != nil {
		return model.NewErrPermission("access denied to card")
	}
	if card == nil {
		return nil
	}

	if evaluator.For(card) == model.EffectiveBoardPermissionNone {
		return model.NewErrPermission("access denied to card")
	}

	// The copy is a new card, so it answers the creation question as well. before
	// is nil: nothing existed to compare against.
	return a.requireConditionWrite(userID, nil, card, board)
}

// projectPatch returns what the block will look like once the patch is applied,
// without touching the block itself.
//
// BlockPatch.Patch writes into the block it is given and hands the same pointer
// back, so judging the result means judging a copy. Fields is copied one level
// deep, which is enough: a patch replaces or deletes whole top level keys and
// never reaches into the nested property map.
func projectPatch(block *model.Block, patch *model.BlockPatch) *model.Block {
	if block == nil || patch == nil {
		return block
	}

	projected := *block
	projected.Fields = make(map[string]interface{}, len(block.Fields))
	for key, value := range block.Fields {
		projected.Fields[key] = value
	}

	return patch.Patch(&projected)
}

// deletedBlockMessage is the block a deletion is announced with.
//
// BroadcastBlockDelete builds this message from an ID alone, which leaves the
// websocket filter nothing to judge: a deletion of a card the rules hide would
// reach everyone. Announcing the block that was actually deleted gives the
// filter the property values it needs. The wire format is unchanged — a delete
// has always been sent as a block change carrying deleteAt.
func deletedBlockMessage(block *model.Block) *model.Block {
	deleted := *block
	deleted.UpdateAt = utils.GetMillis()
	deleted.DeleteAt = deleted.UpdateAt
	return &deleted
}

// cardForBlock walks up from a block to the card that owns it, returning nil
// when the block is not under a card at all.
//
// batch may hold blocks that are being written in the same request and are
// therefore not in the store yet. It is consulted first; a nil batch reduces
// this to a plain store walk.
func (a *App) cardForBlock(block *model.Block, batch map[string]*model.Block) (*model.Block, error) {
	iter := block
	for depth := 0; depth < maxSearchDepth; depth++ {
		if iter.Type == model.TypeCard {
			return iter, nil
		}
		if iter.ParentID == "" || iter.ParentID == iter.BoardID {
			return nil, nil
		}

		if parent, ok := batch[iter.ParentID]; ok && parent != nil {
			iter = parent
			continue
		}

		parent, err := a.store.GetBlock(iter.ParentID)
		if model.IsErrNotFound(err) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		if parent == nil {
			return nil, nil
		}
		iter = parent
	}

	return nil, nil
}

// deniedCardIDs judges every card the batch touches.
//
// A request narrowed by parent — the card detail view asks for one card's
// children — carries the children without the card itself, so the cards missing
// from the batch are fetched before judging. Skipping them would hand back the
// content of a card the rule hides.
func (a *App) deniedCardIDs(evaluator *PropertyAccessEvaluator, blocks []*model.Block) map[string]bool {
	cards := map[string]*model.Block{}
	for _, block := range blocks {
		if block != nil && block.Type == model.TypeCard {
			cards[block.ID] = block
		}
	}

	var missing []string
	for _, block := range blocks {
		if block == nil || block.Type == model.TypeCard {
			continue
		}
		if block.ParentID == "" || block.ParentID == block.BoardID {
			continue
		}
		if _, ok := cards[block.ParentID]; !ok {
			missing = append(missing, block.ParentID)
		}
	}

	denied := map[string]bool{}

	if parents := dedupeStrings(missing); len(parents) > 0 {
		fetched, err := a.store.GetBlocksByIDs(parents)
		if err != nil {
			a.logger.Warn("cannot load parent cards for access filtering", mlog.Err(err))
		}

		resolved := map[string]bool{}
		for _, parent := range fetched {
			if parent == nil {
				continue
			}
			resolved[parent.ID] = true
			if parent.Type == model.TypeCard {
				cards[parent.ID] = parent
			}
		}

		// A parent that could not be read cannot be judged, and a filter that
		// cannot judge has to deny — otherwise a lookup failure becomes a way
		// to see hidden content.
		for _, id := range parents {
			if !resolved[id] {
				denied[id] = true
			}
		}
	}

	for id, card := range cards {
		if evaluator.For(card) == model.EffectiveBoardPermissionNone {
			denied[id] = true
		}
	}

	return denied
}

func (a *App) DuplicateBlock(boardID string, blockID string, userID string, asTemplate bool) ([]*model.Block, error) {
	board, err := a.GetBoard(boardID)
	if err != nil {
		return nil, err
	}
	if board == nil {
		return nil, fmt.Errorf("cannot fetch board %s for DuplicateBlock: %w", boardID, err)
	}

	if permErr := a.requireDuplicatePermission(userID, blockID, board); permErr != nil {
		return nil, permErr
	}

	blocks, err := a.store.DuplicateBlock(boardID, blockID, userID, asTemplate)
	if err != nil {
		return nil, err
	}

	_, err = a.CopyAndUpdateCardFiles(boardID, userID, blocks, asTemplate)
	if err != nil {
		return nil, err
	}

	a.blockChangeNotifier.Enqueue(func() error {
		for _, block := range blocks {
			a.wsAdapter.BroadcastBlockChange(board.TeamID, block)
			a.webhook.NotifyUpdate(block)
			// 템플릿에서 카드 생성 시에도 구독 알림이 전송되도록 notifyBlockChanged 호출
			a.notifyBlockChanged(notify.Add, block, nil, userID)
		}
		return nil
	})

	return blocks, err
}

func (a *App) PatchBlock(blockID string, blockPatch *model.BlockPatch, modifiedByID string) (*model.Block, error) {
	return a.PatchBlockAndNotify(blockID, blockPatch, modifiedByID, false)
}

func (a *App) PatchBlockAndNotify(blockID string, blockPatch *model.BlockPatch, modifiedByID string, disableNotify bool) (*model.Block, error) {
	if err := model.ValidateBlockPatch(blockPatch); err != nil {
		return nil, err
	}

	oldBlock, err := a.store.GetBlock(blockID)
	if err != nil {
		return nil, err
	}

	board, err := a.store.GetBoard(oldBlock.BoardID)
	if err != nil {
		return nil, err
	}

	if permErr := a.requireCardEditPermission(modifiedByID, oldBlock, board); permErr != nil {
		return nil, permErr
	}

	// Judged on the value being written, not the one already stored: otherwise
	// a card could be created blank and then walked into any state.
	if permErr := a.requireConditionWrite(modifiedByID, oldBlock, projectPatch(oldBlock, blockPatch), board); permErr != nil {
		return nil, permErr
	}

	err = a.store.PatchBlock(blockID, blockPatch, modifiedByID)
	if err != nil {
		return nil, err
	}

	a.metrics.IncrementBlocksPatched(1)
	block, err := a.store.GetBlock(blockID)
	if err != nil {
		return nil, err
	}
	a.blockChangeNotifier.Enqueue(func() error {
		// broadcast on websocket
		a.wsAdapter.BroadcastBlockChange(board.TeamID, block)

		// broadcast on webhooks
		a.webhook.NotifyUpdate(block)

		// send notifications
		if !disableNotify {
			a.notifyBlockChanged(notify.Update, block, oldBlock, modifiedByID)
		}
		return nil
	})
	return block, nil
}

func (a *App) PatchBlocks(teamID string, blockPatches *model.BlockPatchBatch, modifiedByID string) error {
	for _, patch := range blockPatches.BlockPatches {
		err := model.ValidateBlockPatch(&patch)
		if err != nil {
			return err
		}
	}
	return a.PatchBlocksAndNotify(teamID, blockPatches, modifiedByID, false)
}

func (a *App) PatchBlocksAndNotify(teamID string, blockPatches *model.BlockPatchBatch, modifiedByID string, disableNotify bool) error {
	oldBlocks, err := a.store.GetBlocksByIDs(blockPatches.BlockIDs)
	if err != nil {
		return err
	}

	// A batch is refused whole. Applying the allowed half would leave the
	// client's undo stack describing a change that never happened.
	//
	// Boards are read once each: a batch is normally one board's worth of
	// blocks, and asking per block would multiply the query by the batch size.
	// GetBlocksByIDs does not promise the order the IDs were asked in, so the
	// patch that belongs to a block is looked up by ID rather than by position.
	patchByID := make(map[string]*model.BlockPatch, len(blockPatches.BlockIDs))
	for i, blockID := range blockPatches.BlockIDs {
		if i < len(blockPatches.BlockPatches) {
			patchByID[blockID] = &blockPatches.BlockPatches[i]
		}
	}

	boards := map[string]*model.Board{}
	for _, oldBlock := range oldBlocks {
		if oldBlock == nil || oldBlock.BoardID == "" {
			continue
		}

		board, seen := boards[oldBlock.BoardID]
		if !seen {
			loaded, boardErr := a.store.GetBoard(oldBlock.BoardID)
			if boardErr != nil {
				return boardErr
			}
			board = loaded
			boards[oldBlock.BoardID] = board
		}

		if permErr := a.requireCardEditPermission(modifiedByID, oldBlock, board); permErr != nil {
			return permErr
		}

		if permErr := a.requireConditionWrite(modifiedByID, oldBlock, projectPatch(oldBlock, patchByID[oldBlock.ID]), board); permErr != nil {
			return permErr
		}
	}

	if err := a.store.PatchBlocks(blockPatches, modifiedByID); err != nil {
		return err
	}

	a.blockChangeNotifier.Enqueue(func() error {
		a.metrics.IncrementBlocksPatched(len(oldBlocks))
		for i, blockID := range blockPatches.BlockIDs {
			newBlock, err := a.store.GetBlock(blockID)
			if err != nil {
				return err
			}
			a.wsAdapter.BroadcastBlockChange(teamID, newBlock)
			a.webhook.NotifyUpdate(newBlock)
			if !disableNotify {
				a.notifyBlockChanged(notify.Update, newBlock, oldBlocks[i], modifiedByID)
			}
		}
		return nil
	})
	return nil
}

func (a *App) InsertBlock(block *model.Block, modifiedByID string) error {
	return a.InsertBlockAndNotify(block, modifiedByID, false)
}

func (a *App) InsertBlockAndNotify(block *model.Block, modifiedByID string, disableNotify bool) error {
	board, bErr := a.store.GetBoard(block.BoardID)
	if bErr != nil {
		return bErr
	}

	err := a.store.InsertBlock(block, modifiedByID)
	if err == nil {
		if block.Type == model.TypeComment || block.Type == model.TypeText {
			if markErr := a.store.MarkBoardMentionReplied(modifiedByID, block.ParentID); markErr != nil {
				a.logger.Warn("failed to mark board mention as replied",
					mlog.String("user_id", modifiedByID),
					mlog.String("card_id", block.ParentID),
					mlog.Err(markErr),
				)
			}
		}

		a.blockChangeNotifier.Enqueue(func() error {
			a.wsAdapter.BroadcastBlockChange(board.TeamID, block)
			a.metrics.IncrementBlocksInserted(1)
			a.webhook.NotifyUpdate(block)
			if !disableNotify {
				a.notifyBlockChanged(notify.Add, block, nil, modifiedByID)
			}
			return nil
		})
	}

	return err
}

func (a *App) InsertBlocks(blocks []*model.Block, modifiedByID string) ([]*model.Block, error) {
	return a.InsertBlocksAndNotify(blocks, modifiedByID, false)
}

func (a *App) InsertBlocksAndNotify(blocks []*model.Block, modifiedByID string, disableNotify bool) ([]*model.Block, error) {
	if len(blocks) == 0 {
		return []*model.Block{}, nil
	}

	// all blocks must belong to the same board
	boardID := blocks[0].BoardID
	for _, block := range blocks {
		if block.BoardID != boardID {
			return nil, ErrBlocksFromMultipleBoards
		}
	}

	board, err := a.store.GetBoard(boardID)
	if err != nil {
		return nil, err
	}

	if permErr := a.requireInsertPermission(blocks, modifiedByID, board); permErr != nil {
		return nil, permErr
	}

	needsNotify := make([]*model.Block, 0, len(blocks))
	for i := range blocks {
		block := blocks[i]

		existingBlock, checkErr := a.store.GetBlock(block.ID)
		if checkErr != nil && !model.IsErrNotFound(checkErr) {
			return nil, checkErr
		}

		if existingBlock == nil && (block.Type == "image" || block.Type == "attachment") {
			fileIDsToRestore := extractFileIDsFromBlock(block)
			if len(fileIDsToRestore) > 0 {
				// Only restore files that were previously associated with this board
				// to prevent unauthorized restoration of files from other boards
				authorizedFileIDs, authErr := a.filterAuthorizedFilesForBoard(block.BoardID, fileIDsToRestore)
				if authErr != nil {
					a.logger.Error(
						"Failed to validate file authorization for block",
						mlog.String("block_id", block.ID),
						mlog.String("board_id", block.BoardID),
						mlog.Err(authErr),
					)
					authorizedFileIDs = []string{}
				}

				if len(authorizedFileIDs) > 0 {
					if restoreErr := a.store.RestoreFiles(authorizedFileIDs); restoreErr != nil {
						a.logger.Error(
							"Failed to restore files for block",
							mlog.String("block_id", block.ID),
							mlog.String("block_type", string(block.Type)),
							mlog.Err(restoreErr),
						)
					}
				} else if len(fileIDsToRestore) > 0 {
					a.logger.Warn(
						"File restoration blocked: files do not belong to this board",
						mlog.String("block_id", block.ID),
						mlog.String("board_id", block.BoardID),
						mlog.Int("file_count", len(fileIDsToRestore)),
					)
				}
			}
		}

		err := a.store.InsertBlock(block, modifiedByID)
		if err != nil {
			return nil, err
		}

		if block.Type == model.TypeComment || block.Type == model.TypeText {
			if markErr := a.store.MarkBoardMentionReplied(modifiedByID, block.ParentID); markErr != nil {
				a.logger.Warn("failed to mark board mention as replied",
					mlog.String("user_id", modifiedByID),
					mlog.String("card_id", block.ParentID),
					mlog.Err(markErr),
				)
			}
		}

		needsNotify = append(needsNotify, block)

		a.wsAdapter.BroadcastBlockChange(board.TeamID, block)
		a.metrics.IncrementBlocksInserted(1)
	}

	a.blockChangeNotifier.Enqueue(func() error {
		for _, b := range needsNotify {
			block := b
			a.webhook.NotifyUpdate(block)
			if !disableNotify {
				a.notifyBlockChanged(notify.Add, block, nil, modifiedByID)
			}
		}
		return nil
	})

	return blocks, nil
}

func (a *App) GetBlockByID(blockID string) (*model.Block, error) {
	return a.store.GetBlock(blockID)
}

func (a *App) DeleteBlock(blockID string, modifiedBy string) error {
	return a.DeleteBlockAndNotify(blockID, modifiedBy, false)
}

func (a *App) DeleteBlockAndNotify(blockID string, modifiedBy string, disableNotify bool) error {
	block, err := a.store.GetBlock(blockID)
	if err != nil {
		return err
	}

	board, err := a.store.GetBoard(block.BoardID)
	if err != nil {
		return err
	}

	if block == nil {
		// deleting non-existing block not considered an error
		return nil
	}

	if permErr := a.requireCardEditPermission(modifiedBy, block, board); permErr != nil {
		return permErr
	}

	// Sub-cards are deleted along with their parent. Left behind, they keep a
	// parentCardId pointing at a card that no longer exists, and the table view
	// drops them entirely: they are neither top-level rows nor children of any
	// rendered row.
	if block.Type == model.TypeCard {
		if err = a.deleteSubCards(blockID, modifiedBy); err != nil {
			return err
		}
	}

	err = a.store.DeleteBlock(blockID, modifiedBy)
	if err != nil {
		return err
	}

	// If this is a card, also delete its BlockSuite document
	if block.Type == model.TypeCard {
		// Ignore error if BlockSuite doc doesn't exist (not all cards have one)
		_ = a.store.DeleteBlockSuiteDocByCardID(blockID)
	}

	a.blockChangeNotifier.Enqueue(func() error {
		a.wsAdapter.BroadcastBlockChange(board.TeamID, deletedBlockMessage(block))
		a.metrics.IncrementBlocksDeleted(1)
		if !disableNotify {
			a.notifyBlockChanged(notify.Delete, block, block, modifiedBy)
		}
		return nil
	})

	return nil
}

// deleteSubCards deletes every descendant card of cardID, deepest first, so the
// tree never passes through a state where a surviving card points at a deleted
// parent. Cycles cannot occur: LinkCardAsSubCard rejects them up front.
func (a *App) deleteSubCards(cardID string, modifiedBy string) error {
	subCards, err := a.GetSubCards(cardID, 0, -1)
	if err != nil {
		return err
	}

	for _, subCard := range subCards {
		// disableNotify: one user-facing delete should not fan out into a
		// notification per descendant. The websocket change is still broadcast.
		if err := a.DeleteBlockAndNotify(subCard.ID, modifiedBy, true); err != nil {
			return fmt.Errorf("failed to delete sub-card %s: %w", subCard.ID, err)
		}
	}

	return nil
}

func (a *App) GetLastBlockHistoryEntry(blockID string) (*model.Block, error) {
	blocks, err := a.store.GetBlockHistory(blockID, model.QueryBlockHistoryOptions{Limit: 1, Descending: true})
	if err != nil {
		return nil, err
	}
	if len(blocks) == 0 {
		return nil, nil
	}
	return blocks[0], nil
}

func (a *App) UndeleteBlock(blockID string, modifiedBy string) (*model.Block, error) {
	blocks, err := a.store.GetBlockHistory(blockID, model.QueryBlockHistoryOptions{Limit: 1, Descending: true})
	if err != nil {
		return nil, err
	}

	if len(blocks) == 0 {
		// undeleting non-existing block not considered an error
		return nil, nil
	}

	err = a.store.UndeleteBlock(blockID, modifiedBy)
	if err != nil {
		return nil, err
	}

	block, err := a.store.GetBlock(blockID)
	if model.IsErrNotFound(err) {
		a.logger.Error("Error loading the block after a successful undelete, not propagating through websockets or notifications", mlog.String("blockID", blockID))
		return nil, err
	}
	if err != nil {
		return nil, err
	}

	board, err := a.store.GetBoard(block.BoardID)
	if err != nil {
		return nil, err
	}

	a.blockChangeNotifier.Enqueue(func() error {
		a.wsAdapter.BroadcastBlockChange(board.TeamID, block)
		a.metrics.IncrementBlocksInserted(1)
		a.webhook.NotifyUpdate(block)
		a.notifyBlockChanged(notify.Add, block, nil, modifiedBy)

		return nil
	})

	return block, nil
}

func (a *App) GetBlockCountsByType() (map[string]int64, error) {
	return a.store.GetBlockCountsByType()
}

func (a *App) GetBlocksForBoard(boardID string) ([]*model.Block, error) {
	return a.store.GetBlocksForBoard(boardID)
}

func (a *App) notifyBlockChanged(action notify.Action, block *model.Block, oldBlock *model.Block, modifiedByID string) {
	// don't notify if notifications service disabled, or block change is generated via system user.
	if a.notifications == nil || modifiedByID == model.SystemUserID {
		return
	}

	// find card and board for the changed block.
	board, card, err := a.getBoardAndCard(block)
	if err != nil {
		a.logger.Error("Error notifying for block change; cannot determine board or card", mlog.Err(err))
		return
	}

	boardMember, _ := a.GetMemberForBoard(board.ID, modifiedByID)
	if boardMember == nil {
		// create temporary guest board member
		boardMember = &model.BoardMember{
			BoardID: board.ID,
			UserID:  modifiedByID,
		}
	}

	evt := notify.BlockChangeEvent{
		Action:       action,
		TeamID:       board.TeamID,
		Board:        board,
		Card:         card,
		BlockChanged: block,
		BlockOld:     oldBlock,
		ModifiedBy:   boardMember,
	}
	a.notifications.BlockChanged(evt)
}

const (
	maxSearchDepth = 50
)

// getBoardAndCard returns the first parent of type `card` its board for the specified block.
// `board` and/or `card` may return nil without error if the block does not belong to a board or card.
func (a *App) getBoardAndCard(block *model.Block) (board *model.Board, card *model.Block, err error) {
	board, err = a.store.GetBoard(block.BoardID)
	if err != nil {
		return board, card, err
	}

	var count int // don't let invalid blocks hierarchy cause infinite loop.
	iter := block
	for {
		count++
		if card == nil && iter.Type == model.TypeCard {
			card = iter
		}

		if iter.ParentID == "" || (board != nil && card != nil) || count > maxSearchDepth {
			break
		}

		iter, err = a.store.GetBlock(iter.ParentID)
		if model.IsErrNotFound(err) {
			return board, card, nil
		}
		if err != nil {
			return board, card, err
		}
	}
	return board, card, nil
}

// extractFileIDsFromBlock extracts file IDs from image and attachment blocks.
func extractFileIDsFromBlock(block *model.Block) []string {
	fileIDsToRestore := make([]string, 0, 2)

	if fileIDVal, exists := block.Fields["fileId"]; exists {
		if fileIDStr, ok := fileIDVal.(string); ok && fileIDStr != "" {
			fileID := utils.RetrieveFileIDFromBlockFieldStorage(fileIDStr)
			if fileID != "" {
				fileIDsToRestore = append(fileIDsToRestore, fileID)
			}
		}
	}

	return fileIDsToRestore
}

// filterAuthorizedFilesForBoard filters the provided file IDs to only include files
// that were previously associated with blocks on the specified board. This prevents
// unauthorized restoration of files from other boards that the user doesn't have access to.
func (a *App) filterAuthorizedFilesForBoard(boardID string, fileIDs []string) ([]string, error) {
	if len(fileIDs) == 0 {
		return []string{}, nil
	}

	boardFileIDs := make(map[string]bool)

	historyBlocks, err := a.store.GetBlockHistoryDescendants(boardID, model.QueryBlockHistoryOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to query block history for board %s: %w", boardID, err)
	}

	for _, block := range historyBlocks {
		if block.Type != model.TypeImage && block.Type != model.TypeAttachment {
			continue
		}

		if fileID, ok := block.Fields[model.BlockFieldFileId].(string); ok && fileID != "" {
			cleanFileID := utils.RetrieveFileIDFromBlockFieldStorage(fileID)
			if cleanFileID != "" {
				boardFileIDs[cleanFileID] = true
			}
		}
	}

	authorizedFileIDs := make([]string, 0, len(fileIDs))
	for _, fileID := range fileIDs {
		if boardFileIDs[fileID] {
			authorizedFileIDs = append(authorizedFileIDs, fileID)
		}
	}

	return authorizedFileIDs, nil
}
