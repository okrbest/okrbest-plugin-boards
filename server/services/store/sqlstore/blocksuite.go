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
		s.logger.Error("getBlockSuiteDocByCardID ERROR", mlog.String("card_id", cardID), mlog.Err(err))
		return nil, err
	}

	return doc, nil
}

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
		s.logger.Error("getBlockSuiteDocInfoByCardID ERROR", mlog.String("card_id", cardID), mlog.Err(err))
		return nil, err
	}

	return info, nil
}

func (s *SQLStore) upsertBlockSuiteDoc(db sq.BaseRunner, doc *model.BlockSuiteDoc) error {
	if err := doc.IsValid(); err != nil {
		return err
	}

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
		s.logger.Error("upsertBlockSuiteDoc card validation ERROR",
			mlog.String("card_id", doc.CardID),
			mlog.Err(err))
		return err
	}

	var query sq.InsertBuilder
	query = s.getQueryBuilder(db).
		Insert(s.tablePrefix+"blocksuite_docs").
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
		s.logger.Error("upsertBlockSuiteDoc ERROR",
			mlog.String("doc_id", doc.DocID),
			mlog.String("card_id", doc.CardID),
			mlog.Err(err))
		return err
	}

	return nil
}

func (s *SQLStore) getBlockSuiteDocsByBoardID(db sq.BaseRunner, boardID string) ([]*model.BlockSuiteDoc, error) {
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
		Where(sq.Eq{"board_id": boardID})

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("getBlockSuiteDocsByBoardID query ERROR", mlog.String("board_id", boardID), mlog.Err(err))
		return nil, err
	}
	defer rows.Close()

	var docs []*model.BlockSuiteDoc
	for rows.Next() {
		doc := &model.BlockSuiteDoc{}
		err := rows.Scan(
			&doc.DocID,
			&doc.CardID,
			&doc.BoardID,
			&doc.Snapshot,
			&doc.CreatedAt,
			&doc.UpdatedAt,
			&doc.CreatedBy,
			&doc.UpdatedBy,
		)
		if err != nil {
			s.logger.Error("getBlockSuiteDocsByBoardID scan ERROR", mlog.String("board_id", boardID), mlog.Err(err))
			return nil, err
		}
		docs = append(docs, doc)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return docs, nil
}

func (s *SQLStore) deleteBlockSuiteDocByCardID(db sq.BaseRunner, cardID string) error {
	query := s.getQueryBuilder(db).
		Delete(s.tablePrefix + "blocksuite_docs").
		Where(sq.Eq{"card_id": cardID})

	result, err := query.Exec()
	if err != nil {
		s.logger.Error("deleteBlockSuiteDocByCardID ERROR", mlog.String("card_id", cardID), mlog.Err(err))
		return err
	}

	_, err = result.RowsAffected()
	if err != nil {
		return err
	}

	return nil
}

