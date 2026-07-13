// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDebugPermissionsEnabled(t *testing.T) {
	testCases := []struct {
		name     string
		query    string
		expected bool
	}{
		{name: "enabled with 1", query: "?debug_permissions=1", expected: true},
		{name: "enabled with true", query: "?debug_permissions=true", expected: true},
		{name: "enabled with yes", query: "?debug_permissions=yes", expected: true},
		{name: "disabled by default", query: "", expected: false},
		{name: "disabled with false", query: "?debug_permissions=false", expected: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/v2/teams/team-id/boards"+tc.query, nil)
			require.Equal(t, tc.expected, debugPermissionsEnabled(req))
		})
	}
}

func TestSetBoardsDebugHeaders(t *testing.T) {
	recorder := httptest.NewRecorder()

	setBoardsDebugHeaders(recorder, true, false, 12, boardsDebugInfo{
		OrgContextSource:          "db",
		OrgUnits:                  []string{"org-a"},
		PositionCodes:             []string{"pos-ceo"},
		FullVisibilityPositionIDs: []string{"pos-ceo", "pos-vp"},
		IsCEOFromProps:            true,
		IsCEOFromFallback:         false,
		IsCEO:                     true,
	})

	require.Equal(t, "true", recorder.Header().Get("X-Boards-Debug-TeamAccess"))
	require.Equal(t, "false", recorder.Header().Get("X-Boards-Debug-IsGuest"))
	require.Equal(t, "true", recorder.Header().Get("X-Boards-Debug-IsCEO"))
	require.Equal(t, "12", recorder.Header().Get("X-Boards-Debug-BoardsCount"))
	require.Equal(t, "db", recorder.Header().Get("X-Boards-Debug-OrgContextSource"))
	require.Equal(t, "org-a", recorder.Header().Get("X-Boards-Debug-OrgUnitIds"))
	require.Equal(t, "pos-ceo", recorder.Header().Get("X-Boards-Debug-PositionCodes"))
	require.Equal(t, "pos-ceo,pos-vp", recorder.Header().Get("X-Boards-Debug-FullVisibilityPositionIds"))
	require.Equal(t, "true", recorder.Header().Get("X-Boards-Debug-IsCEO-FromProps"))
	require.Equal(t, "false", recorder.Header().Get("X-Boards-Debug-IsCEO-FromFallback"))
}
