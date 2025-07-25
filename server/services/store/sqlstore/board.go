// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-boards/server/utils"
	mmModel "github.com/mattermost/mattermost/server/public/model"

	sq "github.com/Masterminds/squirrel"
	"github.com/mattermost/mattermost-plugin-boards/server/model"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func boardFields(tableAlias string) []string {
	if tableAlias != "" && !strings.HasSuffix(tableAlias, ".") {
		tableAlias += "."
	}

	return []string{
		tableAlias + "id",
		tableAlias + "team_id",
		"COALESCE(" + tableAlias + "channel_id, '')",
		"COALESCE(" + tableAlias + "created_by, '')",
		tableAlias + "modified_by",
		tableAlias + "type",
		tableAlias + "minimum_role",
		tableAlias + "title",
		tableAlias + "description",
		tableAlias + "icon",
		tableAlias + "show_description",
		tableAlias + "is_template",
		tableAlias + "template_version",
		"COALESCE(" + tableAlias + "properties, '{}')",
		"COALESCE(" + tableAlias + "card_properties, '[]')",
		tableAlias + "create_at",
		tableAlias + "update_at",
		tableAlias + "delete_at",
	}
}

func boardHistoryFields() []string {
	fields := []string{
		"id",
		"team_id",
		"COALESCE(channel_id, '')",
		"COALESCE(created_by, '')",
		"COALESCE(modified_by, '')",
		"type",
		"minimum_role",
		"COALESCE(title, '')",
		"COALESCE(description, '')",
		"COALESCE(icon, '')",
		"COALESCE(show_description, false)",
		"COALESCE(is_template, false)",
		"template_version",
		"COALESCE(properties, '{}')",
		"COALESCE(card_properties, '[]')",
		"COALESCE(create_at, 0)",
		"COALESCE(update_at, 0)",
		"COALESCE(delete_at, 0)",
	}

	return fields
}

var boardMemberFields = []string{
	"COALESCE(B.minimum_role, '')",
	"BM.board_id",
	"BM.user_id",
	"BM.roles",
	"BM.scheme_admin",
	"BM.scheme_editor",
	"BM.scheme_commenter",
	"BM.scheme_viewer",
}

func (s *SQLStore) boardsFromRows(rows *sql.Rows) ([]*model.Board, error) {
	boards := []*model.Board{}

	for rows.Next() {
		var board model.Board
		var propertiesBytes []byte
		var cardPropertiesBytes []byte

		err := rows.Scan(
			&board.ID,
			&board.TeamID,
			&board.ChannelID,
			&board.CreatedBy,
			&board.ModifiedBy,
			&board.Type,
			&board.MinimumRole,
			&board.Title,
			&board.Description,
			&board.Icon,
			&board.ShowDescription,
			&board.IsTemplate,
			&board.TemplateVersion,
			&propertiesBytes,
			&cardPropertiesBytes,
			&board.CreateAt,
			&board.UpdateAt,
			&board.DeleteAt,
		)
		if err != nil {
			s.logger.Error("boardsFromRows scan error", mlog.Err(err))
			return nil, err
		}

		err = json.Unmarshal(propertiesBytes, &board.Properties)
		if err != nil {
			s.logger.Error("board properties unmarshal error", mlog.Err(err))
			return nil, err
		}
		err = json.Unmarshal(cardPropertiesBytes, &board.CardProperties)
		if err != nil {
			s.logger.Error("board card properties unmarshal error", mlog.Err(err))
			return nil, err
		}

		boards = append(boards, &board)
	}

	return boards, nil
}

func (s *SQLStore) boardMembersFromRows(rows *sql.Rows) ([]*model.BoardMember, error) {
	boardMembers := []*model.BoardMember{}

	for rows.Next() {
		var boardMember model.BoardMember

		err := rows.Scan(
			&boardMember.MinimumRole,
			&boardMember.BoardID,
			&boardMember.UserID,
			&boardMember.Roles,
			&boardMember.SchemeAdmin,
			&boardMember.SchemeEditor,
			&boardMember.SchemeCommenter,
			&boardMember.SchemeViewer,
		)
		if err != nil {
			return nil, err
		}

		boardMembers = append(boardMembers, &boardMember)
	}

	return boardMembers, nil
}

