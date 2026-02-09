// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package notifysubscriptions

import (
	"fmt"
	"sort"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// Diff represents a difference between two versions of a block.
type Diff struct {
	Board   *model.Board
	Card    *model.Block
	Authors StringMap

	BlockType model.BlockType
	OldBlock  *model.Block
	NewBlock  *model.Block

	UpdateAt int64 // the UpdateAt of the latest version of the block

	schemaDiffs []SchemaDiff
	PropDiffs   []PropDiff

	Diffs []*Diff // Diffs for child blocks
}

type PropDiff struct {
	ID       string // property id
	Index    int
	Name     string
	OldValue string
	NewValue string
}

type SchemaDiff struct {
	Board *model.Board

	OldPropDef *model.PropDef
	NewPropDef *model.PropDef
}

type diffGenerator struct {
	board *model.Board
	card  *model.Block

	store        AppAPI
	hint         *model.NotificationHint
	lastNotifyAt int64
	logger       mlog.LoggerIFace
	nameFormat   string
}

func (dg *diffGenerator) generateDiffs() ([]*Diff, error) {
	// use block_history to fetch blocks in case they were deleted and no longer exist in blocks table.
	opts := model.QueryBlockHistoryOptions{
		Limit:      1,
		Descending: true,
	}
	blocks, err := dg.store.GetBlockHistory(dg.hint.BlockID, opts)
	if err != nil {
		return nil, fmt.Errorf("could not get block for notification: %w", err)
	}
	if len(blocks) == 0 {
		return nil, fmt.Errorf("block not found for notification: %w", err)
	}
	block := blocks[0]

	if dg.board == nil || dg.card == nil {
		return nil, fmt.Errorf("cannot generate diff for block %s; must have a valid board and card: %w", dg.hint.BlockID, err)
	}

	// parse board's property schema here so it only happens once.
	schema, err := model.ParsePropertySchema(dg.board)
	if err != nil {
		return nil, fmt.Errorf("could not parse property schema for board %s: %w", dg.board.ID, err)
	}

	switch block.Type {
	case model.TypeBoard:
		dg.logger.Warn("generateDiffs for board skipped", mlog.String("block_id", block.ID))
		// TODO: Fix this
		// return dg.generateDiffsForBoard(block, schema)
		return nil, nil
	case model.TypeCard:
		diff, err := dg.generateDiffsForCard(block, schema)
		if err != nil || diff == nil {
			return nil, err
		}
		return []*Diff{diff}, nil
	default:
		diff, err := dg.generateDiffForBlock(block, schema)
		if err != nil || diff == nil {
			return nil, err
		}
		return []*Diff{diff}, nil
	}
}

// TODO: fix this
/*
func (dg *diffGenerator) generateDiffsForBoard(board *model.Board, schema model.PropSchema) ([]*Diff, error) {
	opts := model.QuerySubtreeOptions{
		AfterUpdateAt: dg.lastNotifyAt,
	}

	find all child blocks of the board that updated since last notify.
	blocks, err := dg.store.GetSubTree2(board.ID, board.ID, opts)
	if err != nil {
		return nil, fmt.Errorf("could not get subtree for board %s: %w", board.ID, err)
	}

	var diffs []*Diff

	generate diff for board title change or description
	boardDiff, err := dg.generateDiffForBlock(board, schema)
	if err != nil {
		return nil, fmt.Errorf("could not generate diff for board %s: %w", board.ID, err)
	}

	if boardDiff != nil {
		TODO: phase 2 feature (generate schema diffs and add to board diff) goes here.
		diffs = append(diffs, boardDiff)
	}

	for _, b := range blocks {
		block := b
		if block.Type == model.TypeCard {
			cardDiffs, err := dg.generateDiffsForCard(&block, schema)
			if err != nil {
				return nil, err
			}
			diffs = append(diffs, cardDiffs)
		}
	}
	return diffs, nil
}
*/

func (dg *diffGenerator) generateDiffsForCard(card *model.Block, schema model.PropSchema) (*Diff, error) {
	// generate diff for card title change and properties.
	cardDiff, err := dg.generateDiffForBlock(card, schema)
	if err != nil {
		return nil, fmt.Errorf("could not generate diff for card %s: %w", card.ID, err)
	}

	// Check for BlockSuite content changes by comparing blocksuite_updated_at
	blocksuiteChanged := dg.hasBlockSuiteContentChanged(card)

	// fetch all card content blocks that were updated after last notify
	opts := model.QueryBlockHistoryChildOptions{
		AfterUpdateAt: dg.lastNotifyAt,
	}
	blocks, _, err := dg.store.GetBlockHistoryNewestChildren(card.ID, opts)
	if err != nil {
		return nil, fmt.Errorf("could not get subtree for card %s: %w", card.ID, err)
	}

	authors := make(StringMap)

	// walk child blocks
	var childDiffs []*Diff
	for i := range blocks {
		if blocks[i].ID == card.ID {
			continue
		}

		blockDiff, err := dg.generateDiffForBlock(blocks[i], schema)
		if err != nil {
			return nil, fmt.Errorf("could not generate diff for block %s: %w", blocks[i].ID, err)
		}
		if blockDiff != nil {
			childDiffs = append(childDiffs, blockDiff)
			authors.Append(blockDiff.Authors)
		}
	}

	dg.logger.Debug("generateDiffsForCard",
		mlog.Bool("has_top_changes", cardDiff != nil),
		mlog.Bool("blocksuite_changed", blocksuiteChanged),
		mlog.Int("subtree", len(blocks)),
		mlog.Array("author_names", authors.Values()),
		mlog.Int("child_diffs", len(childDiffs)),
	)

	// If BlockSuite content changed, ensure we have a cardDiff to report it
	if blocksuiteChanged {
		if cardDiff == nil {
			cardDiff = &Diff{
				Board:       dg.board,
				Card:        card,
				Authors:     make(StringMap),
				BlockType:   card.Type,
				OldBlock:    card,
				NewBlock:    card,
				UpdateAt:    card.UpdateAt,
				PropDiffs:   nil,
				schemaDiffs: nil,
			}
		}

		contentSummary := dg.getBlockSuiteContentSummary(card.ID)

		// Add a special PropDiff to indicate content was updated
		cardDiff.PropDiffs = append(cardDiff.PropDiffs, PropDiff{
			ID:       "blocksuite_content",
			Index:    9999, // High index to appear last
			Name:     "내용", // "Content" in Korean
			OldValue: "",
			NewValue: contentSummary,
		})

		// Add author from card's ModifiedBy
		// Use Username instead of displayName for proper @mention linking in Mattermost
		user, err := dg.store.GetUserByID(card.ModifiedBy)
		if err == nil && user != nil {
			cardDiff.Authors.Add(user.ID, user.Username)
		}
	}

	if len(childDiffs) != 0 {
		if cardDiff == nil { // will be nil if the card has no other changes besides child diffs
			cardDiff = &Diff{
				Board:       dg.board,
				Card:        card,
				Authors:     make(StringMap),
				BlockType:   card.Type,
				OldBlock:    card,
				NewBlock:    card,
				UpdateAt:    card.UpdateAt,
				PropDiffs:   nil,
				schemaDiffs: nil,
			}
		}
		cardDiff.Diffs = childDiffs
	}
	cardDiff.Authors.Append(authors)

	return cardDiff, nil
}

func (dg *diffGenerator) generateDiffForBlock(newBlock *model.Block, schema model.PropSchema) (*Diff, error) {
	dg.logger.Debug("generateDiffForBlock - new block",
		mlog.String("block_id", newBlock.ID),
		mlog.String("block_type", string(newBlock.Type)),
		mlog.String("modified_by", newBlock.ModifiedBy),
		mlog.Int("update_at", newBlock.UpdateAt),
	)

	// find the version of the block as it was at the time of last notify.
	opts := model.QueryBlockHistoryOptions{
		BeforeUpdateAt: dg.lastNotifyAt + 1,
		Limit:          1,
		Descending:     true,
	}
	history, err := dg.store.GetBlockHistory(newBlock.ID, opts)
	if err != nil {
		return nil, fmt.Errorf("could not get block history for block %s: %w", newBlock.ID, err)
	}

	var oldBlock *model.Block
	if len(history) != 0 {
		oldBlock = history[0]

		dg.logger.Debug("generateDiffForBlock - old block",
			mlog.String("block_id", oldBlock.ID),
			mlog.String("block_type", string(oldBlock.Type)),
			mlog.Int("before_update_at", dg.lastNotifyAt),
			mlog.String("modified_by", oldBlock.ModifiedBy),
			mlog.Int("update_at", oldBlock.UpdateAt),
		)
	}

	// find all the versions of the blocks that changed so we can gather all the author usernames.
	opts = model.QueryBlockHistoryOptions{
		AfterUpdateAt: dg.lastNotifyAt,
		Descending:    true,
	}
	chgBlocks, err := dg.store.GetBlockHistory(newBlock.ID, opts)
	if err != nil {
		return nil, fmt.Errorf("error getting block history for block %s: %w", newBlock.ID, err)
	}
	authors := make(StringMap)

	dg.logger.Debug("generateDiffForBlock - authors",
		mlog.Int("after_update_at", dg.lastNotifyAt),
		mlog.Int("history_count", len(chgBlocks)),
	)

	// have to loop through history slice because GetBlockHistory does not return pointers.
	for _, b := range chgBlocks {
		user, err := dg.store.GetUserByID(b.ModifiedBy)
		if err != nil || user == nil {
			dg.logger.Error("could not fetch username for block",
				mlog.String("modified_by", b.ModifiedBy),
				mlog.Err(err),
			)
			authors.Add(b.ModifiedBy, "unknown_user") // todo: localize this when server has i18n
		} else {
			// Use Username instead of displayName for proper @mention linking in Mattermost
			authors.Add(user.ID, user.Username)
		}
	}

	propDiffs := dg.generatePropDiffs(oldBlock, newBlock, schema)

	dg.logger.Debug("generateDiffForBlock - results",
		mlog.String("block_id", newBlock.ID),
		mlog.String("block_type", string(newBlock.Type)),
		mlog.Array("author_names", authors.Values()),
		mlog.Int("history_count", len(history)),
		mlog.Int("prop_diff_count", len(propDiffs)),
	)

	diff := &Diff{
		Board:       dg.board,
		Card:        dg.card,
		Authors:     authors,
		BlockType:   newBlock.Type,
		OldBlock:    oldBlock,
		NewBlock:    newBlock,
		UpdateAt:    newBlock.UpdateAt,
		PropDiffs:   propDiffs,
		schemaDiffs: nil,
	}
	return diff, nil
}

func (dg *diffGenerator) generatePropDiffs(oldBlock, newBlock *model.Block, schema model.PropSchema) []PropDiff {
	var propDiffs []PropDiff

	resolver := &displayNameResolver{
		base:       dg.store,
		nameFormat: dg.nameFormat,
	}
	oldProps, err := model.ParseProperties(oldBlock, schema, resolver)
	if err != nil {
		dg.logger.Error("Cannot parse properties for old block",
			mlog.String("block_id", oldBlock.ID),
			mlog.Err(err),
		)
	}

	newProps, err := model.ParseProperties(newBlock, schema, resolver)
	if err != nil {
		dg.logger.Error("Cannot parse properties for new block",
			mlog.String("block_id", oldBlock.ID),
			mlog.Err(err),
		)
	}

	// look for new or changed properties.
	for k, prop := range newProps {
		oldP, ok := oldProps[k]
		if ok {
			// prop changed
			if prop.Value != oldP.Value {
				propDiffs = append(propDiffs, PropDiff{
					ID:       prop.ID,
					Index:    prop.Index,
					Name:     prop.Name,
					NewValue: prop.Value,
					OldValue: oldP.Value,
				})
			}
		} else {
			// prop added
			propDiffs = append(propDiffs, PropDiff{
				ID:       prop.ID,
				Index:    prop.Index,
				Name:     prop.Name,
				NewValue: prop.Value,
				OldValue: "",
			})
		}
	}

	// look for deleted properties
	for k, prop := range oldProps {
		_, ok := newProps[k]
		if !ok {
			// prop deleted
			propDiffs = append(propDiffs, PropDiff{
				ID:       prop.ID,
				Index:    prop.Index,
				Name:     prop.Name,
				NewValue: "",
				OldValue: prop.Value,
			})
		}
	}
	return sortPropDiffs(propDiffs)
}

type displayNameResolver struct {
	base       AppAPI
	nameFormat string
}

func (r *displayNameResolver) GetUserByID(userID string) (*model.User, error) {
	user, err := r.base.GetUserByID(userID)
	if err != nil || user == nil {
		return user, err
	}
	user.Username = displayNameForUser(user, r.nameFormat)
	return user, nil
}

func sortPropDiffs(propDiffs []PropDiff) []PropDiff {
	if len(propDiffs) == 0 {
		return propDiffs
	}

	sort.Slice(propDiffs, func(i, j int) bool {
		return propDiffs[i].Index < propDiffs[j].Index
	})
	return propDiffs
}

// hasBlockSuiteContentChanged checks if the card's BlockSuite content was updated
// after the last notification by comparing blocksuite_updated_at field values.
func (dg *diffGenerator) hasBlockSuiteContentChanged(card *model.Block) bool {
	// Get the current blocksuite_updated_at from the new block
	newBlocksuiteUpdatedAt, hasNew := card.Fields["blocksuite_updated_at"]
	if !hasNew {
		return false
	}

	// Get the old version of the card to compare
	opts := model.QueryBlockHistoryOptions{
		BeforeUpdateAt: dg.lastNotifyAt + 1,
		Limit:          1,
		Descending:     true,
	}
	history, err := dg.store.GetBlockHistory(card.ID, opts)
	if err != nil || len(history) == 0 {
		// No history means this is a new card, check if blocksuite_updated_at exists
		return hasNew
	}

	oldBlock := history[0]
	oldBlocksuiteUpdatedAt, hasOld := oldBlock.Fields["blocksuite_updated_at"]

	// If old block didn't have blocksuite_updated_at but new one does, content was added
	if !hasOld && hasNew {
		return true
	}

	// Compare timestamps
	newTS, newOK := toInt64(newBlocksuiteUpdatedAt)
	oldTS, oldOK := toInt64(oldBlocksuiteUpdatedAt)

	if newOK && oldOK {
		return newTS > oldTS
	}

	return false
}

// toInt64 converts an interface{} to int64, handling both int64 and float64 types
// (JSON unmarshaling produces float64 for numbers)
func toInt64(v interface{}) (int64, bool) {
	switch val := v.(type) {
	case int64:
		return val, true
	case float64:
		return int64(val), true
	case int:
		return int64(val), true
	default:
		return 0, false
	}
}

const maxContentSummaryLength = 200

func (dg *diffGenerator) getBlockSuiteContentSummary(cardID string) string {
	doc, err := dg.store.GetBlockSuiteDocByCardID(cardID)
	if err != nil {
		dg.logger.Debug("Failed to get BlockSuite doc for content summary",
			mlog.String("card_id", cardID),
			mlog.Err(err),
		)
		return "수정됨"
	}

	if doc == nil {
		return "수정됨"
	}

	// Prefer LastDiffSummary if available, fallback to ContentText
	if doc.LastDiffSummary != "" {
		return truncateText(doc.LastDiffSummary, maxContentSummaryLength)
	}

	if doc.ContentText == "" {
		return "수정됨"
	}

	return truncateText(doc.ContentText, maxContentSummaryLength)
}

func truncateText(text string, maxLen int) string {
	runes := []rune(text)
	if len(runes) <= maxLen {
		return text
	}
	return string(runes[:maxLen]) + "..."
}
