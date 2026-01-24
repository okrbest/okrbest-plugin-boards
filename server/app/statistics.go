// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import "github.com/mattermost/mattermost-plugin-boards/server/model"

func (a *App) GetUsedCardsCount() (int64, error) {
	return a.store.GetUsedCardsCount()
}

func (a *App) GetBlockSuiteMigrationStatus() (*model.BlockSuiteMigrationStatus, error) {
	return a.store.GetBlockSuiteMigrationStatus()
}

func (a *App) GetUnmigratedCardsWithContentBlocks(limit int, offset int) (*model.UnmigratedCardsResponse, error) {
	cards, totalCount, err := a.store.GetUnmigratedCardsWithContentBlocks(limit, offset)
	if err != nil {
		return nil, err
	}

	return &model.UnmigratedCardsResponse{
		Cards:      cards,
		TotalCount: totalCount,
		HasMore:    int64(offset+len(cards)) < totalCount,
	}, nil
}
