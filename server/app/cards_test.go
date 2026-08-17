// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateCard(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	board := &model.Board{
		ID: utils.NewID(utils.IDTypeBoard),
	}
	userID := utils.NewID(utils.IDTypeUser)

	props := makeProps(3)

	card := &model.Card{
		BoardID:      board.ID,
		CreatedBy:    userID,
		ModifiedBy:   userID,
		Title:        "test card",
		ContentOrder: []string{utils.NewID(utils.IDTypeBlock), utils.NewID(utils.IDTypeBlock)},
		Properties:   props,
	}
	block := model.Card2Block(card)

	t.Run("success scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBoard(board.ID).Return(board, nil)
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block"))
		th.Store.EXPECT().InsertBlock(gomock.AssignableToTypeOf(reflect.TypeOf(block)), userID).Return(nil)
		th.Store.EXPECT().GetMembersForBoard(board.ID).Return([]*model.BoardMember{}, nil)

		newCard, err := th.App.CreateCard(card, board.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, card.BoardID, newCard.BoardID)
		require.Equal(t, card.Title, newCard.Title)
		require.Equal(t, card.ContentOrder, newCard.ContentOrder)
		require.EqualValues(t, card.Properties, newCard.Properties)
	})

	t.Run("error scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBoard(board.ID).Return(board, nil)
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block"))
		th.Store.EXPECT().InsertBlock(gomock.AssignableToTypeOf(reflect.TypeOf(block)), userID).Return(blockError{"error"})

		newCard, err := th.App.CreateCard(card, board.ID, userID, false)

		require.Error(t, err, "error")
		require.Nil(t, newCard)
	})
}

func TestGetCards(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	board := &model.Board{
		ID: utils.NewID(utils.IDTypeBoard),
	}

	const cardCount = 25

	blocks := make([]*model.Block, 0, cardCount)
	for i := 0; i < cardCount; i++ {
		card := &model.Block{
			ID:       utils.NewID(utils.IDTypeBlock),
			ParentID: board.ID,
			Schema:   1,
			Type:     model.TypeCard,
			Title:    fmt.Sprintf("card %d", i),
			BoardID:  board.ID,
		}
		blocks = append(blocks, card)
	}

	t.Run("success scenario", func(t *testing.T) {
		opts := model.QueryBlocksOptions{
			BoardID:   board.ID,
			ParentID:  board.ID,
			BlockType: model.TypeCard,
		}

		th.Store.EXPECT().GetBlocks(opts).Return(blocks, nil)

		cards, err := th.App.GetCardsForBoard(board.ID, 0, 0)
		require.NoError(t, err)
		assert.Len(t, cards, cardCount)
	})

	t.Run("error scenario", func(t *testing.T) {
		opts := model.QueryBlocksOptions{
			BoardID:   board.ID,
			ParentID:  board.ID,
			BlockType: model.TypeCard,
		}

		th.Store.EXPECT().GetBlocks(opts).Return(nil, blockError{"error"})

		cards, err := th.App.GetCardsForBoard(board.ID, 0, 0)
		require.Error(t, err)
		require.Nil(t, cards)
	})
}

func TestGetCardsByIDs(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	boardID := utils.NewID(utils.IDTypeBoard)
	otherBoardID := utils.NewID(utils.IDTypeBoard)
	cardID1 := utils.NewID(utils.IDTypeCard)
	cardID2 := utils.NewID(utils.IDTypeCard)
	cardID3 := utils.NewID(utils.IDTypeCard)
	missingCardID := utils.NewID(utils.IDTypeCard)

	card1 := &model.Card{ID: cardID1, BoardID: boardID, Title: "card-1"}
	card2 := &model.Card{ID: cardID2, BoardID: boardID, Title: "card-2"}
	card3 := &model.Card{ID: cardID3, BoardID: otherBoardID, Title: "card-3"}

	t.Run("success scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(cardID1).Return(model.Card2Block(card1), nil)
		th.Store.EXPECT().GetBlock(cardID2).Return(model.Card2Block(card2), nil)
		th.Store.EXPECT().GetBlock(cardID3).Return(model.Card2Block(card3), nil)
		th.Store.EXPECT().GetBlock(missingCardID).Return(nil, model.NewErrNotFound(missingCardID))

		cards, err := th.App.GetCardsByIDs(boardID, []string{cardID1, cardID1, cardID2, cardID3, missingCardID, ""})
		require.NoError(t, err)
		require.Len(t, cards, 2)
		require.Equal(t, cardID1, cards[0].ID)
		require.Equal(t, cardID2, cards[1].ID)
	})

	t.Run("empty ids returns empty list", func(t *testing.T) {
		cards, err := th.App.GetCardsByIDs(boardID, nil)
		require.NoError(t, err)
		require.Len(t, cards, 0)
	})

	t.Run("error scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(cardID1).Return(nil, blockError{"error"})

		cards, err := th.App.GetCardsByIDs(boardID, []string{cardID1})
		require.Error(t, err)
		require.Nil(t, cards)
	})
}

