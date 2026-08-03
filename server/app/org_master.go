// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"
)

// Organization masters and user assignments are owned by the main server. This
// plugin reads them to decide card level access and never writes.

// GetOrgUnitsForTeam returns the active divisions and departments of a team,
// ordered by type then name. It never returns nil.
func (a *App) GetOrgUnitsForTeam(teamID string) ([]*model.OrgUnit, error) {
	units, err := a.store.GetOrgUnitsForTeam(teamID)
	if err != nil {
		return nil, err
	}
	if units == nil {
		return []*model.OrgUnit{}, nil
	}
	return units, nil
}

// GetDutiesForTeam returns the active 직책 of a team ordered by rank then name.
// 직위 (PositionDefinitions with Kind='position') is never included — FR-024.
// It never returns nil.
func (a *App) GetDutiesForTeam(teamID string) ([]*model.Duty, error) {
	duties, err := a.store.GetDutiesForTeam(teamID)
	if err != nil {
		return nil, err
	}
	if duties == nil {
		return []*model.Duty{}, nil
	}
	return duties, nil
}

// GetUserOrgProfiles reads the assignments of several users at once and returns
// them keyed by user ID.
//
// Two things happen here that callers must not have to think about:
//
//   - User IDs are deduplicated. The websocket fan-out builds its recipient
//     list through a path that does not deduplicate, and a repeated ID would
//     multiply the IN clause for no benefit.
//   - Assignments outside their effective window are dropped. A user whose
//     assignment has not started or has already ended is treated exactly like
//     one with no organization information at all (FR-021).
func (a *App) GetUserOrgProfiles(teamID string, userIDs []string) (map[string]*model.UserOrgProfile, error) {
	unique := dedupeStrings(userIDs)
	if len(unique) == 0 {
		return map[string]*model.UserOrgProfile{}, nil
	}

	profiles, err := a.store.GetUserOrgProfiles(teamID, unique)
	if err != nil {
		return nil, err
	}

	now := utils.GetMillis()
	byUserID := make(map[string]*model.UserOrgProfile, len(profiles))
	for _, profile := range profiles {
		if profile == nil || !profile.IsEffectiveAt(now) {
			continue
		}
		byUserID[profile.UserID] = profile
	}

	return byUserID, nil
}

// orgUnitAncestors returns the unit itself plus every ancestor up to the root.
//
// A division condition is satisfied when the requested division appears in this
// set, which keeps the rule independent of how deep the org chart happens to be
// (FR-017). The visited set also stops a malformed parent cycle from looping.
func orgUnitAncestors(units []*model.OrgUnit, unitID string) map[string]bool {
	ancestors := map[string]bool{}
	if unitID == "" {
		return ancestors
	}

	byID := make(map[string]*model.OrgUnit, len(units))
	for _, unit := range units {
		if unit != nil {
			byID[unit.ID] = unit
		}
	}

	for current := unitID; current != ""; {
		unit, ok := byID[current]
		if !ok || ancestors[current] {
			break
		}
		ancestors[current] = true
		current = unit.ParentID
	}

	return ancestors
}

func dedupeStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		unique = append(unique, value)
	}
	return unique
}
