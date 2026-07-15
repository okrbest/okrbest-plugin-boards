// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	"database/sql"
	"encoding/json"
	"errors"

	sq "github.com/Masterminds/squirrel"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (s *SQLStore) getOrgUnitsForTeam(db sq.BaseRunner, teamID string, includeInactive bool) ([]*model.ACLSubjectOption, error) {
	query := s.getQueryBuilder(db).
		Select("ID", "Name").
		From("OrgUnits").
		Where(sq.Eq{"TeamID": teamID}).
		Where(sq.Eq{"Type": "department"}).
		OrderBy("Name ASC")

	if !includeInactive {
		query = query.Where(sq.Eq{"Active": true})
	}

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("getOrgUnitsForTeam query error", mlog.Err(err), mlog.String("teamID", teamID))
		return nil, err
	}
	defer s.CloseRows(rows)

	options := []*model.ACLSubjectOption{}
	for rows.Next() {
		var option model.ACLSubjectOption
		if err := rows.Scan(&option.ID, &option.Name); err != nil {
			s.logger.Error("getOrgUnitsForTeam scan error", mlog.Err(err), mlog.String("teamID", teamID))
			return nil, err
		}
		options = append(options, &option)
	}
	if err := rows.Err(); err != nil {
		s.logger.Error("getOrgUnitsForTeam rows error", mlog.Err(err), mlog.String("teamID", teamID))
		return nil, err
	}

	return options, nil
}

func (s *SQLStore) getPositionsForTeam(db sq.BaseRunner, teamID string, includeInactive bool) ([]*model.ACLSubjectOption, error) {
	query := s.getQueryBuilder(db).
		Select("ID", "Name").
		From("PositionDefinitions").
		Where(sq.Eq{"TeamID": teamID}).
		OrderBy("Rank ASC", "Name ASC")

	if !includeInactive {
		query = query.Where(sq.Eq{"Active": true})
	}

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("getPositionsForTeam query error", mlog.Err(err), mlog.String("teamID", teamID))
		return nil, err
	}
	defer s.CloseRows(rows)

	options := []*model.ACLSubjectOption{}
	for rows.Next() {
		var option model.ACLSubjectOption
		if err := rows.Scan(&option.ID, &option.Name); err != nil {
			s.logger.Error("getPositionsForTeam scan error", mlog.Err(err), mlog.String("teamID", teamID))
			return nil, err
		}
		options = append(options, &option)
	}
	if err := rows.Err(); err != nil {
		s.logger.Error("getPositionsForTeam rows error", mlog.Err(err), mlog.String("teamID", teamID))
		return nil, err
	}

	return options, nil
}

func (s *SQLStore) GetFullVisibilityPositionIDs(teamID string) ([]string, error) {
	query := s.getQueryBuilder(s.db).
		Select("ID").
		From("PositionDefinitions").
		Where(sq.Eq{"TeamID": teamID}).
		Where(sq.Eq{"FullVisibility": true}).
		Where(sq.Eq{"Active": true})

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("getFullVisibilityPositionIDs query error", mlog.Err(err), mlog.String("teamID", teamID))
		return nil, err
	}
	defer s.CloseRows(rows)

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			s.logger.Error("getFullVisibilityPositionIDs scan error", mlog.Err(err), mlog.String("teamID", teamID))
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		s.logger.Error("getFullVisibilityPositionIDs rows error", mlog.Err(err), mlog.String("teamID", teamID))
		return nil, err
	}

	return ids, nil
}

func (s *SQLStore) GetUserOrgProfile(teamID, userID string) (*model.UserOrgProfile, error) {
	query := s.getQueryBuilder(s.db).
		Select("TeamID", "UserID", "PrimaryOrgUnitID", "PrimaryPositionID", "ExtraPositions").
		From("UserOrgProfiles").
		Where(sq.Eq{"TeamID": teamID}).
		Where(sq.Eq{"UserID": userID})

	row := query.QueryRow()
	profile := &model.UserOrgProfile{}
	extraPositionsRaw := "[]"
	if err := row.Scan(&profile.TeamID, &profile.UserID, &profile.PrimaryOrgUnitID, &profile.PrimaryPositionID, &extraPositionsRaw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		s.logger.Error("getUserOrgProfile scan error",
			mlog.String("teamID", teamID),
			mlog.String("userID", userID),
			mlog.Err(err),
		)
		return nil, err
	}

	if extraPositionsRaw != "" {
		if err := json.Unmarshal([]byte(extraPositionsRaw), &profile.ExtraPositions); err != nil {
			s.logger.Warn("getUserOrgProfile extra positions parse error",
				mlog.String("teamID", teamID),
				mlog.String("userID", userID),
				mlog.String("extraPositionsRaw", extraPositionsRaw),
				mlog.Err(err),
			)
			profile.ExtraPositions = []string{}
		}
	}

	return profile, nil
}
