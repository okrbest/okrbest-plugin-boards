// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/mattermost/mattermost-plugin-boards/server/services/permissions"
)

type orgContextResolverForTeam interface {
	ResolveOrgContextForTeam(userID, teamID string) (orgUnits []string, positions []string, isCEO bool)
}

type orgContextDebugResolverForTeam interface {
	ResolveOrgContextDebugForTeam(userID, teamID string) (orgUnits []string, positions []string, fullVisibilityPositionIDs []string, orgContextSource string, isCEOFromProps bool, isCEOFromFallback bool, isCEO bool)
}

type boardsDebugInfo struct {
	OrgContextSource          string
	OrgUnits                  []string
	PositionCodes             []string
	FullVisibilityPositionIDs []string
	IsCEOFromProps            bool
	IsCEOFromFallback         bool
	IsCEO                     bool
}

func debugPermissionsEnabled(r *http.Request) bool {
	query := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("debug_permissions")))
	return query == "1" || query == "true" || query == "yes"
}

func resolveDebugInfo(service permissions.PermissionsService, userID, teamID string) boardsDebugInfo {
	if userID == "" {
		return boardsDebugInfo{}
	}
	if teamID != "" {
		if resolver, ok := service.(orgContextDebugResolverForTeam); ok {
			orgUnits, positions, fullVisibilityPositionIDs, orgContextSource, isCEOFromProps, isCEOFromFallback, isCEO := resolver.ResolveOrgContextDebugForTeam(userID, teamID)
			return boardsDebugInfo{
				OrgContextSource:          orgContextSource,
				OrgUnits:                  orgUnits,
				PositionCodes:             positions,
				FullVisibilityPositionIDs: fullVisibilityPositionIDs,
				IsCEOFromProps:            isCEOFromProps,
				IsCEOFromFallback:         isCEOFromFallback,
				IsCEO:                     isCEO,
			}
		}
		if resolver, ok := service.(orgContextResolverForTeam); ok {
			orgUnits, positions, isCEO := resolver.ResolveOrgContextForTeam(userID, teamID)
			return boardsDebugInfo{
				OrgContextSource: "props",
				OrgUnits:         orgUnits,
				PositionCodes:    positions,
				IsCEO:            isCEO,
			}
		}
	}
	orgUnits, positions, isCEO := service.ResolveOrgContext(userID)
	return boardsDebugInfo{
		OrgContextSource: "props",
		OrgUnits:         orgUnits,
		PositionCodes:    positions,
		IsCEO:            isCEO,
	}
}

func setBoardsDebugHeaders(w http.ResponseWriter, hasTeamAccess bool, isGuest bool, boardsCount int, info boardsDebugInfo) {
	setResponseHeader(w, "X-Boards-Debug-TeamAccess", strconv.FormatBool(hasTeamAccess))
	setResponseHeader(w, "X-Boards-Debug-IsGuest", strconv.FormatBool(isGuest))
	setResponseHeader(w, "X-Boards-Debug-IsCEO", strconv.FormatBool(info.IsCEO))
	setResponseHeader(w, "X-Boards-Debug-BoardsCount", strconv.Itoa(boardsCount))
	setResponseHeader(w, "X-Boards-Debug-OrgContextSource", info.OrgContextSource)
	setResponseHeader(w, "X-Boards-Debug-OrgUnitIds", strings.Join(info.OrgUnits, ","))
	setResponseHeader(w, "X-Boards-Debug-PositionCodes", strings.Join(info.PositionCodes, ","))
	setResponseHeader(w, "X-Boards-Debug-FullVisibilityPositionIds", strings.Join(info.FullVisibilityPositionIDs, ","))
	setResponseHeader(w, "X-Boards-Debug-IsCEO-FromProps", strconv.FormatBool(info.IsCEOFromProps))
	setResponseHeader(w, "X-Boards-Debug-IsCEO-FromFallback", strconv.FormatBool(info.IsCEOFromFallback))
}