func (s *SQLStore) boardMemberHistoryEntriesFromRows(rows *sql.Rows) ([]*model.BoardMemberHistoryEntry, error) {
	boardMemberHistoryEntries := []*model.BoardMemberHistoryEntry{}

	for rows.Next() {
		var boardMemberHistoryEntry model.BoardMemberHistoryEntry
		var insertAt sql.NullString

		err := rows.Scan(
			&boardMemberHistoryEntry.BoardID,
			&boardMemberHistoryEntry.UserID,
			&boardMemberHistoryEntry.Action,
			&insertAt,
		)
		if err != nil {
			return nil, err
		}

		// parse the insert_at timestamp which is different based on database type.
		dateTemplate := "2006-01-02T15:04:05Z0700"
		if s.dbType == model.MysqlDBType {
			dateTemplate = "2006-01-02 15:04:05.000000"
		}
		ts, err := time.Parse(dateTemplate, insertAt.String)
		if err != nil {
			return nil, fmt.Errorf("cannot parse datetime '%s' for board_members_history scan: %w", insertAt.String, err)
		}
		boardMemberHistoryEntry.InsertAt = ts

		boardMemberHistoryEntries = append(boardMemberHistoryEntries, &boardMemberHistoryEntry)
	}

	return boardMemberHistoryEntries, nil
}

func (s *SQLStore) getBoardByCondition(db sq.BaseRunner, conditions ...interface{}) (*model.Board, error) {
	boards, err := s.getBoardsByCondition(db, conditions...)
	if err != nil {
		return nil, err
	}

	return boards[0], nil
}

func (s *SQLStore) getBoardsByCondition(db sq.BaseRunner, conditions ...interface{}) ([]*model.Board, error) {
	return s.getBoardsFieldsByCondition(db, boardFields(""), conditions...)
}

