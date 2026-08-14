// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// Duty tiers — the named duty sets a team's card access rules point at.
//
// They live on the team rather than on a board because which duties count as
// C-Level is a fact about the company. Storing them per board lets two boards
// disagree about the same person, and nobody finds out until someone cannot see
// a card they should (009 R5).
//
// That placement is also why editing them is not a board admin's job. One edit
// reaches every board in the team, so it takes a system admin or a team admin —
// which this plugin already tells apart, and already treats a team admin as an
// admin of every board in the team (boards.go, GetMembersForBoard).

// CanEditDutyTiers reports whether the user may change the team's tiers.
//
// Reading is a separate question and a wider one: a board admin has to see which
// duties "C-Level" stands for, or they cannot write a rule that points at it
// (FR-011c).
func (a *App) CanEditDutyTiers(userID, teamID string) bool {
	if userID == "" || teamID == "" {
		return false
	}
	if a.permissions.HasPermissionTo(userID, model.PermissionManageSystem) {
		return true
	}
	return a.permissions.HasPermissionToTeam(userID, teamID, model.PermissionManageTeam)
}

// GetDutyTiers returns the team's tiers, never nil.
//
// A team the store does not have is not an error — it is a team with no tiers,
// which is exactly what a team that never opened the dialog looks like.
func (a *App) GetDutyTiers(teamID string) ([]model.DutyTier, error) {
	// GetTeam is not the way in. It answers "what is this team called" from the
	// main server's Teams table and leaves Settings empty, so reading tiers
	// through it silently returns none however many are stored.
	settings, err := a.store.GetTeamSettings(teamID)
	if err != nil {
		return nil, err
	}

	tiers, err := model.DutyTiersFromSettings(settings)
	if err != nil {
		return nil, err
	}
	if tiers == nil {
		return []model.DutyTier{}, nil
	}

	return tiers, nil
}

// SetDutyTiers replaces the team's tiers.
//
// The permission check comes first so a caller with no business here never
// reaches the store, and the validation second so a refused set never lands
// half-written.
func (a *App) SetDutyTiers(userID, teamID string, tiers []model.DutyTier) error {
	if !a.CanEditDutyTiers(userID, teamID) {
		return model.NewErrPermission("access denied: duty tiers are managed by team admins")
	}

	if err := model.ValidateDutyTiers(tiers); err != nil {
		return err
	}

	// Read the plugin's own settings row rather than the team, so the other keys
	// sharing this bag survive the write.
	existing, err := a.store.GetTeamSettings(teamID)
	if err != nil {
		return err
	}

	settings, err := model.DutyTiersIntoSettings(existing, tiers)
	if err != nil {
		return err
	}

	return a.store.UpsertTeamSettings(model.Team{
		ID:         teamID,
		Settings:   settings,
		ModifiedBy: userID,
	})
}