func TestPatchCard(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	board := &model.Board{
		ID: utils.NewID(utils.IDTypeBoard),
	}
	userID := utils.NewID(utils.IDTypeUser)

	props := makeProps(3)

	card := &model.Card{
		BoardID:      board.ID,
		CreatedBy:    userID,
		ModifiedBy:   userID,
		Title:        "test card for patch",
		ContentOrder: []string{utils.NewID(utils.IDTypeBlock), utils.NewID(utils.IDTypeBlock)},
		Properties:   copyProps(props),
	}

	newTitle := "patched"
	newIcon := "😀"
	newContentOrder := reverse(card.ContentOrder)

	cardPatch := &model.CardPatch{
		Title:             &newTitle,
		ContentOrder:      &newContentOrder,
		Icon:              &newIcon,
		UpdatedProperties: modifyProps(props),
	}

	t.Run("success scenario", func(t *testing.T) {
		expectedPatchedCard := cardPatch.Patch(card)
		expectedPatchedBlock := model.Card2Block(expectedPatchedCard)

		var blockPatch *model.BlockPatch
		th.Store.EXPECT().GetBoard(board.ID).Return(board, nil)
		th.Store.EXPECT().PatchBlock(card.ID, gomock.AssignableToTypeOf(reflect.TypeOf(blockPatch)), userID).Return(nil)
		th.Store.EXPECT().GetMembersForBoard(board.ID).Return([]*model.BoardMember{}, nil)
		th.Store.EXPECT().GetBlock(card.ID).Return(expectedPatchedBlock, nil).AnyTimes()

		patchedCard, err := th.App.PatchCard(cardPatch, card.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, board.ID, patchedCard.BoardID)
		require.Equal(t, newTitle, patchedCard.Title)
		require.Equal(t, newIcon, patchedCard.Icon)
		require.Equal(t, newContentOrder, patchedCard.ContentOrder)
		require.EqualValues(t, expectedPatchedCard.Properties, patchedCard.Properties)
	})

	t.Run("error scenario", func(t *testing.T) {
		var blockPatch *model.BlockPatch
		th.Store.EXPECT().GetBoard(board.ID).Return(board, nil)
		th.Store.EXPECT().PatchBlock(card.ID, gomock.AssignableToTypeOf(reflect.TypeOf(blockPatch)), userID).Return(blockError{"error"})

		patchedCard, err := th.App.PatchCard(cardPatch, card.ID, userID, false)

		require.Error(t, err, "error")
		require.Nil(t, patchedCard)
	})
}

func TestGetCard(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	boardID := utils.NewID(utils.IDTypeBoard)
	userID := utils.NewID(utils.IDTypeUser)
	props := makeProps(5)
	contentOrder := []string{utils.NewID(utils.IDTypeUser), utils.NewID(utils.IDTypeUser)}
	fields := make(map[string]any)
	fields["contentOrder"] = contentOrder
	fields["properties"] = props
	fields["icon"] = "😀"
	fields["isTemplate"] = true

	block := &model.Block{
		ID:         utils.NewID(utils.IDTypeBlock),
		ParentID:   boardID,
		Type:       model.TypeCard,
		Title:      "test card",
		BoardID:    boardID,
		Fields:     fields,
		CreatedBy:  userID,
		ModifiedBy: userID,
	}

	t.Run("success scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(block.ID).Return(block, nil)

		card, err := th.App.GetCardByID(block.ID)

		require.NoError(t, err)
		require.Equal(t, boardID, card.BoardID)
		require.Equal(t, block.Title, card.Title)
		require.Equal(t, "😀", card.Icon)
		require.Equal(t, true, card.IsTemplate)
		require.Equal(t, contentOrder, card.ContentOrder)
		require.EqualValues(t, props, card.Properties)
	})

	t.Run("not found", func(t *testing.T) {
		bogusID := utils.NewID(utils.IDTypeBlock)
		th.Store.EXPECT().GetBlock(bogusID).Return(nil, model.NewErrNotFound(bogusID))

		card, err := th.App.GetCardByID(bogusID)

		require.Error(t, err, "error")
		require.True(t, model.IsErrNotFound(err))
		require.Nil(t, card)
	})

	t.Run("error scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(block.ID).Return(nil, blockError{"error"})

		card, err := th.App.GetCardByID(block.ID)

		require.Error(t, err, "error")
		require.Nil(t, card)
	})
}

// reverse is a helper function to copy and reverse a slice of strings.
func reverse(src []string) []string {
	out := make([]string, 0, len(src))
	for i := len(src) - 1; i >= 0; i-- {
		out = append(out, src[i])
	}
	return out
}

func makeProps(count int) map[string]any {
	props := make(map[string]any)
	for i := 0; i < count; i++ {
		props[utils.NewID(utils.IDTypeBlock)] = utils.NewID(utils.IDTypeBlock)
	}
	return props
}

