// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	"fmt"

	sq "github.com/Masterminds/squirrel"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// jsonFieldExtract returns the SQL expression to extract a string field from JSON.
func (s *SQLStore) jsonFieldExtract(column, key string) string {
	switch s.dbType {
	case model.PostgresDBType:
		return fmt.Sprintf("%s->>'%s'", column, key)
	case model.MysqlDBType, model.SqliteDBType:
		return fmt.Sprintf("JSON_EXTRACT(%s, '$.%s')", column, key)
	default:
		return fmt.Sprintf("%s->>'%s'", column, key)
	}
}

// jsonFieldExtractInt returns the SQL expression to extract and cast an integer field from JSON.
func (s *SQLStore) jsonFieldExtractInt(column, key string) string {
	switch s.dbType {
	case model.PostgresDBType:
		return fmt.Sprintf("CAST(%s->>'%s' AS BIGINT)", column, key)
	case model.MysqlDBType:
		return fmt.Sprintf("CAST(JSON_UNQUOTE(JSON_EXTRACT(%s, '$.%s')) AS SIGNED)", column, key)
	case model.SqliteDBType:
		return fmt.Sprintf("CAST(JSON_EXTRACT(%s, '$.%s') AS INTEGER)", column, key)
	default:
		return fmt.Sprintf("CAST(%s->>'%s' AS BIGINT)", column, key)
	}
}

// GetScheduledComments returns all scheduled comments that are due to be sent.
func (s *SQLStore) GetScheduledComments(beforeTime int64) ([]*model.Block, error) {
	return s.getScheduledComments(s.db, beforeTime)
}

func (s *SQLStore) getScheduledComments(db sq.BaseRunner, beforeTime int64) ([]*model.Block, error) {
	scheduledAtExpr := s.jsonFieldExtractInt("fields", model.BlockFieldScheduledAt)
	scheduledStatusExpr := s.jsonFieldExtract("fields", model.BlockFieldScheduledStatus)

	query := s.getQueryBuilder(db).
		Select(s.blockFields("")...).
		From(s.tablePrefix + "blocks").
		Where(sq.Eq{"type": model.TypeComment}).
		Where(sq.Eq{"delete_at": 0}).
		Where(sq.Eq{scheduledStatusExpr: model.ScheduledStatusPending}).
		Where(sq.LtOrEq{scheduledAtExpr: beforeTime}).
		OrderBy(scheduledAtExpr + " ASC")

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("GetScheduledComments error", mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	return s.blocksFromRows(rows)
}

// GetScheduledCommentsByUser returns all pending scheduled comments for a specific user.
func (s *SQLStore) GetScheduledCommentsByUser(userID string) ([]*model.Block, error) {
	return s.getScheduledCommentsByUser(s.db, userID)
}

func (s *SQLStore) getScheduledCommentsByUser(db sq.BaseRunner, userID string) ([]*model.Block, error) {
	scheduledAtExpr := s.jsonFieldExtractInt("fields", model.BlockFieldScheduledAt)
	scheduledStatusExpr := s.jsonFieldExtract("fields", model.BlockFieldScheduledStatus)

	query := s.getQueryBuilder(db).
		Select(s.blockFields("")...).
		From(s.tablePrefix + "blocks").
		Where(sq.Eq{"type": model.TypeComment}).
		Where(sq.Eq{"created_by": userID}).
		Where(sq.Eq{"delete_at": 0}).
		Where(sq.Eq{scheduledStatusExpr: model.ScheduledStatusPending}).
		OrderBy(scheduledAtExpr + " ASC")

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("GetScheduledCommentsByUser error", mlog.Err(err), mlog.String("userID", userID))
		return nil, err
	}
	defer s.CloseRows(rows)

	return s.blocksFromRows(rows)
}

// GetScheduledCommentsForCard returns all pending scheduled comments for a specific card.
func (s *SQLStore) GetScheduledCommentsForCard(cardID string) ([]*model.Block, error) {
	return s.getScheduledCommentsForCard(s.db, cardID)
}

func (s *SQLStore) getScheduledCommentsForCard(db sq.BaseRunner, cardID string) ([]*model.Block, error) {
	scheduledAtExpr := s.jsonFieldExtractInt("fields", model.BlockFieldScheduledAt)
	scheduledStatusExpr := s.jsonFieldExtract("fields", model.BlockFieldScheduledStatus)

	query := s.getQueryBuilder(db).
		Select(s.blockFields("")...).
		From(s.tablePrefix + "blocks").
		Where(sq.Eq{"type": model.TypeComment}).
		Where(sq.Eq{"parent_id": cardID}).
		Where(sq.Eq{"delete_at": 0}).
		Where(sq.Eq{scheduledStatusExpr: model.ScheduledStatusPending}).
		OrderBy(scheduledAtExpr + " ASC")

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("GetScheduledCommentsForCard error", mlog.Err(err), mlog.String("cardID", cardID))
		return nil, err
	}
	defer s.CloseRows(rows)

	return s.blocksFromRows(rows)
}

// GetScheduledCommentsCountByUser returns the count of pending scheduled comments for a specific user.
func (s *SQLStore) GetScheduledCommentsCountByUser(userID string) (int, error) {
	return s.getScheduledCommentsCountByUser(s.db, userID)
}

func (s *SQLStore) getScheduledCommentsCountByUser(db sq.BaseRunner, userID string) (int, error) {
	scheduledStatusExpr := s.jsonFieldExtract("fields", model.BlockFieldScheduledStatus)

	query := s.getQueryBuilder(db).
		Select("COUNT(*)").
		From(s.tablePrefix + "blocks").
		Where(sq.Eq{"type": model.TypeComment}).
		Where(sq.Eq{"created_by": userID}).
		Where(sq.Eq{"delete_at": 0}).
		Where(sq.Eq{scheduledStatusExpr: model.ScheduledStatusPending})

	row := query.QueryRow()

	var count int
	if err := row.Scan(&count); err != nil {
		s.logger.Error("GetScheduledCommentsCountByUser error", mlog.Err(err), mlog.String("userID", userID))
		return 0, err
	}

	return count, nil
}
