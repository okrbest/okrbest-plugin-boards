// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"strings"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// GetBlockSuiteDocByCardID retrieves a BlockSuite document by card_id.
func (a *App) GetBlockSuiteDocByCardID(cardID string) (*model.BlockSuiteDoc, error) {
	return a.store.GetBlockSuiteDocByCardID(cardID)
}

// GetBlockSuiteDocInfoByCardID retrieves metadata (without snapshot) by card_id.
func (a *App) GetBlockSuiteDocInfoByCardID(cardID string) (*model.BlockSuiteDocInfo, error) {
	return a.store.GetBlockSuiteDocInfoByCardID(cardID)
}

func (a *App) UpsertBlockSuiteDoc(doc *model.BlockSuiteDoc) error {
	if err := a.store.UpsertBlockSuiteDoc(doc); err != nil {
		return err
	}

	a.broadcastBlockSuiteDocChange(doc.CardID, doc.UpdatedBy)
	return nil
}

func (a *App) broadcastBlockSuiteDocChange(cardID, userID string) {
	card, err := a.store.GetBlock(cardID)
	if err != nil || card == nil {
		return
	}

	board, err := a.store.GetBoard(card.BoardID)
	if err != nil || board == nil {
		return
	}

	now := utils.GetMillis()
	patch := &model.BlockPatch{
		UpdatedFields: map[string]interface{}{
			"blocksuite_updated_at": now,
		},
	}
	updatedCard, err := a.PatchBlock(cardID, patch, userID)
	if err != nil {
		a.logger.Warn("Failed to update card timestamp for BlockSuite change",
			mlog.String("cardID", cardID),
			mlog.Err(err))
		a.wsAdapter.BroadcastBlockChange(board.TeamID, card)
		return
	}

	a.wsAdapter.BroadcastBlockChange(board.TeamID, updatedCard)
}

// DeleteBlockSuiteDocByCardID deletes a BlockSuite document by card_id.
func (a *App) DeleteBlockSuiteDocByCardID(cardID string) error {
	return a.store.DeleteBlockSuiteDocByCardID(cardID)
}

func (a *App) CopyBlockSuiteDocs(cardIDMapping map[string]string, fileIDMapping map[string]string) error {
	for oldCardID, newCardID := range cardIDMapping {
		doc, err := a.store.GetBlockSuiteDocByCardID(oldCardID)
		if err != nil {
			continue
		}
		if doc == nil {
			continue
		}

		newCard, err := a.store.GetBlock(newCardID)
		if err != nil || newCard == nil {
			a.logger.Warn("Failed to get new card for BlockSuite doc copy",
				mlog.String("newCardID", newCardID),
				mlog.Err(err))
			continue
		}

		snapshot := doc.Snapshot
		if len(fileIDMapping) > 0 {
			snapshot = updateSnapshotFileIDs(snapshot, fileIDMapping)
		}

		newDoc := &model.BlockSuiteDoc{
			DocID:    newCardID,
			CardID:   newCardID,
			BoardID:  newCard.BoardID,
			Snapshot: snapshot,
		}
		if err := a.store.UpsertBlockSuiteDoc(newDoc); err != nil {
			a.logger.Warn("Failed to copy BlockSuite doc",
				mlog.String("oldCardID", oldCardID),
				mlog.String("newCardID", newCardID),
				mlog.Err(err))
		}
	}
	return nil
}

func updateSnapshotFileIDs(snapshot []byte, fileIDMapping map[string]string) []byte {
	result := string(snapshot)
	for oldFileID, newFileID := range fileIDMapping {
		result = strings.ReplaceAll(result, oldFileID, newFileID)
	}
	return []byte(result)
}