func copyProps(m map[string]any) map[string]any {
	out := make(map[string]any)
	for k, v := range m {
		out[k] = v
	}
	return out
}

func modifyProps(m map[string]any) map[string]any {
	out := make(map[string]any)
	for k := range m {
		out[k] = utils.NewID(utils.IDTypeBlock)
	}
	return out
}

func TestCreateSubCard(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	board := &model.Board{
		ID: utils.NewID(utils.IDTypeBoard),
	}
	userID := utils.NewID(utils.IDTypeUser)

	parentCard := &model.Card{
		ID:         utils.NewID(utils.IDTypeCard),
		BoardID:    board.ID,
		Title:      "parent card",
		Depth:      0,
		Properties: makeProps(2),
	}
	parentBlock := model.Card2Block(parentCard)

	subCard := &model.Card{
		BoardID: board.ID,
		Title:   "sub card",
	}

	t.Run("success scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(parentCard.ID).Return(parentBlock, nil)
		// Read twice now: once to decide the values a new card is born with, and
		// once by the insert path itself.
		th.Store.EXPECT().GetBoard(board.ID).Return(board, nil).AnyTimes()
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block"))
		th.Store.EXPECT().InsertBlock(gomock.Any(), userID).Return(nil)
		th.Store.EXPECT().GetMembersForBoard(board.ID).Return([]*model.BoardMember{}, nil)

		newCard, err := th.App.CreateSubCard(subCard, parentCard.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.NotNil(t, newCard)
		require.Equal(t, board.ID, newCard.BoardID)
		require.Equal(t, parentCard.ID, newCard.ParentCardID)
		require.Equal(t, 1, newCard.Depth)
	})

	t.Run("parent not found", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(parentCard.ID).Return(nil, model.NewErrNotFound("not found"))

		newCard, err := th.App.CreateSubCard(subCard, parentCard.ID, board.ID, userID, false)

		require.Error(t, err)
		require.Nil(t, newCard)
		require.True(t, model.IsErrNotFound(err))
	})

	t.Run("max depth exceeded", func(t *testing.T) {
		deepParentCard := &model.Card{
			ID:      utils.NewID(utils.IDTypeCard),
			BoardID: board.ID,
			Title:   "deep parent",
			Depth:   model.MaxCardDepth,
		}
		deepParentBlock := model.Card2Block(deepParentCard)

		th.Store.EXPECT().GetBlock(deepParentCard.ID).Return(deepParentBlock, nil)

		newCard, err := th.App.CreateSubCard(subCard, deepParentCard.ID, board.ID, userID, false)

		require.Error(t, err)
		require.Nil(t, newCard)
	})

	t.Run("board mismatch", func(t *testing.T) {
		differentBoardID := utils.NewID(utils.IDTypeBoard)
		th.Store.EXPECT().GetBlock(parentCard.ID).Return(parentBlock, nil)

		newCard, err := th.App.CreateSubCard(subCard, parentCard.ID, differentBoardID, userID, false)

		require.Error(t, err)
		require.Nil(t, newCard)
	})
}

func TestGetSubCards(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	parentCardID := utils.NewID(utils.IDTypeCard)
	boardID := utils.NewID(utils.IDTypeBoard)

	const subCardCount = 5
	blocks := make([]*model.Block, 0, subCardCount)
	for i := 0; i < subCardCount; i++ {
		fields := map[string]any{
			"depth":        1,
			"properties":   map[string]any{},
			"contentOrder": []string{},
		}
		block := &model.Block{
			ID:       utils.NewID(utils.IDTypeCard),
			ParentID: parentCardID,
			BoardID:  boardID,
			Type:     model.TypeCard,
			Title:    fmt.Sprintf("sub card %d", i),
			Fields:   fields,
		}
		blocks = append(blocks, block)
	}

	t.Run("success scenario", func(t *testing.T) {
		opts := model.QueryBlocksOptions{
			ParentID:  parentCardID,
			BlockType: model.TypeCard,
			Page:      0,
			PerPage:   100,
		}

		th.Store.EXPECT().GetBlocks(opts).Return(blocks, nil)

		cards, err := th.App.GetSubCards(parentCardID, 0, 100)
		require.NoError(t, err)
		assert.Len(t, cards, subCardCount)
	})

	t.Run("empty result", func(t *testing.T) {
		opts := model.QueryBlocksOptions{
			ParentID:  parentCardID,
			BlockType: model.TypeCard,
			Page:      0,
			PerPage:   100,
		}

		th.Store.EXPECT().GetBlocks(opts).Return([]*model.Block{}, nil)

		cards, err := th.App.GetSubCards(parentCardID, 0, 100)
		require.NoError(t, err)
		assert.Len(t, cards, 0)
	})

	t.Run("error scenario", func(t *testing.T) {
		opts := model.QueryBlocksOptions{
			ParentID:  parentCardID,
			BlockType: model.TypeCard,
			Page:      0,
			PerPage:   100,
		}

		th.Store.EXPECT().GetBlocks(opts).Return(nil, blockError{"error"})

		cards, err := th.App.GetSubCards(parentCardID, 0, 100)
		require.Error(t, err)
		require.Nil(t, cards)
	})
}

