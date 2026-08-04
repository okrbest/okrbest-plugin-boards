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
//
// The judgement is made on the card the block belongs to, not on the block
// itself: editing a comment or a description writes into the card's content, so
// it answers to the card's permission rather than the board's.
//
// Creation is deliberately not covered. A new card is allowed by the board
// permission alone (FR-032) — the rules govern what happens to a card once it
// carries the property value, not who may add one.
func (a *App) requireCardEditPermission(userID string, block *model.Block, board *model.Board) error {
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

	card, err := a.cardForBlock(block)
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

	if model.EffectivePermissionRank(evaluator.For(card)) < model.EffectivePermissionRank(model.EffectiveBoardPermissionEdit) {
		return model.NewErrPermission("access denied to card")
	}

	return nil
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
func (a *App) cardForBlock(block *model.Block) (*model.Block, error) {
	iter := block
	for depth := 0; depth < maxSearchDepth; depth++ {
		if iter.Type == model.TypeCard {
			return iter, nil
		}
		if iter.ParentID == "" || iter.ParentID == iter.BoardID {
			return nil, nil
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
