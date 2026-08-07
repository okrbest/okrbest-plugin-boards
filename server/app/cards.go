// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"fmt"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	linkSubCardMessage   = "@%s님이 카드 [%s](%s)를 카드 [%s](%s)의 하위 작업으로 연결했습니다"
	unlinkSubCardMessage = "@%s님이 카드 [%s](%s)를 하위 작업에서 연결 해제했습니다"
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

	if len(card.Properties) == 0 {
		if fillErr := a.fillDefaultConditionValues(card, boardID, userID); fillErr != nil {
			return nil, fillErr
		}
	}

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

func (a *App) GetCardsByIDs(boardID string, cardIDs []string) ([]*model.Card, error) {
	if len(cardIDs) == 0 {
		return []*model.Card{}, nil
	}

	seenCardIDs := map[string]struct{}{}
	cards := make([]*model.Card, 0, len(cardIDs))
	for _, cardID := range cardIDs {
		if cardID == "" {
			continue
		}
		if _, seen := seenCardIDs[cardID]; seen {
			continue
		}
		seenCardIDs[cardID] = struct{}{}

		card, err := a.GetCardByID(cardID)
		if err != nil {
			if model.IsErrNotFound(err) {
				continue
			}
			return nil, err
		}
		if card.BoardID != boardID {
			continue
		}
		cards = append(cards, card)
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

	// Asked before the parent's values are copied in, because what the caller
	// chose has to outrank both the parent and the rules.
	callerChoseProperties := len(card.Properties) > 0

	if !callerChoseProperties {
		// Inheriting the parent wholesale is what broke the OKR ladder: a 팀장
		// adding a card under an Object card got another Object card, a shape
		// the rules never let them create. The parent's values are kept as the
		// base — a board with no rules still wants them — and the rules then
		// overwrite the ones that decide where the author may work.
		card.Properties = deepCopyProperties(parentCard.Properties)

		if fillErr := a.fillDefaultConditionValues(card, boardID, userID); fillErr != nil {
			return nil, fillErr
		}
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

// getMaxSubCardDepth returns the maximum depth among all descendants of a card.
// Returns 0 if the card has no sub-cards.
func (a *App) getMaxSubCardDepth(cardID string) (int, error) {
	subCards, err := a.GetSubCards(cardID, 0, -1)
	if err != nil {
		return 0, err
	}

	if len(subCards) == 0 {
		return 0, nil
	}

	maxDepth := 0
	for _, subCard := range subCards {
		subMaxDepth, err := a.getMaxSubCardDepth(subCard.ID)
		if err != nil {
			return 0, err
		}
		depth := 1 + subMaxDepth
		if depth > maxDepth {
			maxDepth = depth
		}
	}
	return maxDepth, nil
}

// updateSubCardsDepth recursively updates the depth of all sub-cards by depthDelta.
func (a *App) updateSubCardsDepth(cardID string, depthDelta int, userID string) error {
	subCards, err := a.GetSubCards(cardID, 0, -1)
	if err != nil {
		return err
	}

	for _, subCard := range subCards {
		newDepth := subCard.Depth + depthDelta
		cardPatch := &model.CardPatch{
			Depth: &newDepth,
		}

		_, err := a.PatchCard(cardPatch, subCard.ID, userID, true) // disableNotify=true for bulk update
		if err != nil {
			return fmt.Errorf("failed to update sub-card depth: %w", err)
		}

		// Recursively update children
		if err := a.updateSubCardsDepth(subCard.ID, depthDelta, userID); err != nil {
			return err
		}
	}

	return nil
}

func (a *App) LinkCardAsSubCard(cardID, parentCardID, userID string) (*model.Card, error) {
	if cardID == parentCardID {
		return nil, model.NewErrBadRequest("cannot link card to itself")
	}

	card, err := a.GetCardByID(cardID)
	if err != nil {
		return nil, model.NewErrNotFound("card not found: " + cardID)
	}

	parentCard, err := a.GetCardByID(parentCardID)
	if err != nil {
		return nil, model.NewErrNotFound("parent card not found: " + parentCardID)
	}

	if card.BoardID != parentCard.BoardID {
		return nil, model.NewErrBadRequest("card and parent card must be in the same board")
	}

	if card.Depth > 0 {
		return nil, model.NewErrBadRequest("card is already a sub-card")
	}

	newDepth := parentCard.Depth + 1

	// Check if linking would exceed max depth including existing sub-cards
	maxSubDepth, err := a.getMaxSubCardDepth(cardID)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate max sub-card depth: %w", err)
	}

	if newDepth+maxSubDepth > model.MaxCardDepth {
		return nil, model.NewErrBadRequest(fmt.Sprintf(
			"maximum card depth (%d) exceeded: this card has sub-cards with depth %d",
			model.MaxCardDepth, maxSubDepth))
	}

	if circErr := a.checkCircularReference(cardID, parentCardID); circErr != nil {
		return nil, circErr
	}

	cardPatch := &model.CardPatch{
		ParentCardID: &parentCardID,
		Depth:        &newDepth,
	}

	updatedCard, err := a.PatchCard(cardPatch, cardID, userID, false)
	if err != nil {
		return nil, fmt.Errorf("failed to link card: %w", err)
	}

	// Update depth of all sub-cards recursively
	if maxSubDepth > 0 {
		depthDelta := newDepth - card.Depth // how much depth increased
		if err := a.updateSubCardsDepth(cardID, depthDelta, userID); err != nil {
			// Log error but don't fail the operation
			a.logger.Error("failed to update sub-cards depth", mlog.Err(err))
		}
	}

	// Send channel notification if board is linked to a channel
	board, boardErr := a.GetBoard(card.BoardID)
	if boardErr == nil && board.ChannelID != "" {
		var username string
		user, userErr := a.store.GetUserByID(userID)
		if userErr != nil {
			username = "unknown"
		} else {
			username = user.Username
		}

		childTitle := card.Title
		if childTitle == "" {
			childTitle = "제목 없음"
		}
		parentTitle := parentCard.Title
		if parentTitle == "" {
			parentTitle = "제목 없음"
		}

		childLink := utils.MakeCardLink(a.config.ServerRoot, board.TeamID, board.ID, cardID)
		parentLink := utils.MakeCardLink(a.config.ServerRoot, board.TeamID, board.ID, parentCardID)

		if err := a.postChannelMessage(fmt.Sprintf(linkSubCardMessage, username, childTitle, childLink, parentTitle, parentLink), board.ChannelID); err != nil {
			a.logger.Error("Unable to post sub-card link message to channel", mlog.Err(err))
		}
	}

	return updatedCard, nil
}

func (a *App) checkCircularReference(cardID, parentCardID string) error {
	visited := make(map[string]bool)
	current := parentCardID

	for current != "" {
		if current == cardID {
			return model.NewErrBadRequest("circular reference detected")
		}
		if visited[current] {
			break
		}
		visited[current] = true

		parentCard, err := a.GetCardByID(current)
		if err != nil {
			break
		}
		current = parentCard.ParentCardID
	}

	return nil
}

func (a *App) UnlinkSubCard(cardID, userID string) (*model.Card, error) {
	card, err := a.GetCardByID(cardID)
	if err != nil {
		return nil, model.NewErrNotFound("card not found: " + cardID)
	}

	if card.ParentCardID == "" {
		return nil, model.NewErrBadRequest("card is not a sub-card")
	}

	oldDepth := card.Depth
	zeroDepth := 0

	// 모든 필드를 하나의 BlockPatch로 업데이트하여 트랜잭션 불일치 방지
	// - ParentID: board_id로 설정 (최상위 카드는 parent_id = board_id여야 함)
	// - parentCardId: 빈 문자열로 설정
	// - depth: 0으로 설정
	blockPatch := &model.BlockPatch{
		ParentID: &card.BoardID,
		UpdatedFields: map[string]any{
			"parentCardId": "",
			"depth":        zeroDepth,
		},
	}

	updatedBlock, err := a.PatchBlockAndNotify(cardID, blockPatch, userID, false)
	if err != nil {
		return nil, fmt.Errorf("failed to unlink card: %w", err)
	}

	updatedCard, err := model.Block2Card(updatedBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to convert block to card: %w", err)
	}

	// Update depth of all sub-cards recursively
	if oldDepth > 0 {
		depthDelta := zeroDepth - oldDepth // negative value (e.g., 0 - 2 = -2)
		if err := a.updateSubCardsDepth(cardID, depthDelta, userID); err != nil {
			a.logger.Error("failed to update sub-cards depth on unlink", mlog.Err(err))
		}
	}

	// Send channel notification if board is linked to a channel
	board, boardErr := a.GetBoard(card.BoardID)
	if boardErr == nil && board.ChannelID != "" {
		var username string
		user, userErr := a.store.GetUserByID(userID)
		if userErr != nil {
			username = "unknown"
		} else {
			username = user.Username
		}

		childTitle := card.Title
		if childTitle == "" {
			childTitle = "제목 없음"
		}

		childLink := utils.MakeCardLink(a.config.ServerRoot, board.TeamID, board.ID, cardID)

		if err := a.postChannelMessage(fmt.Sprintf(unlinkSubCardMessage, username, childTitle, childLink), board.ChannelID); err != nil {
			a.logger.Error("Unable to post sub-card unlink message to channel", mlog.Err(err))
		}
	}

	return updatedCard, nil
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

// fillDefaultConditionValues writes the rule condition values a new card should
// be born with, so it lands where its author is allowed to work.
//
// It is only reached when the caller named no values of its own. What the caller
// chose always wins — the fill is a default, not a correction.
//
// The values come out of the rules that admit this user, which is what lets the
// OKR ladder be built: a 팀장 gets Key Results and a 팀원 gets Tasks without
// either the server or the screen knowing anything about OKR. A property whose
// rows are ambiguous, or a user no row admits, is left alone; a blank card is
// always creatable, so nothing is lost by declining to guess.
func (a *App) fillDefaultConditionValues(card *model.Card, boardID, userID string) error {
	board, err := a.GetBoard(boardID)
	if err != nil || board == nil {
		return err
	}

	evaluator, err := a.newPropertyAccessEvaluator(userID, board)
	if err != nil {
		return err
	}

	defaults := evaluator.DefaultConditionValues()
	if len(defaults) == 0 {
		return nil
	}

	if card.Properties == nil {
		card.Properties = map[string]interface{}{}
	}
	for propertyID, valueID := range defaults {
		card.Properties[propertyID] = valueID
	}

	return nil
}