func TestGetSubCardCount(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	parentCardID := utils.NewID(utils.IDTypeCard)
	boardID := utils.NewID(utils.IDTypeBoard)

	const subCardCount = 3
	blocks := make([]*model.Block, 0, subCardCount)
	for i := 0; i < subCardCount; i++ {
		fields := map[string]any{
			"depth":        1,
			"properties":   map[string]any{},
			"contentOrder": []string{},
		}
		block := &model.Block{
			ID:       utils.NewID(utils.IDTypeCard),
			ParentID: parentCardID,
			BoardID:  boardID,
			Type:     model.TypeCard,
			Fields:   fields,
		}
		blocks = append(blocks, block)
	}

	t.Run("success scenario", func(t *testing.T) {
		opts := model.QueryBlocksOptions{
			ParentID:  parentCardID,
			BlockType: model.TypeCard,
			PerPage:   -1,
		}

		th.Store.EXPECT().GetBlocks(opts).Return(blocks, nil)

		count, err := th.App.GetSubCardCount(parentCardID)
		require.NoError(t, err)
		assert.Equal(t, subCardCount, count)
	})

	t.Run("zero count", func(t *testing.T) {
		opts := model.QueryBlocksOptions{
			ParentID:  parentCardID,
			BlockType: model.TypeCard,
			PerPage:   -1,
		}

		th.Store.EXPECT().GetBlocks(opts).Return([]*model.Block{}, nil)

		count, err := th.App.GetSubCardCount(parentCardID)
		require.NoError(t, err)
		assert.Equal(t, 0, count)
	})

	t.Run("error scenario", func(t *testing.T) {
		opts := model.QueryBlocksOptions{
			ParentID:  parentCardID,
			BlockType: model.TypeCard,
			PerPage:   -1,
		}

		th.Store.EXPECT().GetBlocks(opts).Return(nil, blockError{"error"})

		count, err := th.App.GetSubCardCount(parentCardID)
		require.Error(t, err)
		assert.Equal(t, 0, count)
	})
}

func TestLinkCardAsSubCard(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	board := &model.Board{
		ID: utils.NewID(utils.IDTypeBoard),
	}
	userID := utils.NewID(utils.IDTypeUser)

	parentCard := &model.Card{
		ID:         utils.NewID(utils.IDTypeCard),
		BoardID:    board.ID,
		Title:      "parent card",
		Depth:      0,
		Properties: map[string]any{},
	}
	parentBlock := model.Card2Block(parentCard)

	cardToLink := &model.Card{
		ID:         utils.NewID(utils.IDTypeCard),
		BoardID:    board.ID,
		Title:      "card to link",
		Depth:      0,
		Properties: map[string]any{},
	}
	cardToLinkBlock := model.Card2Block(cardToLink)

	t.Run("success scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(cardToLink.ID).Return(cardToLinkBlock, nil).Times(3)
		th.Store.EXPECT().GetBlock(parentCard.ID).Return(parentBlock, nil).Times(2)
		th.Store.EXPECT().GetBoard(board.ID).Return(board, nil)
		th.Store.EXPECT().PatchBlock(cardToLink.ID, gomock.Any(), userID).Return(nil)
		th.Store.EXPECT().GetMembersForBoard(board.ID).Return([]*model.BoardMember{}, nil)

		linkedCard, err := th.App.LinkCardAsSubCard(cardToLink.ID, parentCard.ID, userID)

		require.NoError(t, err)
		require.NotNil(t, linkedCard)
		require.Equal(t, parentCard.ID, linkedCard.ParentCardID)
		require.Equal(t, 1, linkedCard.Depth)
	})

	t.Run("cannot link to self", func(t *testing.T) {
		linkedCard, err := th.App.LinkCardAsSubCard(cardToLink.ID, cardToLink.ID, userID)

		require.Error(t, err)
		require.Nil(t, linkedCard)
	})

	t.Run("card not found", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(cardToLink.ID).Return(nil, model.NewErrNotFound("not found"))

		linkedCard, err := th.App.LinkCardAsSubCard(cardToLink.ID, parentCard.ID, userID)

		require.Error(t, err)
		require.Nil(t, linkedCard)
		require.True(t, model.IsErrNotFound(err))
	})

	t.Run("parent not found", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(cardToLink.ID).Return(cardToLinkBlock, nil)
		th.Store.EXPECT().GetBlock(parentCard.ID).Return(nil, model.NewErrNotFound("not found"))

		linkedCard, err := th.App.LinkCardAsSubCard(cardToLink.ID, parentCard.ID, userID)

		require.Error(t, err)
		require.Nil(t, linkedCard)
		require.True(t, model.IsErrNotFound(err))
	})

	t.Run("different board", func(t *testing.T) {
		differentBoardCard := &model.Card{
			ID:         utils.NewID(utils.IDTypeCard),
			BoardID:    utils.NewID(utils.IDTypeBoard),
			Title:      "different board card",
			Depth:      0,
			Properties: map[string]any{},
		}
		differentBoardBlock := model.Card2Block(differentBoardCard)

		th.Store.EXPECT().GetBlock(cardToLink.ID).Return(cardToLinkBlock, nil)
		th.Store.EXPECT().GetBlock(differentBoardCard.ID).Return(differentBoardBlock, nil)

		linkedCard, err := th.App.LinkCardAsSubCard(cardToLink.ID, differentBoardCard.ID, userID)

		require.Error(t, err)
		require.Nil(t, linkedCard)
	})

	t.Run("card already sub-card", func(t *testing.T) {
		alreadySubCard := &model.Card{
			ID:           utils.NewID(utils.IDTypeCard),
			BoardID:      board.ID,
			Title:        "already sub-card",
			Depth:        1,
			ParentCardID: utils.NewID(utils.IDTypeCard),
			Properties:   map[string]any{},
		}
		alreadySubCardBlock := model.Card2Block(alreadySubCard)

		th.Store.EXPECT().GetBlock(alreadySubCard.ID).Return(alreadySubCardBlock, nil)
		th.Store.EXPECT().GetBlock(parentCard.ID).Return(parentBlock, nil)

		linkedCard, err := th.App.LinkCardAsSubCard(alreadySubCard.ID, parentCard.ID, userID)

		require.Error(t, err)
		require.Nil(t, linkedCard)
	})

	t.Run("max depth exceeded", func(t *testing.T) {
		deepParent := &model.Card{
			ID:         utils.NewID(utils.IDTypeCard),
			BoardID:    board.ID,
			Title:      "deep parent",
			Depth:      model.MaxCardDepth,
			Properties: map[string]any{},
		}
		deepParentBlock := model.Card2Block(deepParent)

		th.Store.EXPECT().GetBlock(cardToLink.ID).Return(cardToLinkBlock, nil)
		th.Store.EXPECT().GetBlock(deepParent.ID).Return(deepParentBlock, nil)

		linkedCard, err := th.App.LinkCardAsSubCard(cardToLink.ID, deepParent.ID, userID)

		require.Error(t, err)
		require.Nil(t, linkedCard)
	})
}

