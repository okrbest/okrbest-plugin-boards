// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	"database/sql"
	"encoding/json"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	"github.com/mattermost/mattermost/server/public/shared/mlog"

	sq "github.com/Masterminds/squirrel"
)

var (
	teamFields = []string{
		"id",
		"signup_token",
		"COALESCE(settings, '{}')",
		"modified_by",
		"update_at",
	}
)

func (s *SQLStore) upsertTeamSignupToken(db sq.BaseRunner, team model.Team) error {
	now := utils.GetMillis()

	query := s.getQueryBuilder(db).
		Insert(s.tablePrefix+"teams").
		Columns(
			"id",
			"signup_token",
			"modified_by",
			"update_at",
		).
		Values(
			team.ID,
			team.SignupToken,
			team.ModifiedBy,
			now,
		)
	if s.dbType == model.MysqlDBType {
		query = query.Suffix("ON DUPLICATE KEY UPDATE signup_token = ?, modified_by = ?, update_at = ?",
			team.SignupToken, team.ModifiedBy, now)
	} else {
		query = query.Suffix(
			`ON CONFLICT (id)
			 DO UPDATE SET signup_token = EXCLUDED.signup_token, modified_by = EXCLUDED.modified_by, update_at = EXCLUDED.update_at`,
		)
	}

	_, err := query.Exec()
	return err
}

func (s *SQLStore) upsertTeamSettings(db sq.BaseRunner, team model.Team) error {
	now := utils.GetMillis()
	signupToken := utils.NewID(utils.IDTypeToken)

	settingsJSON, err := json.Marshal(team.Settings)
	if err != nil {
		return err
	}

	query := s.getQueryBuilder(db).
		Insert(s.tablePrefix+"teams").
		Columns(
			"id",
			"signup_token",
			"settings",
			"modified_by",
			"update_at",
		).
		Values(
			team.ID,
			signupToken,
			settingsJSON,
			team.ModifiedBy,
			now,
		)
	if s.dbType == model.MysqlDBType {
		query = query.Suffix("ON DUPLICATE KEY UPDATE settings = ?, modified_by = ?, update_at = ?", settingsJSON, team.ModifiedBy, now)
	} else {
		query = query.Suffix(
			`ON CONFLICT (id)
			 DO UPDATE SET settings = EXCLUDED.settings, modified_by = EXCLUDED.modified_by, update_at = EXCLUDED.update_at`,
		)
	}

	_, err = query.Exec()
	return err
}

func (s *SQLStore) getTeamCount(db sq.BaseRunner) (int64, error) {
	query := s.getQueryBuilder(db).
		Select(
			"COUNT(*) AS count",
		).
		From(s.tablePrefix + "teams")

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("ERROR GetTeamCount", mlog.Err(err))
		return 0, err
	}
	defer s.CloseRows(rows)

	var count int64

	rows.Next()
	err = rows.Scan(&count)
	if err != nil {
		s.logger.Error("Failed to fetch team count", mlog.Err(err))
		return 0, err
	}
	return count, nil
}

func (s *SQLStore) teamsFromRows(rows *sql.Rows) ([]*model.Team, error) {
	teams := []*model.Team{}

	for rows.Next() {
		var team model.Team
		var settingsBytes []byte

		err := rows.Scan(
			&team.ID,
			&team.SignupToken,
			&settingsBytes,
			&team.ModifiedBy,
			&team.UpdateAt,
		)
		if err != nil {
			return nil, err
		}

		err = json.Unmarshal(settingsBytes, &team.Settings)
		if err != nil {
			return nil, err
		}

		teams = append(teams, &team)
	}

	return teams, nil
}

func (s *SQLStore) getAllTeams(db sq.BaseRunner) ([]*model.Team, error) {
	query := s.getQueryBuilder(db).
		Select(teamFields...).
		From(s.tablePrefix + "teams")
	rows, err := query.Query()
	if err != nil {
		s.logger.Error("ERROR GetAllTeams", mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	teams, err := s.teamsFromRows(rows)
	if err != nil {
		return nil, err
	}

	return teams, nil
}

func (s *SQLStore) getTeam(db sq.BaseRunner, id string) (*model.Team, error) {
	if id == "0" {
		team := model.Team{
			ID:    id,
			Title: "",
		}

		return &team, nil
	}

	query := s.getQueryBuilder(db).
		Select("DisplayName").
		From("Teams").
		Where(sq.Eq{"ID": id})

	row := query.QueryRow()
	var displayName string
	err := row.Scan(&displayName)
	if err != nil && !model.IsErrNotFound(err) {
		s.logger.Error("GetTeam scan error",
			mlog.String("team_id", id),
			mlog.Err(err),
		)
		return nil, err
	}

	return &model.Team{ID: id, Title: displayName}, nil
}

// getTeamSettings reads the settings bag this plugin keeps for a team.
//
// getTeam deliberately does not: it answers "what is this team called", which it
// takes from the main server's Teams table, and the plugin's own row may not
// exist at all. The settings live in the plugin's table and are read on their
// own so a team that never had any comes back empty rather than missing.
func (s *SQLStore) getTeamSettings(db sq.BaseRunner, id string) (map[string]interface{}, error) {
	query := s.getQueryBuilder(db).
		Select("COALESCE(settings, '{}')").
		From(s.tablePrefix + "teams").
		Where(sq.Eq{"id": id})

	row := query.QueryRow()

	var settingsBytes []byte
	if err := row.Scan(&settingsBytes); err != nil {
		if model.IsErrNotFound(err) {
			// A team with no row of its own has no settings, which is what every
			// team looks like until something writes one.
			return map[string]interface{}{}, nil
		}
		s.logger.Error("GetTeamSettings scan error",
			mlog.String("team_id", id),
			mlog.Err(err),
		)
		return nil, err
	}

	settings := map[string]interface{}{}
	if err := json.Unmarshal(settingsBytes, &settings); err != nil {
		return nil, err
	}

	return settings, nil
}

func (s *SQLStore) getTeamsForUser(db sq.BaseRunner, userID string) ([]*model.Team, error) {
	query := s.getQueryBuilder(db).
		Select("t.Id", "t.DisplayName").
		From("Teams as t").
		Join("TeamMembers as tm on t.Id=tm.TeamId").
		Where(sq.Eq{"tm.UserId": userID}).
		Where(sq.Eq{"tm.DeleteAt": 0}).
		Where(sq.Eq{"t.DeleteAt": 0})

	rows, err := query.Query()
	if err != nil {
		return nil, err
	}
	defer s.CloseRows(rows)

	teams := []*model.Team{}
	for rows.Next() {
		var team model.Team

		err := rows.Scan(
			&team.ID,
			&team.Title,
		)
		if err != nil {
			return nil, err
		}

		teams = append(teams, &team)
	}

	return teams, nil
}
