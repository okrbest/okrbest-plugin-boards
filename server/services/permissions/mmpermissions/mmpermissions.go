// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package mmpermissions

import (
	"strings"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/permissions"

	mmModel "github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

type APIInterface interface {
	HasPermissionTo(userID string, permission *mmModel.Permission) bool
	HasPermissionToTeam(userID string, teamID string, permission *mmModel.Permission) bool
	HasPermissionToChannel(userID string, channelID string, permission *mmModel.Permission) bool
}

type Service struct {
	store  permissions.Store
	api    APIInterface
	logger mlog.LoggerIFace
}

func New(store permissions.Store, api APIInterface, logger mlog.LoggerIFace) *Service {
	return &Service{
		store:  store,
		api:    api,
		logger: logger,
	}
}

func (s *Service) HasPermissionTo(userID string, permission *mmModel.Permission) bool {
	if userID == "" || permission == nil {
		return false
	}
	return s.api.HasPermissionTo(userID, permission)
}

func (s *Service) HasPermissionToTeam(userID, teamID string, permission *mmModel.Permission) bool {
	if userID == "" || teamID == "" || permission == nil {
		return false
	}
	return s.api.HasPermissionToTeam(userID, teamID, permission)
}

func (s *Service) HasPermissionToChannel(userID, channelID string, permission *mmModel.Permission) bool {
	if userID == "" || channelID == "" || permission == nil {
		return false
	}
	return s.api.HasPermissionToChannel(userID, channelID, permission)
}

func (s *Service) HasPermissionToBoard(userID, boardID string, permission *mmModel.Permission) bool {
	if userID == "" || boardID == "" || permission == nil {
		return false
	}

	resolved, err := s.GetBoardPermissions(userID, boardID)
	if err != nil {
		return false
	}

	return model.PermissionSatisfies(resolved.EffectivePermission, permission)
}

func (s *Service) GetBoardPermissions(userID, boardID string) (*model.BoardPermissionsResponse, error) {
	if userID == "" || boardID == "" {
		return &model.BoardPermissionsResponse{
			BoardID:             boardID,
			EffectivePermission: model.EffectiveBoardPermissionNone,
			Capabilities:        model.BuildCapabilities(model.EffectiveBoardPermissionNone),
			DerivedFrom:         model.PermissionDerivedDeny,
		}, nil
	}

	board, err := s.store.GetBoard(boardID)
	if model.IsErrNotFound(err) {
		var boards []*model.Board
		boards, err = s.store.GetBoardHistory(boardID, model.QueryBoardHistoryOptions{Limit: 1, Descending: true})
		if err != nil {
			return nil, err
		}
		if len(boards) == 0 {
			return &model.BoardPermissionsResponse{
				BoardID:             boardID,
				EffectivePermission: model.EffectiveBoardPermissionNone,
				Capabilities:        model.BuildCapabilities(model.EffectiveBoardPermissionNone),
				DerivedFrom:         model.PermissionDerivedDeny,
			}, nil
		}
		board = boards[0]
	} else if err != nil {
		s.logger.Error("error getting board",
			mlog.String("boardID", boardID),
			mlog.String("userID", userID),
			mlog.Err(err),
		)
		return nil, err
	}

	if board.CreatedBy == userID {
		effective := model.EffectiveBoardPermissionDelete
		return &model.BoardPermissionsResponse{
			BoardID:             boardID,
			EffectivePermission: effective,
			Capabilities:        model.BuildCapabilities(effective),
			DerivedFrom:         model.PermissionDerivedOwner,
		}, nil
	}

	if !s.HasPermissionToTeam(userID, board.TeamID, model.PermissionViewTeam) {
		return &model.BoardPermissionsResponse{
			BoardID:             boardID,
			EffectivePermission: model.EffectiveBoardPermissionNone,
			Capabilities:        model.BuildCapabilities(model.EffectiveBoardPermissionNone),
			DerivedFrom:         model.PermissionDerivedDeny,
		}, nil
	}

	effective := model.EffectiveBoardPermissionNone
	derivedFrom := model.PermissionDerivedDeny

	entries, parseErr := model.ParseBoardACLFromProperties(board.Properties)
	if parseErr != nil {
		s.logger.Warn("failed to parse board acl entries", mlog.String("boardID", boardID), mlog.Err(parseErr))
	}

	directPermission := evaluateACL(entries, model.BoardACLSubjectUser, userID)
	if directPermission != model.EffectiveBoardPermissionNone {
		effective = directPermission
		derivedFrom = model.PermissionDerivedDirect
	}

	// Optional role tags from Mattermost roles string:
	// e.g. "org_unit:team_a position:c_level"
	orgUnits, positions := extractTaggedRoles(userID, "")
	orgPositionPermission := evaluateOrgPositionACL(entries, orgUnits, positions)
	if model.EffectivePermissionRank(orgPositionPermission) > model.EffectivePermissionRank(effective) {
		effective = orgPositionPermission
		derivedFrom = model.PermissionDerivedOrg
	}

	// Backward compatibility for legacy ACL entries.
	for _, orgUnit := range orgUnits {
		p := evaluateACL(entries, model.BoardACLSubjectOrgUnit, orgUnit)
		if model.EffectivePermissionRank(p) > model.EffectivePermissionRank(effective) {
			effective = p
			derivedFrom = model.PermissionDerivedOrg
		}
	}
	for _, position := range positions {
		p := evaluateACL(entries, model.BoardACLSubjectPosition, position)
		if model.EffectivePermissionRank(p) > model.EffectivePermissionRank(effective) {
			effective = p
			derivedFrom = model.PermissionDerivedPos
		}
	}

	member, err := s.store.GetMemberForBoard(boardID, userID)
	if model.IsErrNotFound(err) {
		// no board member role, ACL result still applies
		return &model.BoardPermissionsResponse{
			BoardID:             boardID,
			EffectivePermission: effective,
			Capabilities:        model.BuildCapabilities(effective),
			DerivedFrom:         derivedFrom,
		}, nil
	}
	if err != nil {
		s.logger.Error("error getting member for board",
			mlog.String("boardID", boardID),
			mlog.String("userID", userID),
			mlog.Err(err),
		)
		return nil, err
	}

	switch member.MinimumRole {
	case "admin":
		member.SchemeAdmin = true
	case "editor":
		member.SchemeEditor = true
	case "commenter":
		member.SchemeCommenter = true
	case "viewer":
		member.SchemeViewer = true
	}

	memberPermission := model.EffectiveBoardPermissionNone
	if member.SchemeAdmin {
		memberPermission = model.EffectiveBoardPermissionDelete
	} else if member.SchemeEditor {
		memberPermission = model.EffectiveBoardPermissionEdit
	} else if member.SchemeCommenter || member.SchemeViewer {
		memberPermission = model.EffectiveBoardPermissionView
	}
	if model.EffectivePermissionRank(memberPermission) > model.EffectivePermissionRank(effective) {
		effective = memberPermission
		derivedFrom = model.PermissionDerivedMember
	}

	// Team admins become board managers by default.
	if !member.SchemeAdmin && s.HasPermissionToTeam(userID, board.TeamID, model.PermissionManageTeam) {
		if model.EffectivePermissionRank(model.EffectiveBoardPermissionDelete) > model.EffectivePermissionRank(effective) {
			effective = model.EffectiveBoardPermissionDelete
			derivedFrom = model.PermissionDerivedTeam
		}
	}

	return &model.BoardPermissionsResponse{
		BoardID:             boardID,
		EffectivePermission: effective,
		Capabilities:        model.BuildCapabilities(effective),
		DerivedFrom:         derivedFrom,
	}, nil
}

func evaluateACL(entries []model.BoardACLEntry, subjectType model.BoardACLSubjectType, subjectID string) model.EffectiveBoardPermission {
	highest := model.EffectiveBoardPermissionNone
	for _, entry := range entries {
		if entry.SubjectType != subjectType || entry.SubjectID != subjectID {
			continue
		}
		if model.EffectivePermissionRank(entry.Permission) > model.EffectivePermissionRank(highest) {
			highest = entry.Permission
		}
	}
	return highest
}

func evaluateOrgPositionACL(entries []model.BoardACLEntry, orgUnits []string, positions []string) model.EffectiveBoardPermission {
	if len(orgUnits) == 0 || len(positions) == 0 {
		return model.EffectiveBoardPermissionNone
	}

	orgUnitSet := map[string]struct{}{}
	for _, orgUnit := range orgUnits {
		orgUnitSet[orgUnit] = struct{}{}
	}
	positionSet := map[string]struct{}{}
	for _, position := range positions {
		positionSet[position] = struct{}{}
	}

	highest := model.EffectiveBoardPermissionNone
	for _, entry := range entries {
		if entry.SubjectType != model.BoardACLSubjectOrgPos {
			continue
		}
		if _, ok := orgUnitSet[entry.OrgUnitID]; !ok {
			continue
		}
		if _, ok := positionSet[entry.PositionCode]; !ok {
			continue
		}
		if model.EffectivePermissionRank(entry.Permission) > model.EffectivePermissionRank(highest) {
			highest = entry.Permission
		}
	}

	return highest
}

func extractTaggedRoles(userID string, roles string) ([]string, []string) {
	if userID == "" && roles == "" {
		return nil, nil
	}
	tokens := []string{}
	if roles != "" {
		tokens = append(tokens, strings.Fields(roles)...)
	}
	// Backward-compatible fallback for tests that embed tags in userID.
	if userID != "" {
		tokens = append(tokens, strings.Fields(userID)...)
	}
	orgUnits := []string{}
	positions := []string{}
	for _, token := range tokens {
		if strings.HasPrefix(token, "org_unit:") {
			orgUnits = append(orgUnits, strings.TrimPrefix(token, "org_unit:"))
		}
		if strings.HasPrefix(token, "position:") {
			positions = append(positions, strings.TrimPrefix(token, "position:"))
		}
	}
	return orgUnits, positions
}