func TestUnlinkSubCard(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	board := &model.Board{
		ID: utils.NewID(utils.IDTypeBoard),
	}
	userID := utils.NewID(utils.IDTypeUser)

	parentCardID := utils.NewID(utils.IDTypeCard)
	subCard := &model.Card{
		ID:           utils.NewID(utils.IDTypeCard),
		BoardID:      board.ID,
		Title:        "sub card",
		Depth:        1,
		ParentCardID: parentCardID,
		Properties:   map[string]any{},
	}
	subCardBlock := model.Card2Block(subCard)

	unlinkedBlock := &model.Block{
		ID:       subCard.ID,
		BoardID:  board.ID,
		ParentID: board.ID,
		Type:     model.TypeCard,
		Title:    subCard.Title,
		Fields: map[string]any{
			"depth":        0,
			"properties":   map[string]any{},
			"contentOrder": []string{},
		},
	}

	t.Run("success scenario", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(subCard.ID).Return(subCardBlock, nil).Times(2)
		th.Store.EXPECT().GetBoard(board.ID).Return(board, nil)
		th.Store.EXPECT().PatchBlock(subCard.ID, gomock.Any(), userID).Return(nil)
		th.Store.EXPECT().GetMembersForBoard(board.ID).Return([]*model.BoardMember{}, nil)
		th.Store.EXPECT().GetBlock(subCard.ID).Return(unlinkedBlock, nil)

		unlinkedCard, err := th.App.UnlinkSubCard(subCard.ID, userID)

		require.NoError(t, err)
		require.NotNil(t, unlinkedCard)
		require.Equal(t, "", unlinkedCard.ParentCardID)
		require.Equal(t, 0, unlinkedCard.Depth)
	})

	t.Run("card not found", func(t *testing.T) {
		th.Store.EXPECT().GetBlock(subCard.ID).Return(nil, model.NewErrNotFound("not found"))

		unlinkedCard, err := th.App.UnlinkSubCard(subCard.ID, userID)

		require.Error(t, err)
		require.Nil(t, unlinkedCard)
		require.True(t, model.IsErrNotFound(err))
	})

	t.Run("card not a sub-card", func(t *testing.T) {
		topLevelCard := &model.Card{
			ID:           utils.NewID(utils.IDTypeCard),
			BoardID:      board.ID,
			Title:        "top level card",
			Depth:        0,
			ParentCardID: "",
			Properties:   map[string]any{},
		}
		topLevelBlock := model.Card2Block(topLevelCard)

		th.Store.EXPECT().GetBlock(topLevelCard.ID).Return(topLevelBlock, nil)

		unlinkedCard, err := th.App.UnlinkSubCard(topLevelCard.ID, userID)

		require.Error(t, err)
		require.Nil(t, unlinkedCard)
	})
}

