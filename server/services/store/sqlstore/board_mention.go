package sqlstore

import (
	sq "github.com/Masterminds/squirrel"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"
)

func (s *SQLStore) insertBoardMention(db sq.BaseRunner, mention *model.BoardMention) error {
	query := s.getQueryBuilder(db).
		Insert(s.tablePrefix+"board_mentions").
		Columns(
			"id",
			"user_id",
			"sender_id",
			"block_id",
			"board_id",
			"card_id",
			"channel_id",
			"message",
			"post_id",
			"create_at",
			"replied_at",
		).
		Values(
			mention.ID,
			mention.UserID,
			mention.SenderID,
			mention.BlockID,
			mention.BoardID,
			mention.CardID,
			mention.ChannelID,
			mention.Message,
			mention.PostID,
			mention.CreateAt,
			mention.RepliedAt,
		)

	if _, err := query.Exec(); err != nil {
		return err
	}
	return nil
}

func (s *SQLStore) markBoardMentionReplied(db sq.BaseRunner, userID, cardID string) error {
	now := utils.GetMillis()
	query := s.getQueryBuilder(db).
		Update(s.tablePrefix+"board_mentions").
		Set("replied_at", now).
		Where(sq.Eq{
			"user_id":    userID,
			"card_id":    cardID,
			"replied_at": 0,
		})
	_, err := query.Exec()
	return err
}

func (s *SQLStore) markBoardMentionRepliedByPostID(db sq.BaseRunner, userID, postID string) error {
	if postID == "" {
		return nil
	}
	now := utils.GetMillis()
	query := s.getQueryBuilder(db).
		Update(s.tablePrefix+"board_mentions").
		Set("replied_at", now).
		Where(sq.Eq{
			"user_id":    userID,
			"post_id":    postID,
			"replied_at": 0,
		})
	_, err := query.Exec()
	return err
}
