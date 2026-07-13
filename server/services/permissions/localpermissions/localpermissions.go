// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package localpermissions

import (
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/permissions"

	mmModel "github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

type Service struct {
	store  permissions.Store
	logger mlog.LoggerIFace
}

func New(store permissions.Store, logger mlog.LoggerIFace) *Service {
	return &Service{
		store:  store,
		logger: logger,
	}
}

func (s *Service) HasPermissionTo(userID string, permission *mmModel.Permission) bool {
	return false
}

func (s *Service) HasPermissionToTeam(userID, teamID string, permission *mmModel.Permission) bool {
	if userID == "" || teamID == "" || permission == nil {
		return false
	}
	if permission.Id == model.PermissionManageTeam.Id {
		return false
	}
	return true
}

func (s *Service) HasPermissionToChannel(userID, channelID string, permission *mmModel.Permission) bool {
	if userID == "" || channelID == "" || permission == nil {
		return false
	}
	return true
}

func (s *Service) HasPermissionToBoard(userID, boardID string, permission *mmModel.Permission) bool {
	if userID == "" || boardID == "" || permission == nil {
		return false
	}

	response, err := s.GetBoardPermissions(userID, boardID)
	if err != nil {
		return false
	}
	if permission == model.PermissionDeleteBoard {
		return response.IsOwner
	}
	return model.PermissionSatisfies(response.EffectivePermission, permission)
}

// ResolveOrgContext is always empty in local/standalone mode: there is no
// Mattermost user/org context available to resolve.
func (s *Service) ResolveOrgContext(userID string) (orgUnits []string, positions []string, isCEO bool) {
	return nil, nil, false
}

func (s *Service) GetBoardPermissions(userID, boardID string) (*model.BoardPermissionsResponse, error) {
	if userID == "" || boardID == "" {
		return &model.BoardPermissionsResponse{
			BoardID:             boardID,
			EffectivePermission: model.EffectiveBoardPermissionNone,
			Capabilities:        model.BuildCapabilities(model.EffectiveBoardPermissionNone, false),
			DerivedFrom:         model.PermissionDerivedDeny,
			IsOwner:             false,
		}, nil
	}

	member, err := s.store.GetMemberForBoard(boardID, userID)
	if model.IsErrNotFound(err) {
		return &model.BoardPermissionsResponse{
			BoardID:             boardID,
			EffectivePermission: model.EffectiveBoardPermissionNone,
			Capabilities:        model.BuildCapabilities(model.EffectiveBoardPermissionNone, false),
			DerivedFrom:         model.PermissionDerivedDeny,
			IsOwner:             false,
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

	effective := model.EffectiveBoardPermissionNone
	if member.SchemeAdmin {
		effective = model.EffectiveBoardPermissionManage
	} else if member.SchemeEditor {
		effective = model.EffectiveBoardPermissionEdit
	} else if member.SchemeCommenter || member.SchemeViewer {
		effective = model.EffectiveBoardPermissionView
	}

	derivedFrom := model.PermissionDerivedMember
	return &model.BoardPermissionsResponse{
		BoardID:             boardID,
		EffectivePermission: effective,
		Capabilities:        model.BuildCapabilities(effective, false),
		DerivedFrom:         derivedFrom,
		IsOwner:             false,
	}, nil
}
