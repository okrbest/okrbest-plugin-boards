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

type fullVisibilityPositionProvider interface {
	GetFullVisibilityPositionIDs(teamID string) ([]string, error)
}

type userOrgProfileProvider interface {
	GetUserOrgProfile(teamID, userID string) (*model.UserOrgProfile, error)
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

	if permission == model.PermissionDeleteBoard {
		return resolved.IsOwner
	}

	return model.PermissionSatisfies(resolved.EffectivePermission, permission)
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
				Capabilities:        model.BuildCapabilities(model.EffectiveBoardPermissionNone, false),
				DerivedFrom:         model.PermissionDerivedDeny,
				IsOwner:             false,
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

	isOwner := model.ResolveBoardOwnerUserID(board) == userID
	if isOwner {
		effective := model.EffectiveBoardPermissionManage
		return &model.BoardPermissionsResponse{
			BoardID:             boardID,
			EffectivePermission: effective,
			Capabilities:        model.BuildCapabilities(effective, true),
			DerivedFrom:         model.PermissionDerivedOwner,
			IsOwner:             true,
		}, nil
	}

	hasTeamAccess := s.HasPermissionToTeam(userID, board.TeamID, model.PermissionViewTeam)

	effective := model.EffectiveBoardPermissionNone
	derivedFrom := model.PermissionDerivedDeny
	orgUnits := []string(nil)
	positions := []string(nil)
	fullVisibilityPositionIDs := []string(nil)
	isCEOFromProps := false
	isCEOFromFallback := false
	isCEO := false
	orgContextSource := ""
	orgContextResolved := false
	resolveOrgContext := func() {
		if orgContextResolved {
			return
		}
		orgUnits, positions, fullVisibilityPositionIDs, orgContextSource, isCEOFromProps, isCEOFromFallback, isCEO = s.ResolveOrgContextDebugForTeam(userID, board.TeamID)
		orgContextResolved = true
	}

	entries, parseErr := model.ParseBoardACLFromProperties(board.Properties)
	if parseErr != nil {
		s.logger.Warn("failed to parse board acl entries", mlog.String("boardID", boardID), mlog.Err(parseErr))
	}

	// Direct "user" ACL entries never need the org context resolved, and
	// resolving it means an extra user lookup — so only pay for it when the
	// board actually has org-scoped (org_unit/position/org_position) entries.
	if directPermission, directDerivedFrom := model.EvaluateBoardACLEntries(entries, userID, nil, nil); directPermission != model.EffectiveBoardPermissionNone {
		effective = directPermission
		derivedFrom = directDerivedFrom
	} else if model.HasOrgScopedACLEntries(entries) {
		resolveOrgContext()
		if aclPermission, aclDerivedFrom := model.EvaluateBoardACLEntries(entries, userID, orgUnits, positions); aclPermission != model.EffectiveBoardPermissionNone {
			effective = aclPermission
			derivedFrom = aclDerivedFrom
		}
	}

	legacyPermission := model.EffectiveBoardPermissionNone
	legacyDerivedFrom := model.PermissionDerivedDeny

	// Open boards keep the legacy minimum-role fallback for team participants.
	if hasTeamAccess && board.Type == model.BoardTypeOpen {
		switch board.MinimumRole {
		case "admin":
			legacyPermission = model.EffectiveBoardPermissionManage
		case "editor":
			legacyPermission = model.EffectiveBoardPermissionEdit
		case "commenter", "viewer":
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
		} else if member.SchemeCommenter || member.SchemeViewer {
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
	if model.EffectivePermissionRank(effective) < model.EffectivePermissionRank(model.EffectiveBoardPermissionView) {
		resolveOrgContext()
		if isCEO {
			effective = model.EffectiveBoardPermissionView
			derivedFrom = model.PermissionDerivedCEO
		}
	}
	s.logger.Debug("GetBoardPermissions resolved",
		mlog.String("userID", userID),
		mlog.String("boardID", boardID),
		mlog.String("teamID", board.TeamID),
		mlog.Bool("hasTeamAccess", hasTeamAccess),
		mlog.String("orgContextSource", orgContextSource),
		mlog.Bool("isCEOFromProps", isCEOFromProps),
		mlog.Bool("isCEOFromFallback", isCEOFromFallback),
		mlog.Bool("isCEO", isCEO),
		mlog.String("orgUnits", strings.Join(orgUnits, ",")),
		mlog.String("positions", strings.Join(positions, ",")),
		mlog.String("fullVisibilityPositionIDs", strings.Join(fullVisibilityPositionIDs, ",")),
		mlog.String("derivedFrom", derivedFrom),
		mlog.String("effectivePermission", string(effective)),
	)

	return &model.BoardPermissionsResponse{
		BoardID:             boardID,
		EffectivePermission: effective,
		Capabilities:        model.BuildCapabilities(effective, false),
		DerivedFrom:         derivedFrom,
		IsOwner:             false,
	}, nil
}

func (s *Service) ResolveOrgContextForTeam(userID, teamID string) (orgUnits []string, positions []string, isCEO bool) {
	orgUnits, positions, _, _, _, _, isCEO = s.ResolveOrgContextDebugForTeam(userID, teamID)
	return orgUnits, positions, isCEO
}

func (s *Service) ResolveOrgContextDebugForTeam(userID, teamID string) (orgUnits []string, positions []string, fullVisibilityPositionIDs []string, orgContextSource string, isCEOFromProps bool, isCEOFromFallback bool, isCEO bool) {
	propsOrgUnits, propsPositions, isCEOFromProps := s.ResolveOrgContext(userID)
	orgUnits = propsOrgUnits
	positions = propsPositions
	orgContextSource = "props"

	if teamID != "" {
		if provider, ok := s.store.(userOrgProfileProvider); ok {
			profile, err := provider.GetUserOrgProfile(teamID, userID)
			if err != nil {
				s.logger.Warn("failed to load user org profile",
					mlog.String("teamID", teamID),
					mlog.String("userID", userID),
					mlog.Err(err),
				)
			} else if profile != nil {
				orgContextSource = "db"
				orgUnits = nil
				if profile.PrimaryOrgUnitID != "" {
					orgUnits = append(orgUnits, profile.PrimaryOrgUnitID)
				}
				positions = []string{}
				if profile.PrimaryPositionID != "" {
					positions = append(positions, profile.PrimaryPositionID)
				}
				positions = append(positions, profile.ExtraPositions...)
				orgUnits = dedupe(orgUnits)
				positions = dedupe(normalizeList(positions))
			}
		}
	}

	isCEO = isCEOFromProps
	if orgContextSource == "db" {
		isCEO = false
	}

	if teamID != "" {
		if provider, ok := s.store.(fullVisibilityPositionProvider); ok {
			ids, err := provider.GetFullVisibilityPositionIDs(teamID)
			if err != nil {
				s.logger.Warn("failed to load full-visibility position IDs",
					mlog.String("teamID", teamID),
					mlog.String("userID", userID),
					mlog.Err(err),
				)
			} else {
				fullVisibilityPositionIDs = ids
			}
		}
	}

	if len(positions) > 0 && len(fullVisibilityPositionIDs) > 0 {
		positionSet := map[string]struct{}{}
		for _, positionID := range positions {
			positionSet[positionID] = struct{}{}
		}
		for _, positionID := range fullVisibilityPositionIDs {
			if _, ok := positionSet[positionID]; ok {
				isCEOFromFallback = true
				isCEO = true
				break
			}
		}
	}

	s.logger.Debug("ResolveOrgContextForTeam evaluated",
		mlog.String("userID", userID),
		mlog.String("teamID", teamID),
		mlog.String("orgContextSource", orgContextSource),
		mlog.Bool("isCEOFromProps", isCEOFromProps),
		mlog.Bool("isCEOFromFallback", isCEOFromFallback),
		mlog.Bool("isCEO", isCEO),
		mlog.String("orgUnits", strings.Join(orgUnits, ",")),
		mlog.String("positions", strings.Join(positions, ",")),
		mlog.String("fullVisibilityPositionIDs", strings.Join(fullVisibilityPositionIDs, ",")),
	)

	return orgUnits, positions, fullVisibilityPositionIDs, orgContextSource, isCEOFromProps, isCEOFromFallback, isCEO
}

// ResolveOrgContext resolves a user's org unit IDs, position IDs, and
// full-visibility ("CEO") flag in a single user lookup, so batch callers
// (e.g. board list/search expansion) can resolve it once instead of once
// per board. The full-visibility flag is read from user.Props["is_ceo"],
// synced by the main server whenever a user's org profile is saved (see
// okrbest server's syncUserOrgProfileToProps).
func (s *Service) ResolveOrgContext(userID string) (orgUnits []string, positions []string, isCEO bool) {
	// Backward-compatible tags used in tests and legacy deployments.
	orgUnits, positions = extractTaggedRoles(userID, "")
	if len(orgUnits) > 0 || len(positions) > 0 {
		return orgUnits, positions, false
	}

	user := s.getMMUser(userID)
	if user == nil {
		return nil, nil, false
	}

	orgUnits = append(orgUnits, extractListFromProps(user.Props, "org_unit_ids", "orgUnitIds", "org_unit_id", "orgUnitId", "team_codes", "teamCode")...)
	positions = append(positions, extractListFromProps(user.Props, "position_codes", "positionCode", "position_code", "positionCodes")...)

	taggedOrgUnits, taggedPositions := extractTaggedRoles("", user.Roles)
	orgUnits = append(orgUnits, taggedOrgUnits...)
	positions = append(positions, taggedPositions...)

	isCEO = strings.EqualFold(user.Props["is_ceo"], "true")

	return dedupe(orgUnits), dedupe(positions), isCEO
}

func (s *Service) getMMUser(userID string) *mmModel.User {
	if getterByID, ok := s.api.(interface {
		GetUserByID(userID string) (*mmModel.User, error)
	}); ok {
		if resolved, err := getterByID.GetUserByID(userID); err == nil {
			return resolved
		}
	}
	if getter, ok := s.api.(interface {
		GetUser(userID string) (*mmModel.User, *mmModel.AppError)
	}); ok {
		if resolved, appErr := getter.GetUser(userID); appErr == nil {
			return resolved
		}
	}
	return nil
}

func extractListFromProps(props map[string]string, keys ...string) []string {
	if len(props) == 0 {
		return nil
	}
	result := []string{}
	for _, key := range keys {
		if value, ok := props[key]; ok {
			result = append(result, strings.Split(value, ",")...)
		}
	}
	return normalizeList(result)
}

func normalizeList(values []string) []string {
	out := []string{}
	for _, value := range values {
		cleaned := strings.TrimSpace(value)
		if cleaned != "" {
			out = append(out, cleaned)
		}
	}
	return out
}

func dedupe(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
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