// A sub-card starts on the rung its depth implies when the board is used as an
// OKR board. The fill happens here rather than in the browser because the
// browser cannot send properties without making this function skip the block
// that copies the parent's — 본부 and 부서 would stop reaching sub-cards
// (008 research R4, FR-008).
func TestCreateSubCardOkrBoard(t *testing.T) {
	const typePropertyID = "p-type"
	const divisionPropertyID = "p-div"
	const departmentPropertyID = "p-dep"
	const dutyPropertyID = "p-duty"
	const notePropertyID = "p-note"
	const legacyOrgPropertyID = "p-legacy-org"

	okrBoard := func() *model.Board {
		return &model.Board{
			ID: utils.NewID(utils.IDTypeBoard),
			// A sub-card is filled from the parent by property type, so the board
			// has to say what type each property is.
			CardProperties: []map[string]interface{}{
				{"id": typePropertyID, "type": "select"},
				{"id": divisionPropertyID, "type": model.PropertyTypeOrgDivision},
				{"id": departmentPropertyID, "type": model.PropertyTypeOrgDepartment},
				{"id": dutyPropertyID, "type": model.PropertyTypeOrgDuty},
				{"id": notePropertyID, "type": "text"},
			},
			Properties: map[string]interface{}{
				model.OkrBoardKey: map[string]interface{}{
					"propertyId": typePropertyID,
					"levels":     []interface{}{"opt-objective", "opt-key-result", "opt-task"},
				},
			},
		}
	}

	userID := utils.NewID(utils.IDTypeUser)

	// Each case gets its own helper: a catch-all expectation from one case would
	// otherwise swallow the specific parent lookup of the next.
	setupCreate := func(t *testing.T, board *model.Board, parent *model.Card) (*TestHelper, func()) {
		t.Helper()
		th, tearDown := SetupTestHelper(t)

		th.Store.EXPECT().GetBlock(parent.ID).Return(model.Card2Block(parent), nil).AnyTimes()
		th.Store.EXPECT().GetBoard(board.ID).Return(board, nil).AnyTimes()
		th.Store.EXPECT().GetBlock(gomock.Any()).Return(nil, model.NewErrNotFound("block")).AnyTimes()
		th.Store.EXPECT().InsertBlock(gomock.Any(), userID).Return(nil).AnyTimes()
		th.Store.EXPECT().GetMembersForBoard(board.ID).Return([]*model.BoardMember{}, nil).AnyTimes()

		return th, tearDown
	}

	t.Run("a sub-card of an Objective starts on the second rung", func(t *testing.T) {
		board := okrBoard()
		parent := &model.Card{
			ID:         utils.NewID(utils.IDTypeCard),
			BoardID:    board.ID,
			Depth:      0,
			Properties: map[string]interface{}{typePropertyID: "opt-objective"},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, "opt-key-result", newCard.Properties[typePropertyID])
	})

	t.Run("deeper cards share the last rung", func(t *testing.T) {
		board := okrBoard()
		parent := &model.Card{
			ID:         utils.NewID(utils.IDTypeCard),
			BoardID:    board.ID,
			Depth:      2,
			Properties: map[string]interface{}{typePropertyID: "opt-task"},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, "opt-task", newCard.Properties[typePropertyID])
	})

	t.Run("only the parent's organization comes down", func(t *testing.T) {
		// A sub-card starts where its parent's tree is — the same 본부, 부서 and
		// 직책 — and starts empty on everything else. Copying the parent wholesale
		// made every new card a duplicate of the one above it, so the author had to
		// clear the inherited 기간 and 담당자 before the card said anything true.
		board := okrBoard()
		parent := &model.Card{
			ID:      utils.NewID(utils.IDTypeCard),
			BoardID: board.ID,
			Depth:   0,
			Properties: map[string]interface{}{
				typePropertyID:       "opt-objective",
				divisionPropertyID:   []interface{}{"div-production"},
				departmentPropertyID: []interface{}{"dep-line-1"},
				dutyPropertyID:       []interface{}{"duty-lead"},
				notePropertyID:       "부모가 적어둔 메모",
			},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, []interface{}{"div-production"}, newCard.Properties[divisionPropertyID])
		require.Equal(t, []interface{}{"dep-line-1"}, newCard.Properties[departmentPropertyID])
		require.NotContains(t, newCard.Properties, notePropertyID)
		require.Equal(t, "opt-key-result", newCard.Properties[typePropertyID])
	})

	t.Run("the parent's duty does not come down", func(t *testing.T) {
		// 직책 says what the person on this card does, not where the card sits.
		// Handing it down makes every sub-card claim the rank of the one above it.
		board := okrBoard()
		parent := &model.Card{
			ID:      utils.NewID(utils.IDTypeCard),
			BoardID: board.ID,
			Depth:   0,
			Properties: map[string]interface{}{
				typePropertyID: "opt-objective",
				dutyPropertyID: []interface{}{"duty-lead"},
			},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.NotContains(t, newCard.Properties, dutyPropertyID)
	})

	t.Run("a board with no organization property starts the card empty", func(t *testing.T) {
		board := okrBoard()
		board.CardProperties = []map[string]interface{}{
			{"id": typePropertyID, "type": "select"},
			{"id": notePropertyID, "type": "text"},
		}
		parent := &model.Card{
			ID:      utils.NewID(utils.IDTypeCard),
			BoardID: board.ID,
			Depth:   0,
			Properties: map[string]interface{}{
				typePropertyID: "opt-objective",
				notePropertyID: "부모가 적어둔 메모",
			},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.NotContains(t, newCard.Properties, notePropertyID)
		require.Equal(t, "opt-key-result", newCard.Properties[typePropertyID])
	})

	t.Run("the copied organization is not shared with the parent", func(t *testing.T) {
		// The value is a list. Handing the same slice to both cards would let an
		// edit on one show up on the other.
		board := okrBoard()
		parent := &model.Card{
			ID:      utils.NewID(utils.IDTypeCard),
			BoardID: board.ID,
			Depth:   0,
			Properties: map[string]interface{}{
				typePropertyID:     "opt-objective",
				divisionPropertyID: []interface{}{"div-production"},
			},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)
		require.NoError(t, err)

		copied := newCard.Properties[divisionPropertyID].([]interface{})
		copied[0] = "div-changed"

		require.Equal(t, []interface{}{"div-production"}, parent.Properties[divisionPropertyID])
	})

	t.Run("a board that was never switched on gets no rung, but still its organization", func(t *testing.T) {
		// The two fills are independent. The ladder needs the board to have been
		// switched on; taking the parent's organization does not.
		board := &model.Board{
			ID: utils.NewID(utils.IDTypeBoard),
			CardProperties: []map[string]interface{}{
				{"id": typePropertyID, "type": "select"},
				{"id": divisionPropertyID, "type": model.PropertyTypeOrgDivision},
			},
		}
		parent := &model.Card{
			ID:      utils.NewID(utils.IDTypeCard),
			BoardID: board.ID,
			Depth:   0,
			Properties: map[string]interface{}{
				typePropertyID:     "opt-objective",
				divisionPropertyID: []interface{}{"div-production"},
			},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.NotContains(t, newCard.Properties, typePropertyID)
		require.Equal(t, []interface{}{"div-production"}, newCard.Properties[divisionPropertyID])
	})

	t.Run("what the caller chose is left alone", func(t *testing.T) {
		board := okrBoard()
		parent := &model.Card{
			ID:         utils.NewID(utils.IDTypeCard),
			BoardID:    board.ID,
			Depth:      0,
			Properties: map[string]interface{}{typePropertyID: "opt-objective"},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		chosen := &model.Card{
			BoardID:    board.ID,
			Properties: map[string]interface{}{typePropertyID: "opt-task"},
		}
		newCard, err := th.App.CreateSubCard(chosen, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, "opt-task", newCard.Properties[typePropertyID])
	})

	t.Run("a rule that decides the rung outranks the ladder", func(t *testing.T) {
		// The rules are permission — they say which cards this author may make.
		// The ladder is convenience. A card born outside the rules would be one
		// its author cannot edit, so the rules fill last (008 research R5).
		teamID := utils.NewID(utils.IDTypeTeam)
		board := okrBoard()
		board.TeamID = teamID
		board.Properties[model.PropertyAccessKey] = map[string]interface{}{
			"enabled": true,
			"rules": []interface{}{
				map[string]interface{}{
					"id":              "rule-1",
					"propertyId":      typePropertyID,
					"propertyValueId": "opt-task",
					"divisionId":      "",
					"departmentId":    "",
					"dutyId":          "",
					"permission":      "editor",
				},
			},
		}

		parent := &model.Card{
			ID:         utils.NewID(utils.IDTypeCard),
			BoardID:    board.ID,
			Depth:      0,
			Properties: map[string]interface{}{typePropertyID: "opt-objective"},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		// Everything the rule evaluator reads. The rule admits every user, so
		// the property has exactly one admitted value and becomes a default.
		th.PermissionsStore.EXPECT().GetBoard(board.ID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetMemberForBoard(board.ID, gomock.Any()).
			Return(&model.BoardMember{BoardID: board.ID, SchemeEditor: true}, nil).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(gomock.Any(), teamID, gomock.Any()).Return(true).AnyTimes()
		th.Store.EXPECT().GetOrgUnitsForTeam(teamID).Return([]*model.OrgUnit{}, nil).AnyTimes()
		th.Store.EXPECT().GetDutiesForTeam(teamID).Return([]*model.Duty{}, nil).AnyTimes()
		th.Store.EXPECT().GetUserOrgProfiles(teamID, gomock.Any()).
			Return([]*model.UserOrgProfile{}, nil).AnyTimes()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, "opt-task", newCard.Properties[typePropertyID])
	})

	t.Run("a property the rules judge comes down even when it is not organizational", func(t *testing.T) {
		// A board may carry the organization as a plain select the rules are
		// written against. Leaving it empty would hand the author a card no rule
		// condition mentions — outside the rules entirely, readable by anyone the
		// board admits. The rules still fill last, so this is only the floor.
		teamID := utils.NewID(utils.IDTypeTeam)
		board := okrBoard()
		board.TeamID = teamID
		board.CardProperties = append(board.CardProperties, map[string]interface{}{
			"id": legacyOrgPropertyID, "type": "select",
		})
		board.Properties[model.PropertyAccessKey] = map[string]interface{}{
			"enabled": true,
			"rules": []interface{}{
				map[string]interface{}{
					"id":              "rule-1",
					"propertyId":      legacyOrgPropertyID,
					"propertyValueId": "opt-production",
					// A division nobody in this test belongs to, so no rule admits
					// the author and the fill writes nothing. What the card ends up
					// with is what came down from the parent.
					"divisionId":   "div-nobody",
					"departmentId": "",
					"dutyId":       "",
					"permission":   "editor",
				},
			},
		}

		parent := &model.Card{
			ID:      utils.NewID(utils.IDTypeCard),
			BoardID: board.ID,
			Depth:   0,
			Properties: map[string]interface{}{
				typePropertyID:      "opt-objective",
				legacyOrgPropertyID: "opt-production",
				notePropertyID:      "부모가 적어둔 메모",
			},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		th.PermissionsStore.EXPECT().GetBoard(board.ID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetMemberForBoard(board.ID, gomock.Any()).
			Return(&model.BoardMember{BoardID: board.ID, SchemeEditor: true}, nil).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(gomock.Any(), teamID, gomock.Any()).Return(true).AnyTimes()
		th.Store.EXPECT().GetOrgUnitsForTeam(teamID).Return([]*model.OrgUnit{}, nil).AnyTimes()
		th.Store.EXPECT().GetDutiesForTeam(teamID).Return([]*model.Duty{}, nil).AnyTimes()
		th.Store.EXPECT().GetUserOrgProfiles(teamID, gomock.Any()).
			Return([]*model.UserOrgProfile{}, nil).AnyTimes()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, "opt-production", newCard.Properties[legacyOrgPropertyID])
		require.NotContains(t, newCard.Properties, notePropertyID)
	})

	t.Run("the ladder still outranks a rung the rules also judge", func(t *testing.T) {
		// The rung property is a rule condition on a real OKR board, so it now
		// comes down with the rest. The ladder has to overwrite it or the copy
		// puts an Objective card under an Objective card again.
		teamID := utils.NewID(utils.IDTypeTeam)
		board := okrBoard()
		board.TeamID = teamID
		board.Properties[model.PropertyAccessKey] = map[string]interface{}{
			"enabled": true,
			"rules": []interface{}{
				map[string]interface{}{
					"id":              "rule-1",
					"propertyId":      typePropertyID,
					"propertyValueId": "opt-objective",
					"divisionId":      "div-nobody",
					"departmentId":    "",
					"dutyId":          "",
					"permission":      "editor",
				},
			},
		}

		parent := &model.Card{
			ID:         utils.NewID(utils.IDTypeCard),
			BoardID:    board.ID,
			Depth:      0,
			Properties: map[string]interface{}{typePropertyID: "opt-objective"},
		}
		th, tearDown := setupCreate(t, board, parent)
		defer tearDown()

		th.PermissionsStore.EXPECT().GetBoard(board.ID).Return(board, nil).AnyTimes()
		th.PermissionsStore.EXPECT().GetMemberForBoard(board.ID, gomock.Any()).
			Return(&model.BoardMember{BoardID: board.ID, SchemeEditor: true}, nil).AnyTimes()
		th.API.EXPECT().HasPermissionToTeam(gomock.Any(), teamID, gomock.Any()).Return(true).AnyTimes()
		th.Store.EXPECT().GetOrgUnitsForTeam(teamID).Return([]*model.OrgUnit{}, nil).AnyTimes()
		th.Store.EXPECT().GetDutiesForTeam(teamID).Return([]*model.Duty{}, nil).AnyTimes()
		th.Store.EXPECT().GetUserOrgProfiles(teamID, gomock.Any()).
			Return([]*model.UserOrgProfile{}, nil).AnyTimes()

		newCard, err := th.App.CreateSubCard(&model.Card{BoardID: board.ID}, parent.ID, board.ID, userID, false)

		require.NoError(t, err)
		require.Equal(t, "opt-key-result", newCard.Properties[typePropertyID])
	})
}
