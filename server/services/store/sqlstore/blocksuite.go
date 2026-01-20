// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	"database/sql"
	"fmt"

	sq "github.com/Masterminds/squirrel"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// GetBlockSuiteDocByCardID retrieves a BlockSuite document by card_id.
func (s *SQLStore) getBlockSuiteDocByCardID(db sq.BaseRunner, cardID string) (*model.BlockSuiteDoc, error) {
	query := s.getQueryBuilder(db).
		Select(
			"doc_id",
			"card_id",
			"board_id",
			"snapshot",
			"created_at",
			"updated_at",
			"created_by",
			"updated_by",
		).
		From(s.tablePrefix + "blocksuite_docs").
		Where(sq.Eq{"card_id": cardID})

	row := query.QueryRow()

	doc := &model.BlockSuiteDoc{}
	err := row.Scan(
		&doc.DocID,
		&doc.CardID,
		&doc.BoardID,
		&doc.Snapshot,
		&doc.CreatedAt,
		&doc.UpdatedAt,
		&doc.CreatedBy,
		&doc.UpdatedBy,
	)

	if err == sql.ErrNoRows {
		return nil, model.NewErrBlockSuiteDocNotFound(cardID)
	}
	if err != nil {
		s.logger.Error("GetBlockSuiteDocByCardID ERROR", mlog.String("card_id", cardID), mlog.Err(err))
		return nil, err
	}

	return doc, nil
}

// GetBlockSuiteDocInfoByCardID retrieves metadata (without snapshot) by card_id.
func (s *SQLStore) getBlockSuiteDocInfoByCardID(db sq.BaseRunner, cardID string) (*model.BlockSuiteDocInfo, error) {
	query := s.getQueryBuilder(db).
		Select(
			"doc_id",
			"card_id",
			"board_id",
			"created_at",
			"updated_at",
			"created_by",
			"updated_by",
		).
		From(s.tablePrefix + "blocksuite_docs").
		Where(sq.Eq{"card_id": cardID})

	row := query.QueryRow()

	info := &model.BlockSuiteDocInfo{}
	err := row.Scan(
		&info.DocID,
		&info.CardID,
		&info.BoardID,
		&info.CreatedAt,
		&info.UpdatedAt,
		&info.CreatedBy,
		&info.UpdatedBy,
	)

	if err == sql.ErrNoRows {
		return nil, model.NewErrBlockSuiteDocNotFound(cardID)
	}
	if err != nil {
		s.logger.Error("GetBlockSuiteDocInfoByCardID ERROR", mlog.String("card_id", cardID), mlog.Err(err))
		return nil, err
	}

	return info, nil
}

// UpsertBlockSuiteDoc inserts or updates a BlockSuite document.
func (s *SQLStore) upsertBlockSuiteDoc(db sq.BaseRunner, doc *model.BlockSuiteDoc) error {
	if err := doc.IsValid(); err != nil {
		return err
	}

	// Verify that the card exists
	cardExistsQuery := s.getQueryBuilder(db).
		Select("1").
		From(s.tablePrefix + "blocks").
		Where(sq.Eq{
			"id":   doc.CardID,
			"type": model.TypeCard,
		}).
		Limit(1)

	var exists int
	err := cardExistsQuery.QueryRow().Scan(&exists)
	if err == sql.ErrNoRows {
		return fmt.Errorf("card not found: %s", doc.CardID)
	}
	if err != nil {
		s.logger.Error("UpsertBlockSuiteDoc card validation ERROR",
			mlog.String("card_id", doc.CardID),
			mlog.Err(err))
		return err
	}

	// Build upsert query based on database type
	var query sq.InsertBuilder
	query = s.getQueryBuilder(db).
		Insert(s.tablePrefix + "blocksuite_docs").
		Columns(
			"doc_id",
			"card_id",
			"board_id",
			"snapshot",
			"created_at",
			"updated_at",
			"created_by",
			"updated_by",
		).
		Values(
			doc.DocID,
			doc.CardID,
			doc.BoardID,
			doc.Snapshot,
			doc.CreatedAt,
			doc.UpdatedAt,
			doc.CreatedBy,
			doc.UpdatedBy,
		)

	// Add database-specific upsert clause
	switch s.dbType {
	case model.PostgresDBType:
		query = query.Suffix(`
			ON CONFLICT (doc_id) 
			DO UPDATE SET 
				snapshot = EXCLUDED.snapshot,
				updated_at = EXCLUDED.updated_at,
				updated_by = EXCLUDED.updated_by
		`)
	case model.MysqlDBType:
		query = query.Suffix(`
			ON DUPLICATE KEY UPDATE
				snapshot = VALUES(snapshot),
				updated_at = VALUES(updated_at),
				updated_by = VALUES(updated_by)
		`)
	case model.SqliteDBType:
		query = query.Suffix(`
			ON CONFLICT (doc_id)
			DO UPDATE SET
				snapshot = excluded.snapshot,
				updated_at = excluded.updated_at,
				updated_by = excluded.updated_by
		`)
	default:
		return fmt.Errorf("unsupported database type: %s", s.dbType)
	}

	_, err = query.Exec()
	if err != nil {
		s.logger.Error("UpsertBlockSuiteDoc ERROR",
			mlog.String("doc_id", doc.DocID),
			mlog.String("card_id", doc.CardID),
			mlog.Err(err))
		return err
	}

	return nil
}

// DeleteBlockSuiteDocByCardID deletes a BlockSuite document by card_id.
func (s *SQLStore) deleteBlockSuiteDocByCardID(db sq.BaseRunner, cardID string) error {
	query := s.getQueryBuilder(db).
		Delete(s.tablePrefix + "blocksuite_docs").
		Where(sq.Eq{"card_id": cardID})

	result, err := query.Exec()
	if err != nil {
		s.logger.Error("DeleteBlockSuiteDocByCardID ERROR", mlog.String("card_id", cardID), mlog.Err(err))
		return err
	}

	// Note: We don't check rowsAffected here because it's okay if the document doesn't exist
	// (e.g., when deleting a card that never had a BlockSuite doc)
	_, err = result.RowsAffected()
	if err != nil {
		return err
	}

	return nil
}