func (s *SQLStore) getBoardsFieldsByCondition(db sq.BaseRunner, fields []string, conditions ...interface{}) ([]*model.Board, error) {
	query := s.getQueryBuilder(db).
		Select(fields...).
		From(s.tablePrefix + "boards")
	for _, c := range conditions {
		query = query.Where(c)
	}

	rows, err := query.Query()
	if err != nil {
		s.logger.Error(`getBoardsFieldsByCondition ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	boards, err := s.boardsFromRows(rows)
	if err != nil {
		return nil, err
	}

	if len(boards) == 0 {
		return nil, model.NewErrNotFound("boards")
	}

	return boards, nil
}

func (s *SQLStore) getBoard(db sq.BaseRunner, boardID string) (*model.Board, error) {
	return s.getBoardByCondition(db, sq.Eq{"id": boardID})
}

func (s *SQLStore) getBoardsInTeamByIds(db sq.BaseRunner, boardIDs []string, teamID string) ([]*model.Board, error) {
	query := s.getQueryBuilder(db).
		Select(boardFields("b.")...).
		From(s.tablePrefix + "boards as b").
		Where(sq.Eq{"b.team_id": teamID}).
		Where(sq.Eq{"b.id": boardIDs})

	rows, err := query.Query()
	if err != nil {
		s.logger.Error(`getBoardsInTeamByIds ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	boards, err := s.boardsFromRows(rows)
	if err != nil {
		return nil, err
	}

	if len(boards) != len(boardIDs) {
		s.logger.Warn("getBoardsInTeamByIds mismatched number of boards found",
			mlog.Int("len(boards)", len(boards)),
			mlog.Int("len(boardIDs)", len(boardIDs)),
		)
		return boards, model.NewErrNotAllFound("board", boardIDs)
	}

	return boards, nil
}

func (s *SQLStore) insertBoard(db sq.BaseRunner, board *model.Board, userID string) (*model.Board, error) {
	// Generate tracking IDs for in-built templates
	if board.IsTemplate && board.TeamID == model.GlobalTeamID {
		// Use SHA256 for FIPS compliance
		board.Properties["trackingTemplateId"] = fmt.Sprintf("%x", sha256.Sum256([]byte(board.Title)))
	}

	propertiesBytes, err := s.MarshalJSONB(board.Properties)
	if err != nil {
		s.logger.Error(
			"failed to marshal board.Properties",
			mlog.String("board_id", board.ID),
			mlog.String("board.Properties", fmt.Sprintf("%v", board.Properties)),
			mlog.Err(err),
		)
		return nil, err
	}

	cardPropertiesBytes, err := s.MarshalJSONB(board.CardProperties)
	if err != nil {
		s.logger.Error(
			"failed to marshal board.CardProperties",
			mlog.String("board_id", board.ID),
			mlog.String("board.CardProperties", fmt.Sprintf("%v", board.CardProperties)),
			mlog.Err(err),
		)
		return nil, err
	}

	existingBoard, err := s.getBoard(db, board.ID)
	if err != nil && !model.IsErrNotFound(err) {
		return nil, fmt.Errorf("insertBoard error occurred while fetching existing board %s: %w", board.ID, err)
	}

	insertQuery := s.getQueryBuilder(db).Insert("").
		Columns(boardFields("")...)

	now := utils.GetMillis()
	board.ModifiedBy = userID
	board.UpdateAt = now

	insertQueryValues := map[string]interface{}{
		"id":               board.ID,
		"team_id":          board.TeamID,
		"channel_id":       board.ChannelID,
		"created_by":       board.CreatedBy,
		"modified_by":      board.ModifiedBy,
		"type":             board.Type,
		"title":            board.Title,
		"minimum_role":     board.MinimumRole,
		"description":      board.Description,
		"icon":             board.Icon,
		"show_description": board.ShowDescription,
		"is_template":      board.IsTemplate,
		"template_version": board.TemplateVersion,
		"properties":       propertiesBytes,
		"card_properties":  cardPropertiesBytes,
		"create_at":        board.CreateAt,
		"update_at":        board.UpdateAt,
		"delete_at":        board.DeleteAt,
	}

	if existingBoard != nil {
		query := s.getQueryBuilder(db).Update(s.tablePrefix+"boards").
			Where(sq.Eq{"id": board.ID}).
			Set("modified_by", board.ModifiedBy).
			Set("type", board.Type).
			Set("channel_id", board.ChannelID).
			Set("minimum_role", board.MinimumRole).
			Set("title", board.Title).
			Set("description", board.Description).
			Set("icon", board.Icon).
			Set("show_description", board.ShowDescription).
			Set("is_template", board.IsTemplate).
			Set("template_version", board.TemplateVersion).
			Set("properties", propertiesBytes).
			Set("card_properties", cardPropertiesBytes).
			Set("update_at", board.UpdateAt).
			Set("delete_at", board.DeleteAt)

		if _, err := query.Exec(); err != nil {
			s.logger.Error(`InsertBoard error occurred while updating existing board`, mlog.String("boardID", board.ID), mlog.Err(err))
			return nil, fmt.Errorf("insertBoard error occurred while updating existing board %s: %w", board.ID, err)
		}
	} else {
		board.CreatedBy = userID
		board.CreateAt = now
		insertQueryValues["created_by"] = board.CreatedBy
		insertQueryValues["create_at"] = board.CreateAt

		query := insertQuery.SetMap(insertQueryValues).Into(s.tablePrefix + "boards")
		if _, err := query.Exec(); err != nil {
			return nil, fmt.Errorf("insertBoard error occurred while inserting board %s: %w", board.ID, err)
		}
	}

	// writing board history
	query := insertQuery.SetMap(insertQueryValues).Into(s.tablePrefix + "boards_history")
	if _, err := query.Exec(); err != nil {
		s.logger.Error("failed to insert board history", mlog.String("board_id", board.ID), mlog.Err(err))
		return nil, fmt.Errorf("failed to insert board %s history: %w", board.ID, err)
	}

	return board, nil
}

func (s *SQLStore) patchBoard(db sq.BaseRunner, boardID string, boardPatch *model.BoardPatch, userID string) (*model.Board, error) {
	existingBoard, err := s.getBoard(db, boardID)
	if err != nil {
		return nil, err
	}

	board := boardPatch.Patch(existingBoard)
	return s.insertBoard(db, board, userID)
}

func (s *SQLStore) deleteBoard(db sq.BaseRunner, boardID, userID string) error {
	return s.deleteBoardAndChildren(db, boardID, userID, false)
}

func (s *SQLStore) deleteBoardAndChildren(db sq.BaseRunner, boardID, userID string, keepChildren bool) error {
	now := utils.GetMillis()

	board, err := s.getBoard(db, boardID)
	if err != nil {
		return err
	}

	propertiesBytes, err := s.MarshalJSONB(board.Properties)
	if err != nil {
		return err
	}
	cardPropertiesBytes, err := s.MarshalJSONB(board.CardProperties)
	if err != nil {
		return err
	}

	insertQueryValues := map[string]interface{}{
		"id":               board.ID,
		"team_id":          board.TeamID,
		"channel_id":       board.ChannelID,
		"created_by":       board.CreatedBy,
		"modified_by":      userID,
		"type":             board.Type,
		"minimum_role":     board.MinimumRole,
		"title":            board.Title,
		"description":      board.Description,
		"icon":             board.Icon,
		"show_description": board.ShowDescription,
		"is_template":      board.IsTemplate,
		"template_version": board.TemplateVersion,
		"properties":       propertiesBytes,
		"card_properties":  cardPropertiesBytes,
		"create_at":        board.CreateAt,
		"update_at":        now,
		"delete_at":        now,
	}

	// writing board history
	insertQuery := s.getQueryBuilder(db).Insert("").
		Columns(boardHistoryFields()...)

	query := insertQuery.SetMap(insertQueryValues).Into(s.tablePrefix + "boards_history")
	if _, err := query.Exec(); err != nil {
		return err
	}

	deleteQuery := s.getQueryBuilder(db).
		Delete(s.tablePrefix + "boards").
		Where(sq.Eq{"id": boardID}).
		Where(sq.Eq{"COALESCE(team_id, '0')": board.TeamID})

	if _, err := deleteQuery.Exec(); err != nil {
		return err
	}

	if keepChildren {
		return nil
	}

	return s.deleteBlockChildren(db, boardID, "", userID)
}

func (s *SQLStore) insertBoardWithAdmin(db sq.BaseRunner, board *model.Board, userID string) (*model.Board, *model.BoardMember, error) {
	newBoard, err := s.insertBoard(db, board, userID)
	if err != nil {
		return nil, nil, err
	}

	bm := &model.BoardMember{
		BoardID:      newBoard.ID,
		UserID:       newBoard.CreatedBy,
		SchemeAdmin:  true,
		SchemeEditor: true,
	}

	nbm, err := s.saveMember(db, bm)
	if err != nil {
		return nil, nil, fmt.Errorf("cannot save member %s while inserting board %s: %w", bm.UserID, bm.BoardID, err)
	}

	return newBoard, nbm, nil
}

func (s *SQLStore) saveMember(db sq.BaseRunner, bm *model.BoardMember) (*model.BoardMember, error) {
	queryValues := map[string]interface{}{
		"board_id":         bm.BoardID,
		"user_id":          bm.UserID,
		"roles":            "",
		"scheme_admin":     bm.SchemeAdmin,
		"scheme_editor":    bm.SchemeEditor,
		"scheme_commenter": bm.SchemeCommenter,
		"scheme_viewer":    bm.SchemeViewer,
	}

	oldMember, err := s.getMemberForBoard(db, bm.BoardID, bm.UserID)
	if err != nil && !model.IsErrNotFound(err) {
		return nil, err
	}

	query := s.getQueryBuilder(db).
		Insert(s.tablePrefix + "board_members").
		SetMap(queryValues)

	if s.dbType == model.MysqlDBType {
		query = query.Suffix(
			"ON DUPLICATE KEY UPDATE scheme_admin = ?, scheme_editor = ?, scheme_commenter = ?, scheme_viewer = ?",
			bm.SchemeAdmin, bm.SchemeEditor, bm.SchemeCommenter, bm.SchemeViewer)
	} else {
		query = query.Suffix(
			`ON CONFLICT (board_id, user_id)
             DO UPDATE SET scheme_admin = EXCLUDED.scheme_admin, scheme_editor = EXCLUDED.scheme_editor,
			   scheme_commenter = EXCLUDED.scheme_commenter, scheme_viewer = EXCLUDED.scheme_viewer`,
		)
	}

	if _, err := query.Exec(); err != nil {
		return nil, err
	}

	if oldMember == nil {
		addToMembersHistory := s.getQueryBuilder(db).
			Insert(s.tablePrefix+"board_members_history").
			Columns("board_id", "user_id", "action").
			Values(bm.BoardID, bm.UserID, "created")

		if _, err := addToMembersHistory.Exec(); err != nil {
			return nil, err
		}
	}

	return bm, nil
}

func (s *SQLStore) deleteMember(db sq.BaseRunner, boardID, userID string) error {
	deleteQuery := s.getQueryBuilder(db).
		Delete(s.tablePrefix + "board_members").
		Where(sq.Eq{"board_id": boardID}).
		Where(sq.Eq{"user_id": userID})

	result, err := deleteQuery.Exec()
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected > 0 {
		addToMembersHistory := s.getQueryBuilder(db).
			Insert(s.tablePrefix+"board_members_history").
			Columns("board_id", "user_id", "action").
			Values(boardID, userID, "deleted")

		if _, err := addToMembersHistory.Exec(); err != nil {
			return err
		}
	}

	return nil
}

func (s *SQLStore) getMemberForBoard(db sq.BaseRunner, boardID, userID string) (*model.BoardMember, error) {
	query := s.getQueryBuilder(db).
		Select(boardMemberFields...).
		From(s.tablePrefix + "board_members AS BM").
		LeftJoin(s.tablePrefix + "boards AS B ON B.id=BM.board_id").
		Where(sq.Eq{"BM.board_id": boardID}).
		Where(sq.Eq{"BM.user_id": userID})

	rows, err := query.Query()
	if err != nil {
		s.logger.Error(`getMemberForBoard ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	members, err := s.boardMembersFromRows(rows)
	if err != nil {
		return nil, err
	}

	if len(members) == 0 {
		if userID == model.SystemUserID {
			return nil, model.NewErrNotFound(userID)
		}
		var user *model.User
		// No synthetic memberships for guests
		user, err := s.GetUserByID(userID)
		if err != nil {
			return nil, err
		}
		if user.IsGuest {
			return nil, model.NewErrNotFound("user is a guest")
		}

		b, boardErr := s.GetBoard(boardID)
		if boardErr != nil {
			return nil, boardErr
		}

		if b.ChannelID != "" {
			_, memberErr := s.servicesAPI.GetChannelMember(b.ChannelID, userID)
			if memberErr != nil {
				var appErr *mmModel.AppError
				if errors.As(memberErr, &appErr) && appErr.StatusCode == http.StatusNotFound {
					// Plugin API returns error if channel member doesn't exist.
					// We're fine if it doesn't exist, so its not an error for us.
					message := fmt.Sprintf("member BoardID=%s UserID=%s", boardID, userID)
					return nil, model.NewErrNotFound(message)
				}

				return nil, memberErr
			}

			return &model.BoardMember{
				BoardID:         boardID,
				UserID:          userID,
				Roles:           "editor",
				SchemeAdmin:     false,
				SchemeEditor:    true,
				SchemeCommenter: false,
				SchemeViewer:    false,
				Synthetic:       true,
			}, nil
		}
		if b.Type == model.BoardTypeOpen && b.IsTemplate {
			_, memberErr := s.servicesAPI.GetTeamMember(b.TeamID, userID)
			if memberErr != nil {
				var appErr *mmModel.AppError
				if errors.As(memberErr, &appErr) && appErr.StatusCode == http.StatusNotFound {
					return nil, model.NewErrNotFound(userID)
				}
				return nil, memberErr
			}

			return &model.BoardMember{
				BoardID:         boardID,
				UserID:          userID,
				Roles:           "viewer",
				SchemeAdmin:     false,
				SchemeEditor:    false,
				SchemeCommenter: false,
				SchemeViewer:    true,
				Synthetic:       true,
			}, nil
		}
		return nil, model.NewErrNotFound("member")
	}

	return members[0], nil
}

func (s *SQLStore) implicitBoardMembershipsFromRows(rows *sql.Rows) ([]*model.BoardMember, error) {
	boardMembers := []*model.BoardMember{}

	for rows.Next() {
		var boardMember model.BoardMember

		err := rows.Scan(
			&boardMember.UserID,
			&boardMember.BoardID,
		)
		if err != nil {
			return nil, err
		}
		boardMember.Roles = "editor"
		boardMember.SchemeEditor = true
		boardMember.Synthetic = true

		boardMembers = append(boardMembers, &boardMember)
	}

	return boardMembers, nil
}

func (s *SQLStore) getMembersForUser(db sq.BaseRunner, userID string) ([]*model.BoardMember, error) {
	query := s.getQueryBuilder(db).
		Select(boardMemberFields...).
		From(s.tablePrefix + "board_members AS BM").
		LeftJoin(s.tablePrefix + "boards AS B ON B.id=BM.board_id").
		Where(sq.Eq{"BM.user_id": userID})

	explicitMemberRows, err := query.Query()
	if err != nil {
		s.logger.Error(`getMembersForUser ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(explicitMemberRows)

	explicitMembers, err := s.boardMembersFromRows(explicitMemberRows)
	if err != nil {
		s.logger.Error(`getMembersForUser ERROR`, mlog.Err(err))
		return nil, err
	}

	user, err := s.GetUserByID(userID)
	if err != nil {
		return nil, err
	}
	if user.IsGuest {
		return explicitMembers, nil
	}

	implicitMembersQuery := s.getQueryBuilder(db).
		Select("CM.userID, B.Id").
		From(s.tablePrefix + "boards AS B").
		Join("ChannelMembers AS CM ON B.channel_id=CM.channelId").
		Where(sq.Eq{"CM.userID": userID})

	rows, err := implicitMembersQuery.Query()
	if err != nil {
		s.logger.Error(`getMembersForUser ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	members := []*model.BoardMember{}
	existingMembers := map[string]bool{}
	for _, m := range explicitMembers {
		members = append(members, m)
		existingMembers[m.BoardID] = true
	}

	implicitMembers, err := s.implicitBoardMembershipsFromRows(rows)
	if err != nil {
		return nil, err
	}
	for _, m := range implicitMembers {
		if !existingMembers[m.BoardID] {
			members = append(members, m)
		}
	}

	return members, nil
}

func (s *SQLStore) getMembersForBoard(db sq.BaseRunner, boardID string) ([]*model.BoardMember, error) {
	query := s.getQueryBuilder(db).
		Select(boardMemberFields...).
		From(s.tablePrefix + "board_members AS BM").
		LeftJoin(s.tablePrefix + "boards AS B ON B.id=BM.board_id").
		Where(sq.Eq{"BM.board_id": boardID})

	explicitMemberRows, err := query.Query()
	if err != nil {
		s.logger.Error(`getMembersForBoard ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(explicitMemberRows)

	explicitMembers, err := s.boardMembersFromRows(explicitMemberRows)
	if err != nil {
		s.logger.Error(`getMembersForBoard ERROR`, mlog.Err(err))
		return nil, err
	}

	implicitMembersQuery := s.getQueryBuilder(db).
		Select("CM.userID, B.Id").
		From(s.tablePrefix + "boards AS B").
		Join("ChannelMembers AS CM ON B.channel_id=CM.channelId").
		Join("Users as U on CM.userID = U.id").
		LeftJoin("Bots as bo on U.id = bo.UserID").
		Where(sq.Eq{"B.id": boardID}).
		Where(sq.NotEq{"B.channel_id": ""}).
		// Filter out guests as they don't have synthetic membership
		Where(sq.NotEq{"U.roles": "system_guest"}).
		Where(sq.Eq{"bo.UserId IS NOT NULL": false})

	rows, err := implicitMembersQuery.Query()
	if err != nil {
		s.logger.Error(`getMembersForBoard ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	implicitMembers, err := s.implicitBoardMembershipsFromRows(rows)
	if err != nil {
		return nil, err
	}
	members := []*model.BoardMember{}
	existingMembers := map[string]bool{}
	for _, m := range explicitMembers {
		members = append(members, m)
		existingMembers[m.UserID] = true
	}
	for _, m := range implicitMembers {
		if !existingMembers[m.UserID] {
			members = append(members, m)
		}
	}

	return members, nil
}

func (s *SQLStore) getBoardHistory(db sq.BaseRunner, boardID string, opts model.QueryBoardHistoryOptions) ([]*model.Board, error) {
	var order string
	if opts.Descending {
		order = " DESC "
	}

	query := s.getQueryBuilder(db).
		Select(boardHistoryFields()...).
		From(s.tablePrefix + "boards_history").
		Where(sq.Eq{"id": boardID}).
		OrderBy("insert_at " + order + ", update_at" + order)

	if opts.BeforeUpdateAt != 0 {
		query = query.Where(sq.Lt{"update_at": opts.BeforeUpdateAt})
	}

	if opts.AfterUpdateAt != 0 {
		query = query.Where(sq.Gt{"update_at": opts.AfterUpdateAt})
	}

	if opts.Limit != 0 {
		query = query.Limit(opts.Limit)
	}

	rows, err := query.Query()
	if err != nil {
		s.logger.Error(`getBoardHistory ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	return s.boardsFromRows(rows)
}

func (s *SQLStore) undeleteBoard(db sq.BaseRunner, boardID string, modifiedBy string) error {
	boards, err := s.getBoardHistory(db, boardID, model.QueryBoardHistoryOptions{Limit: 1, Descending: true})
	if err != nil {
		return err
	}

	if len(boards) == 0 {
		s.logger.Warn("undeleteBlock board not found", mlog.String("board_id", boardID))
		return nil // undeleting non-existing board is not considered an error (for now)
	}
	board := boards[0]

	if board.DeleteAt == 0 {
		s.logger.Warn("undeleteBlock board not deleted", mlog.String("board_id", board.ID))
		return nil // undeleting not deleted board is not considered an error (for now)
	}

	propertiesJSON, err := s.MarshalJSONB(board.Properties)
	if err != nil {
		return err
	}

	cardPropertiesJSON, err := s.MarshalJSONB(board.CardProperties)
	if err != nil {
		return err
	}

	now := utils.GetMillis()
	columns := []string{
		"id",
		"team_id",
		"channel_id",
		"created_by",
		"modified_by",
		"type",
		"title",
		"minimum_role",
		"description",
		"icon",
		"show_description",
		"is_template",
		"template_version",
		"properties",
		"card_properties",
		"create_at",
		"update_at",
		"delete_at",
	}

	values := []interface{}{
		board.ID,
		board.TeamID,
		"",
		board.CreatedBy,
		modifiedBy,
		board.Type,
		board.Title,
		board.MinimumRole,
		board.Description,
		board.Icon,
		board.ShowDescription,
		board.IsTemplate,
		board.TemplateVersion,
		propertiesJSON,
		cardPropertiesJSON,
		board.CreateAt,
		now,
		0,
	}
	insertHistoryQuery := s.getQueryBuilder(db).Insert(s.tablePrefix + "boards_history").
		Columns(columns...).
		Values(values...)
	insertQuery := s.getQueryBuilder(db).Insert(s.tablePrefix + "boards").
		Columns(columns...).
		Values(values...)

	if _, err := insertHistoryQuery.Exec(); err != nil {
		return err
	}

	if _, err := insertQuery.Exec(); err != nil {
		return err
	}

	return s.undeleteBlockChildren(db, board.ID, "", modifiedBy)
}

func (s *SQLStore) getBoardMemberHistory(db sq.BaseRunner, boardID, userID string, limit uint64) ([]*model.BoardMemberHistoryEntry, error) {
	query := s.getQueryBuilder(db).
		Select("board_id", "user_id", "action", "insert_at").
		From(s.tablePrefix + "board_members_history").
		Where(sq.Eq{"board_id": boardID}).
		Where(sq.Eq{"user_id": userID}).
		OrderBy("insert_at DESC")

	if limit > 0 {
		query = query.Limit(limit)
	}

	rows, err := query.Query()
	if err != nil {
		s.logger.Error(`getBoardMemberHistory ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	memberHistory, err := s.boardMemberHistoryEntriesFromRows(rows)
	if err != nil {
		return nil, err
	}

	return memberHistory, nil
}

func (s *SQLStore) getBoardsForUserAndTeam(db sq.BaseRunner, userID, teamID string, includePublicBoards bool) ([]*model.Board, error) {
	if includePublicBoards {
		boards, err := s.searchBoardsForUserInTeam(db, teamID, "", userID)
		if err != nil {
			return nil, err
		}
		return boards, nil
	}

	// retrieve only direct memberships for user
	// this is usually done for guests.
	members, err := s.getMembersForUser(db, userID)
	if err != nil {
		return nil, err
	}
	boardIDs := []string{}
	for _, m := range members {
		boardIDs = append(boardIDs, m.BoardID)
	}

	boards, err := s.getBoardsInTeamByIds(db, boardIDs, teamID)
	if model.IsErrNotFound(err) {
		if boards == nil {
			boards = []*model.Board{}
		}
		return boards, nil
	}
	if err != nil {
		return nil, err
	}

	return boards, nil
}

func (s *SQLStore) searchBoardsForUserInTeam(db sq.BaseRunner, teamID, term, userID string) ([]*model.Board, error) {
	// as we're joining three queries, we need to avoid numbered
	// placeholders until the join is done, so we use the default
	// question mark placeholder here
	builder := s.getQueryBuilder(db).PlaceholderFormat(sq.Question)

	openBoardsQ := builder.
		Select(boardFields("b.")...).
		From(s.tablePrefix + "boards as b").
		Where(sq.Eq{
			"b.is_template": false,
			"b.team_id":     teamID,
			"b.type":        model.BoardTypeOpen,
		})

	memberBoardsQ := builder.
		Select(boardFields("b.")...).
		From(s.tablePrefix + "boards AS b").
		Join(s.tablePrefix + "board_members AS bm on b.id = bm.board_id").
		Where(sq.Eq{
			"b.is_template": false,
			"b.team_id":     teamID,
			"bm.user_id":    userID,
		})

	channelMemberBoardsQ := builder.
		Select(boardFields("b.")...).
		From(s.tablePrefix + "boards AS b").
		Join("ChannelMembers AS cm on cm.channelId = b.channel_id").
		Where(sq.Eq{
			"b.is_template": false,
			"b.team_id":     teamID,
			"cm.userId":     userID,
		})

	if term != "" {
		// break search query into space separated words
		// and search for all words.
		// This should later be upgraded to industrial-strength
		// word tokenizer, that uses much more than space
		// to break words.

		conditions := sq.And{}

		for _, word := range strings.Split(strings.TrimSpace(term), " ") {
			conditions = append(conditions, sq.Like{"lower(b.title)": "%" + strings.ToLower(word) + "%"})
		}

		openBoardsQ = openBoardsQ.Where(conditions)
		memberBoardsQ = memberBoardsQ.Where(conditions)
		channelMemberBoardsQ = channelMemberBoardsQ.Where(conditions)
	}

	memberBoardsSQL, memberBoardsArgs, err := memberBoardsQ.ToSql()
	if err != nil {
		return nil, fmt.Errorf("SearchBoardsForUserInTeam error getting memberBoardsSQL: %w", err)
	}

	channelMemberBoardsSQL, channelMemberBoardsArgs, err := channelMemberBoardsQ.ToSql()
	if err != nil {
		return nil, fmt.Errorf("SearchBoardsForUserInTeam error getting channelMemberBoardsSQL: %w", err)
	}

	unionQ := openBoardsQ.
		Prefix("(").
		Suffix(") UNION ("+memberBoardsSQL, memberBoardsArgs...).
		Suffix(") UNION ("+channelMemberBoardsSQL+")", channelMemberBoardsArgs...)

	unionSQL, unionArgs, err := unionQ.ToSql()
	if err != nil {
		return nil, fmt.Errorf("SearchBoardsForUserInTeam error getting unionSQL: %w", err)
	}

	// if we're using postgres or sqlite, we need to replace the
	// question mark placeholder with the numbered dollar one, now
	// that the full query is built
	if s.dbType == model.PostgresDBType || s.dbType == model.SqliteDBType {
		var rErr error
		unionSQL, rErr = sq.Dollar.ReplacePlaceholders(unionSQL)
		if rErr != nil {
			return nil, fmt.Errorf("SearchBoardsForUserInTeam unable to replace unionSQL placeholders: %w", rErr)
		}
	}

	rows, err := db.Query(unionSQL, unionArgs...)
	if err != nil {
		s.logger.Error(`searchBoardsForUserInTeam ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	return s.boardsFromRows(rows)
}

func (s *SQLStore) searchBoardsForUser(db sq.BaseRunner, term string, searchField model.BoardSearchField, userID string, includePublicBoards bool) ([]*model.Board, error) {
	// as we're joining three queries, we need to avoid numbered
	// placeholders until the join is done, so we use the default
	// question mark placeholder here
	builder := s.getQueryBuilder(db).PlaceholderFormat(sq.Question)

	boardMembersQ := builder.
		Select(boardFields("b.")...).
		From(s.tablePrefix + "boards as b").
		Join(s.tablePrefix + "board_members as bm on b.id=bm.board_id").
		Where(sq.Eq{
			"b.is_template": false,
			"bm.user_id":    userID,
		})

	teamMembersQ := builder.
		Select(boardFields("b.")...).
		From(s.tablePrefix + "boards as b").
		Join("TeamMembers as tm on tm.teamid=b.team_id").
		Where(sq.Eq{
			"b.is_template": false,
			"tm.userID":     userID,
			"tm.deleteAt":   0,
			"b.type":        model.BoardTypeOpen,
		})

	channelMembersQ := builder.
		Select(boardFields("b.")...).
		From(s.tablePrefix + "boards as b").
		Join("ChannelMembers as cm on cm.channelId=b.channel_id").
		Where(sq.Eq{
			"b.is_template": false,
			"cm.userId":     userID,
		})

	if term != "" {
		if searchField == model.BoardSearchFieldPropertyName {
			var where, whereTerm string
			switch s.dbType {
			case model.PostgresDBType:
				where = "b.properties->? is not null"
				whereTerm = term
			case model.MysqlDBType, model.SqliteDBType:
				where = "JSON_EXTRACT(b.properties, ?) IS NOT NULL"
				whereTerm = "$." + term
			default:
				where = "b.properties LIKE ?"
				whereTerm = "%\"" + term + "\"%"
			}
			boardMembersQ = boardMembersQ.Where(where, whereTerm)
			teamMembersQ = teamMembersQ.Where(where, whereTerm)
			channelMembersQ = channelMembersQ.Where(where, whereTerm)
		} else { // model.BoardSearchFieldTitle
			// break search query into space separated words
			// and search for all words.
			// This should later be upgraded to industrial-strength
			// word tokenizer, that uses much more than space
			// to break words.
			conditions := sq.And{}
			for _, word := range strings.Split(strings.TrimSpace(term), " ") {
				conditions = append(conditions, sq.Like{"lower(b.title)": "%" + strings.ToLower(word) + "%"})
			}

			boardMembersQ = boardMembersQ.Where(conditions)
			teamMembersQ = teamMembersQ.Where(conditions)
			channelMembersQ = channelMembersQ.Where(conditions)
		}
	}

	teamMembersSQL, teamMembersArgs, err := teamMembersQ.ToSql()
	if err != nil {
		return nil, fmt.Errorf("SearchBoardsForUser error getting teamMembersSQL: %w", err)
	}

	channelMembersSQL, channelMembersArgs, err := channelMembersQ.ToSql()
	if err != nil {
		return nil, fmt.Errorf("SearchBoardsForUser error getting channelMembersSQL: %w", err)
	}

	unionQ := boardMembersQ
	user, err := s.getUserByID(db, userID)
	if err != nil {
		return nil, err
	}
	// NOTE: theoretically, could do e.g. `isGuest := !includePublicBoards`
	// but that introduces some tight coupling + fragility
	if !user.IsGuest {
		unionQ = unionQ.
			Prefix("(").
			Suffix(") UNION ("+channelMembersSQL+")", channelMembersArgs...)
		if includePublicBoards {
			unionQ = unionQ.Suffix(" UNION ("+teamMembersSQL+")", teamMembersArgs...)
		}
	} else if includePublicBoards {
		unionQ = unionQ.
			Prefix("(").
			Suffix(") UNION ("+teamMembersSQL+")", teamMembersArgs...)
	}

	unionSQL, unionArgs, err := unionQ.ToSql()
	if err != nil {
		return nil, fmt.Errorf("SearchBoardsForUser error getting unionSQL: %w", err)
	}

	// if we're using postgres or sqlite, we need to replace the
	// question mark placeholder with the numbered dollar one, now
	// that the full query is built
	if s.dbType == model.PostgresDBType || s.dbType == model.SqliteDBType {
		var rErr error
		unionSQL, rErr = sq.Dollar.ReplacePlaceholders(unionSQL)
		if rErr != nil {
			return nil, fmt.Errorf("SearchBoardsForUser unable to replace unionSQL placeholders: %w", rErr)
		}
	}

	rows, err := db.Query(unionSQL, unionArgs...)
	if err != nil {
		s.logger.Error(`searchBoardsForUser ERROR`, mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	return s.boardsFromRows(rows)
}
