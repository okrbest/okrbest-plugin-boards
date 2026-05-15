package app

import (
	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

func (a *App) InsertBoardMention(mention *model.BoardMention) error {
	return a.store.InsertBoardMention(mention)
}

func (a *App) MarkBoardMentionReplied(userID, cardID string) error {
	return a.store.MarkBoardMentionReplied(userID, cardID)
}

func (a *App) MarkBoardMentionRepliedByPostID(userID, postID string) error {
	return a.store.MarkBoardMentionRepliedByPostID(userID, postID)
}
