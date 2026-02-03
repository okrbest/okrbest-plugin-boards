// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"fmt"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"
)

func (a *App) CreateCard(card *model.Card, boardID string, userID string, disableNotify bool) (*model.Card, error) {
	// Convert the card struct to a block and insert the block.
	now := utils.GetMillis()

	card.ID = utils.NewID(utils.IDTypeCard)
	card.BoardID = boardID
	card.CreatedBy = userID
	card.ModifiedBy = userID
	card.CreateAt = now
	card.UpdateAt = now
	card.DeleteAt = 0

	block := model.Card2Block(card)

	newBlocks, err := a.InsertBlocksAndNotify([]*model.Block{block}, userID, disableNotify)
	if err != nil {
		return nil, fmt.Errorf("cannot create card: %w", err)
	}

	newCard, err := model.Block2Card(newBlocks[0])
	if err != nil {
		return nil, err
	}

	return newCard, nil
}

func (a *App) GetCardsForBoard(boardID string, page int, perPage int) ([]*model.Card, error) {
	opts := model.QueryBlocksOptions{
		BoardID:   boardID,
		ParentID:  boardID,
		BlockType: model.TypeCard,
		Page:      page,
		PerPage:   perPage,
	}

	blocks, err := a.store.GetBlocks(opts)
	if err != nil {
		return nil, err
	}

	cards := make([]*model.Card, 0, len(blocks))
	for _, blk := range blocks {
		b := blk
		if card, err := model.Block2Card(b); err != nil {
			return nil, fmt.Errorf("Block2Card fail: %w", err)
		} else {
			cards = append(cards, card)
		}
	}
	return cards, nil
}

func (a *App) PatchCard(cardPatch *model.CardPatch, cardID string, userID string, disableNotify bool) (*model.Card, error) {
	blockPatch, err := model.CardPatch2BlockPatch(cardPatch)
	if err != nil {
		return nil, err
	}

	newBlock, err := a.PatchBlockAndNotify(cardID, blockPatch, userID, disableNotify)
	if err != nil {
		return nil, fmt.Errorf("cannot patch card %s: %w", cardID, err)
	}

	newCard, err := model.Block2Card(newBlock)
	if err != nil {
		return nil, err
	}

	return newCard, nil
}

func (a *App) GetCardByID(cardID string) (*model.Card, error) {
	cardBlock, err := a.GetBlockByID(cardID)
	if err != nil {
		return nil, err
	}

	card, err := model.Block2Card(cardBlock)
	if err != nil {
		return nil, err
	}

	return card, nil
}

func (a *App) CreateSubCard(card *model.Card, parentCardID string, boardID string, userID string, disableNotify bool) (*model.Card, error) {
	parentCard, err := a.GetCardByID(parentCardID)
	if err != nil {
		return nil, model.NewErrNotFound("parent card not found: " + parentCardID)
	}

	if parentCard.BoardID != boardID {
		return nil, model.NewErrBadRequest("parent card does not belong to specified board")
	}

	newDepth := parentCard.Depth + 1
	if newDepth > model.MaxCardDepth {
		return nil, model.NewErrBadRequest(fmt.Sprintf("maximum card depth (%d) exceeded", model.MaxCardDepth))
	}

	now := utils.GetMillis()

	card.ID = utils.NewID(utils.IDTypeCard)
	card.BoardID = boardID
	card.ParentCardID = parentCardID
	card.Depth = newDepth
	card.CreatedBy = userID
	card.ModifiedBy = userID
	card.CreateAt = now
	card.UpdateAt = now
	card.DeleteAt = 0

	if card.Properties == nil {
		card.Properties = deepCopyProperties(parentCard.Properties)
	}

	block := model.Card2Block(card)

	newBlocks, err := a.InsertBlocksAndNotify([]*model.Block{block}, userID, disableNotify)
	if err != nil {
		return nil, fmt.Errorf("cannot create sub-card: %w", err)
	}

	newCard, err := model.Block2Card(newBlocks[0])
	if err != nil {
		return nil, err
	}

	return newCard, nil
}

func (a *App) GetSubCards(parentCardID string, page int, perPage int) ([]*model.Card, error) {
	opts := model.QueryBlocksOptions{
		ParentID:  parentCardID,
		BlockType: model.TypeCard,
		Page:      page,
		PerPage:   perPage,
	}

	blocks, err := a.store.GetBlocks(opts)
	if err != nil {
		return nil, err
	}

	cards := make([]*model.Card, 0, len(blocks))
	for _, blk := range blocks {
		b := blk
		if card, err := model.Block2Card(b); err != nil {
			return nil, fmt.Errorf("Block2Card fail: %w", err)
		} else {
			cards = append(cards, card)
		}
	}
	return cards, nil
}

func (a *App) GetSubCardCount(parentCardID string) (int, error) {
	opts := model.QueryBlocksOptions{
		ParentID:  parentCardID,
		BlockType: model.TypeCard,
		PerPage:   -1,
	}

	blocks, err := a.store.GetBlocks(opts)
	if err != nil {
		return 0, err
	}

	return len(blocks), nil
}

func deepCopyProperties(props map[string]any) map[string]any {
	if props == nil {
		return make(map[string]any)
	}

	copied := make(map[string]any, len(props))
	for k, v := range props {
		switch val := v.(type) {
		case []interface{}:
			newArr := make([]interface{}, len(val))
			copy(newArr, val)
			copied[k] = newArr
		case []string:
			newArr := make([]string, len(val))
			copy(newArr, val)
			copied[k] = newArr
		default:
			copied[k] = v
		}
	}
	return copied
}
