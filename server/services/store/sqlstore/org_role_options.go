// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
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
