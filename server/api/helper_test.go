// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/golang/mock/gomock"
	"github.com/gorilla/mux"

	"github.com/mattermost/mattermost-plugin-boards/server/app"
	"github.com/mattermost/mattermost-plugin-boards/server/auth"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/config"
	"github.com/mattermost/mattermost-plugin-boards/server/services/metrics"
	"github.com/mattermost/mattermost-plugin-boards/server/services/store/mockstore"
	"github.com/mattermost/mattermost-plugin-boards/server/services/webhook"
	"github.com/mattermost/mattermost-plugin-boards/server/ws"

	mmModel "github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// fakePermissions answers permission questions from a lookup table so a handler
// test can state exactly what the caller is allowed to do.
//
// A hand written fake rather than a generated mock: the interface is five
// methods and tests read better when the allowed set is declared as data.
type fakePermissions struct {
	// team[userID+teamID] grants HasPermissionToTeam regardless of which
	// permission is asked for. Handlers under test check one permission each.
	team  map[string]bool
	board map[string]bool
	sys   map[string]bool
}

func newFakePermissions() *fakePermissions {
	return &fakePermissions{
		team:  map[string]bool{},
		board: map[string]bool{},
		sys:   map[string]bool{},
	}
}

//nolint:unparam // teamID varies once later phases add multi-team cases
func (f *fakePermissions) allowTeam(userID, teamID string) {
	f.team[userID+"|"+teamID] = true
}

func (f *fakePermissions) HasPermissionTo(userID string, _ *mmModel.Permission) bool {
	return f.sys[userID]
}

func (f *fakePermissions) HasPermissionToTeam(userID, teamID string, _ *mmModel.Permission) bool {
	return f.team[userID+"|"+teamID]
}

func (f *fakePermissions) HasPermissionToChannel(_, _ string, _ *mmModel.Permission) bool {
	return false
}

func (f *fakePermissions) HasPermissionToBoard(userID, boardID string, _ *mmModel.Permission) bool {
	return f.board[userID+"|"+boardID]
}

func (f *fakePermissions) GetBoardPermissions(_, boardID string) (*model.BoardPermissionsResponse, error) {
	return &model.BoardPermissionsResponse{
		BoardID:             boardID,
		EffectivePermission: model.EffectiveBoardPermissionNone,
		Capabilities:        model.BuildCapabilities(model.EffectiveBoardPermissionNone),
		DerivedFrom:         model.PermissionDerivedDeny,
	}, nil
}

// APITestHelper wires a real API and app over a mocked store so handler
// behavior — routing, permission bars, response shape — can be asserted
// without a database.
type APITestHelper struct {
	API         *API
	Store       *mockstore.MockStore
	Permissions *fakePermissions
	router      *mux.Router
}

func setupAPITestHelper(t *testing.T) (*APITestHelper, func()) {
	t.Helper()

	ctrl := gomock.NewController(t)
	cfg := config.Configuration{}
	store := mockstore.NewMockStore(ctrl)
	logger := mlog.CreateConsoleTestLogger(t)
	authService := auth.New(&cfg, store, nil)
	wsServer := ws.NewServer(authService, logger, store)

	boardsApp := app.New(&cfg, wsServer, app.Services{
		Auth:             authService,
		Store:            store,
		Webhook:          webhook.NewClient(&cfg, logger),
		Metrics:          metrics.NewMetrics(metrics.InstanceInfo{}),
		Logger:           logger,
		SkipTemplateInit: true,
	})

	perms := newFakePermissions()
	api := NewAPI(boardsApp, "", "native", perms, logger, nil)

	router := mux.NewRouter()
	api.RegisterRoutes(router)

	tearDown := func() {
		boardsApp.Shutdown()
		ctrl.Finish()
	}

	return &APITestHelper{API: api, Store: store, Permissions: perms, router: router}, tearDown
}

// callHandler bypasses the auth middleware and invokes one handler directly
// with a session already attached, so a test can target the handler's own
// permission check rather than the wrapper's.
func (h *APITestHelper) callHandler(handler func(http.ResponseWriter, *http.Request), path, userID string, vars map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	session := &model.Session{ID: "session-" + userID, UserID: userID}
	req = req.WithContext(context.WithValue(req.Context(), sessionContextKey, session))
	req = mux.SetURLVars(req, vars)

	rec := httptest.NewRecorder()
	handler(rec, req)
	return rec
}