func (s *SQLStore) getUnmigratedCardsWithContentBlocks(db sq.BaseRunner, limit int, offset int) ([]*model.UnmigratedCard, int64, error) {
	countQuery := s.getQueryBuilder(db).
		Select("COUNT(DISTINCT b.id)").
		From(s.tablePrefix + "blocks b").
		LeftJoin(s.tablePrefix + "blocksuite_docs d ON b.id = d.card_id").
		Where(sq.Eq{"b.type": model.TypeCard, "b.delete_at": 0}).
		Where("d.card_id IS NULL")

	var totalCount int64
	err := countQuery.QueryRow().Scan(&totalCount)
	if err != nil {
		s.logger.Error("getUnmigratedCardsWithContentBlocks count ERROR", mlog.Err(err))
		return nil, 0, err
	}

	if totalCount == 0 {
		return []*model.UnmigratedCard{}, 0, nil
	}

	cardIDsQuery := s.getQueryBuilder(db).
		Select("b.id").
		From(s.tablePrefix + "blocks b").
		LeftJoin(s.tablePrefix + "blocksuite_docs d ON b.id = d.card_id").
		Where(sq.Eq{"b.type": model.TypeCard, "b.delete_at": 0}).
		Where("d.card_id IS NULL").
		OrderBy("b.create_at ASC").
		Limit(uint64(limit)).
		Offset(uint64(offset))

	rows, err := cardIDsQuery.Query()
	if err != nil {
		s.logger.Error("getUnmigratedCardsWithContentBlocks cardIDs query ERROR", mlog.Err(err))
		return nil, 0, err
	}
	defer rows.Close()

	var cardIDs []string
	for rows.Next() {
		var cardID string
		if err := rows.Scan(&cardID); err != nil {
			return nil, 0, err
		}
		cardIDs = append(cardIDs, cardID)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	if len(cardIDs) == 0 {
		return []*model.UnmigratedCard{}, totalCount, nil
	}

	blocksQuery := s.getQueryBuilder(db).
		Select(s.blockFields("")...).
		From(s.tablePrefix + "blocks").
		Where(sq.Or{
			sq.Eq{"id": cardIDs},
			sq.And{
				sq.Eq{"parent_id": cardIDs},
				sq.Eq{"type": model.ContentBlockTypes},
				sq.Eq{"delete_at": 0},
			},
		})

	blockRows, err := blocksQuery.Query()
	if err != nil {
		s.logger.Error("getUnmigratedCardsWithContentBlocks blocks query ERROR", mlog.Err(err))
		return nil, 0, err
	}
	defer blockRows.Close()

	blocks, err := s.blocksFromRows(blockRows)
	if err != nil {
		return nil, 0, err
	}

	cardMap := make(map[string]*model.UnmigratedCard)
	for _, cardID := range cardIDs {
		cardMap[cardID] = &model.UnmigratedCard{
			ContentBlocks: []*model.Block{},
		}
	}

	for _, block := range blocks {
		if block.Type == model.TypeCard {
			if um, ok := cardMap[block.ID]; ok {
				um.Card = block
			}
		} else {
			if um, ok := cardMap[block.ParentID]; ok {
				um.ContentBlocks = append(um.ContentBlocks, block)
			}
		}
	}

	result := make([]*model.UnmigratedCard, 0, len(cardIDs))
	for _, cardID := range cardIDs {
		if um := cardMap[cardID]; um != nil && um.Card != nil {
			result = append(result, um)
		}
	}

	return result, totalCount, nil
}

func (s *SQLStore) getBlockSuiteMigrationStatus(db sq.BaseRunner) (*model.BlockSuiteMigrationStatus, error) {
	status := &model.BlockSuiteMigrationStatus{}

	totalCardsQuery := s.getQueryBuilder(db).
		Select("COUNT(*)").
		From(s.tablePrefix + "blocks").
		Where(sq.Eq{"type": model.TypeCard, "delete_at": 0})

	err := totalCardsQuery.QueryRow().Scan(&status.TotalCards)
	if err != nil {
		s.logger.Error("GetBlockSuiteMigrationStatus totalCards ERROR", mlog.Err(err))
		return nil, err
	}

	migratedCardsQuery := s.getQueryBuilder(db).
		Select("COUNT(*)").
		From(s.tablePrefix + "blocksuite_docs")

	err = migratedCardsQuery.QueryRow().Scan(&status.MigratedCards)
	if err != nil {
		s.logger.Error("GetBlockSuiteMigrationStatus migratedCards ERROR", mlog.Err(err))
		return nil, err
	}

	cardsWithContentBlocksQuery := s.getQueryBuilder(db).
		Select("COUNT(DISTINCT parent_id)").
		From(s.tablePrefix + "blocks").
		Where(sq.Eq{"type": model.ContentBlockTypes, "delete_at": 0})

	err = cardsWithContentBlocksQuery.QueryRow().Scan(&status.CardsWithContentBlocks)
	if err != nil {
		s.logger.Error("GetBlockSuiteMigrationStatus cardsWithContentBlocks ERROR", mlog.Err(err))
		return nil, err
	}

	notMigratedQuery := s.getQueryBuilder(db).
		Select("COUNT(DISTINCT b.parent_id)").
		From(s.tablePrefix + "blocks b").
		LeftJoin(s.tablePrefix + "blocksuite_docs d ON b.parent_id = d.card_id").
		Where(sq.Eq{"b.type": model.ContentBlockTypes, "b.delete_at": 0}).
		Where("d.card_id IS NULL")

	err = notMigratedQuery.QueryRow().Scan(&status.CardsWithContentBlocksNotMigrated)
	if err != nil {
		s.logger.Error("GetBlockSuiteMigrationStatus notMigrated ERROR", mlog.Err(err))
		return nil, err
	}

	contentBlockCountQuery := s.getQueryBuilder(db).
		Select("COUNT(*)").
		From(s.tablePrefix + "blocks").
		Where(sq.Eq{"type": model.ContentBlockTypes, "delete_at": 0})

	err = contentBlockCountQuery.QueryRow().Scan(&status.LegacyContentBlockCount)
	if err != nil {
		s.logger.Error("GetBlockSuiteMigrationStatus contentBlockCount ERROR", mlog.Err(err))
		return nil, err
	}

	if status.TotalCards > 0 {
		status.MigrationPercentage = float64(status.MigratedCards) / float64(status.TotalCards) * 100
	}

	status.IsMigrationComplete = status.MigratedCards >= status.TotalCards

	return status, nil
}
