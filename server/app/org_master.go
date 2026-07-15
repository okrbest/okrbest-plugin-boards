// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

type orgRoleOptionsProvider interface {
	GetOrgUnitsForTeam(teamID string, includeInactive bool) ([]*model.ACLSubjectOption, error)
	GetPositionsForTeam(teamID string, includeInactive bool) ([]*model.ACLSubjectOption, error)
}

func (a *App) GetOrgUnitOptions(teamID string) ([]model.ACLSubjectOption, error) {
	if provider, ok := a.store.(orgRoleOptionsProvider); ok && teamID != "" {
		items, err := provider.GetOrgUnitsForTeam(teamID, false)
		if err != nil {
			return nil, err
		}
		options := make([]model.ACLSubjectOption, 0, len(items))
		for _, item := range items {
			if item == nil {
				continue
			}
			options = append(options, *item)
		}
		if len(options) > 0 {
			return normalizeSubjectOptions(options), nil
		}
	}

	options, err := a.getSubjectOptionsFromSystemSetting(model.OrgUnitsMasterKey)
	if err != nil {
		return nil, err
	}
	if len(options) > 0 {
		return options, nil
	}

	teams, err := a.store.GetAllTeams()
	if err != nil {
		return nil, err
	}

	result := make([]model.ACLSubjectOption, 0, len(teams))
	for _, team := range teams {
		if team == nil || team.ID == "" {
			continue
		}
		name := strings.TrimSpace(team.Title)
		if name == "" {
			name = team.ID
		}
		result = append(result, model.ACLSubjectOption{
			ID:   team.ID,
			Name: name,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

func (a *App) GetPositionOptions(teamID string) ([]model.ACLSubjectOption, error) {
	if provider, ok := a.store.(orgRoleOptionsProvider); ok && teamID != "" {
		items, err := provider.GetPositionsForTeam(teamID, false)
		if err != nil {
			return nil, err
		}
		options := make([]model.ACLSubjectOption, 0, len(items))
		for _, item := range items {
			if item == nil {
				continue
			}
			options = append(options, *item)
		}
		if len(options) > 0 {
			return normalizeSubjectOptions(options), nil
		}
	}

	return a.getSubjectOptionsFromSystemSetting(model.PositionsMasterKey)
}

func (a *App) getSubjectOptionsFromSystemSetting(key string) ([]model.ACLSubjectOption, error) {
	value, err := a.store.GetSystemSetting(key)
	if model.IsErrNotFound(err) || strings.TrimSpace(value) == "" {
		return []model.ACLSubjectOption{}, nil
	}
	if err != nil {
		return nil, err
	}

	options := []model.ACLSubjectOption{}
	if parseOptionsFromJSON(value, &options) {
		return normalizeSubjectOptions(options), nil
	}

	ids := []string{}
	if parseOptionsFromJSON(value, &ids) {
		normalized := make([]model.ACLSubjectOption, 0, len(ids))
		for _, id := range ids {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			normalized = append(normalized, model.ACLSubjectOption{ID: id, Name: id})
		}
		return normalizeSubjectOptions(normalized), nil
	}

	parts := strings.Split(value, ",")
	normalized := make([]model.ACLSubjectOption, 0, len(parts))
	for _, part := range parts {
		id := strings.TrimSpace(part)
		if id == "" {
			continue
		}
		normalized = append(normalized, model.ACLSubjectOption{ID: id, Name: id})
	}
	return normalizeSubjectOptions(normalized), nil
}

func parseOptionsFromJSON[T any](value string, target *T) bool {
	return json.Unmarshal([]byte(value), target) == nil
}

func normalizeSubjectOptions(options []model.ACLSubjectOption) []model.ACLSubjectOption {
	uniq := map[string]model.ACLSubjectOption{}
	for _, option := range options {
		id := strings.TrimSpace(option.ID)
		if id == "" {
			continue
		}
		name := strings.TrimSpace(option.Name)
		if name == "" {
			name = id
		}
		uniq[id] = model.ACLSubjectOption{ID: id, Name: name}
	}

	normalized := make([]model.ACLSubjectOption, 0, len(uniq))
	for _, option := range uniq {
		normalized = append(normalized, option)
	}
	sort.Slice(normalized, func(i, j int) bool {
		return strings.ToLower(normalized[i].Name) < strings.ToLower(normalized[j].Name)
	})
	return normalized
}
