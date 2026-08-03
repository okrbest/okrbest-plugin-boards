// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	sq "github.com/Masterminds/squirrel"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// Organization masters and user assignments are owned by the main server's Org
// Role Management feature. This plugin reads them and never writes.
// See docs/upstream-org-role-requests.md for the dependency notice.
//
// These tables carry no plugin table prefix — they belong to the main server.

func (s *SQLStore) getOrgUnitsForTeam(db sq.BaseRunner, teamID string) ([]*model.OrgUnit, error) {
	query := s.getQueryBuilder(db).
		Select("ID", "Name", "Type", "ParentID").
		From("OrgUnits").
		Where(sq.Eq{"TeamID": teamID}).
		Where(sq.Eq{"Active": true}).
		OrderBy("Type ASC", "Name ASC")

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("getOrgUnitsForTeam query error", mlog.String("teamID", teamID), mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	units := []*model.OrgUnit{}
	for rows.Next() {
		var unit model.OrgUnit
		if err := rows.Scan(&unit.ID, &unit.Name, &unit.Type, &unit.ParentID); err != nil {
			s.logger.Error("getOrgUnitsForTeam scan error", mlog.String("teamID", teamID), mlog.Err(err))
			return nil, err
		}
		units = append(units, &unit)
	}
	if err := rows.Err(); err != nil {
		s.logger.Error("getOrgUnitsForTeam rows error", mlog.String("teamID", teamID), mlog.Err(err))
		return nil, err
	}

	return units, nil
}

// getDutiesForTeam returns only Kind='duty' rows. Kind='position' (직위) is
// never used by this feature — see FR-024.
func (s *SQLStore) getDutiesForTeam(db sq.BaseRunner, teamID string) ([]*model.Duty, error) {
	query := s.getQueryBuilder(db).
		Select("ID", "Code", "Name", "Rank", "FullVisibility").
		From("PositionDefinitions").
		Where(sq.Eq{"TeamID": teamID}).
		Where(sq.Eq{"Kind": model.DutyKind}).
		Where(sq.Eq{"Active": true}).
		OrderBy("Rank ASC", "Name ASC")

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("getDutiesForTeam query error", mlog.String("teamID", teamID), mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	duties := []*model.Duty{}
	for rows.Next() {
		var duty model.Duty
		if err := rows.Scan(&duty.ID, &duty.Code, &duty.Name, &duty.Rank, &duty.FullVisibility); err != nil {
			s.logger.Error("getDutiesForTeam scan error", mlog.String("teamID", teamID), mlog.Err(err))
			return nil, err
		}
		duties = append(duties, &duty)
	}
	if err := rows.Err(); err != nil {
		s.logger.Error("getDutiesForTeam rows error", mlog.String("teamID", teamID), mlog.Err(err))
		return nil, err
	}

	return duties, nil
}

// getUserOrgProfiles reads the assignments of several users in one round trip.
// Callers must deduplicate userIDs first: a duplicated ID multiplies the IN
// clause for no benefit.
//
// PrimaryPositionID (직위) and ExtraPositions are deliberately not selected.
func (s *SQLStore) getUserOrgProfiles(db sq.BaseRunner, teamID string, userIDs []string) ([]*model.UserOrgProfile, error) {
	if len(userIDs) == 0 {
		return []*model.UserOrgProfile{}, nil
	}

	query := s.getQueryBuilder(db).
		Select("TeamID", "UserID", "PrimaryOrgUnitID", "PrimaryDutyID", "EffectiveFrom", "EffectiveTo").
		From("UserOrgProfiles").
		Where(sq.Eq{"TeamID": teamID}).
		Where(sq.Eq{"UserID": userIDs})

	rows, err := query.Query()
	if err != nil {
		s.logger.Error("getUserOrgProfiles query error", mlog.String("teamID", teamID), mlog.Err(err))
		return nil, err
	}
	defer s.CloseRows(rows)

	profiles := []*model.UserOrgProfile{}
	for rows.Next() {
		var profile model.UserOrgProfile
		if err := rows.Scan(
			&profile.TeamID,
			&profile.UserID,
			&profile.PrimaryOrgUnitID,
			&profile.PrimaryDutyID,
			&profile.EffectiveFrom,
			&profile.EffectiveTo,
		); err != nil {
			s.logger.Error("getUserOrgProfiles scan error", mlog.String("teamID", teamID), mlog.Err(err))
			return nil, err
		}
		profiles = append(profiles, &profile)
	}
	if err := rows.Err(); err != nil {
		s.logger.Error("getUserOrgProfiles rows error", mlog.String("teamID", teamID), mlog.Err(err))
		return nil, err
	}

	return profiles, nil
}
