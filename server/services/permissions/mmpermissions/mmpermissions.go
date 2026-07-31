// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package mmpermissions

import (
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

	if permission == model.PermissionCommentBoardCards {
		return resolved.Capabilities.CanCommentCard
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

	hasTeamAccess := s.HasPermissionToTeam(userID, board.TeamID, model.PermissionViewTeam)

	effective := model.EffectiveBoardPermissionNone
	derivedFrom := model.PermissionDerivedDeny

	legacyPermission := model.EffectiveBoardPermissionNone
	legacyDerivedFrom := model.PermissionDerivedDeny

	// Open boards keep the legacy minimum-role fallback for team participants.
	if hasTeamAccess && board.Type == model.BoardTypeOpen {
		switch board.MinimumRole {
		case "admin":
			legacyPermission = model.EffectiveBoardPermissionManage
		case "editor":
			legacyPermission = model.EffectiveBoardPermissionEdit
		case "commenter":
			legacyPermission = model.EffectiveBoardPermissionCommenter
		case "viewer":
			legacyPermission = model.EffectiveBoardPermissionView
		}
		if legacyPermission != model.EffectiveBoardPermissionNone {
			legacyDerivedFrom = model.PermissionDerivedMember
		}
	}

	member, err := s.store.GetMemberForBoard(boardID, userID)
	hasExplicitMember := false
	memberIsAdmin := false
	if !model.IsErrNotFound(err) {
		if err != nil {
			s.logger.Error("error getting member for board",
				mlog.String("boardID", boardID),
				mlog.String("userID", userID),
				mlog.Err(err),
			)
			return nil, err
		}
		hasExplicitMember = true

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
			memberPermission = model.EffectiveBoardPermissionManage
			memberIsAdmin = true
		} else if member.SchemeEditor {
			memberPermission = model.EffectiveBoardPermissionEdit
		} else if member.SchemeCommenter {
			memberPermission = model.EffectiveBoardPermissionCommenter
		} else if member.SchemeViewer {
			memberPermission = model.EffectiveBoardPermissionView
		}

		if model.EffectivePermissionRank(memberPermission) > model.EffectivePermissionRank(legacyPermission) {
			legacyPermission = memberPermission
			legacyDerivedFrom = model.PermissionDerivedMember
		}
	}

	// Team admins become board managers by default.
	if hasTeamAccess && hasExplicitMember && !memberIsAdmin && s.HasPermissionToTeam(userID, board.TeamID, model.PermissionManageTeam) {
		if model.EffectivePermissionRank(model.EffectiveBoardPermissionManage) > model.EffectivePermissionRank(legacyPermission) {
			legacyPermission = model.EffectiveBoardPermissionManage
			legacyDerivedFrom = model.PermissionDerivedTeam
		}
	}

	if model.EffectivePermissionRank(legacyPermission) > model.EffectivePermissionRank(effective) {
		effective = legacyPermission
		derivedFrom = legacyDerivedFrom
	}
	s.logger.Debug("GetBoardPermissions resolved",
		mlog.String("userID", userID),
		mlog.String("boardID", boardID),
		mlog.String("teamID", board.TeamID),
		mlog.Bool("hasTeamAccess", hasTeamAccess),
		mlog.String("derivedFrom", derivedFrom),
		mlog.String("effectivePermission", string(effective)),
	)

	return &model.BoardPermissionsResponse{
		BoardID:             boardID,
		EffectivePermission: effective,
		Capabilities:        model.BuildCapabilities(effective),
		DerivedFrom:         derivedFrom,
	}, nil
}
