// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/audit"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// The admin's window onto private views (022 FR-023~FR-025). Every other path
// keeps another person's private view from everyone, admins included; these two
// let a board admin list them and delete the ones left behind.
func (a *API) registerViewsRoutes(r *mux.Router) {
	r.HandleFunc("/boards/{boardID}/views/private", a.sessionRequired(a.handleGetPrivateViews)).Methods("GET")
	r.HandleFunc("/boards/{boardID}/views/private/{viewID}", a.sessionRequired(a.handleDeletePrivateView)).Methods("DELETE")
}

// requireBoardAdmin answers whether userID clears the bar this feature calls
// "admin" on boardID, writing the refusal when they do not.
func (a *API) requireBoardAdmin(w http.ResponseWriter, r *http.Request, userID, boardID string) bool {
	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to the board's private views"))
		return false
	}
	return true
}

func (a *API) handleGetPrivateViews(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /boards/{boardID}/views/private getPrivateViews
	//
	// Lists the board's private views for a board admin: id, title, creator and
	// creation time, never the view's configuration.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: boardID
	//   in: path
	//   description: Board ID
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//   '403':
	//     description: not a board admin
	//   '404':
	//     description: board not found

	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	if _, err := a.app.GetBoard(boardID); err != nil {
		a.errorResponse(w, r, err)
		return
	}
	if !a.requireBoardAdmin(w, r, userID, boardID) {
		return
	}

	auditRec := a.makeAuditRecord(r, "getPrivateViews", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("boardID", boardID)

	summaries, err := a.app.GetPrivateViewsForBoard(boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(summaries)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.Success()
}

func (a *API) handleDeletePrivateView(w http.ResponseWriter, r *http.Request) {
	// swagger:operation DELETE /boards/{boardID}/views/private/{viewID} deletePrivateView
	//
	// Deletes one private view on a board admin's behalf.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: boardID
	//   in: path
	//   description: Board ID
	//   required: true
	//   type: string
	// - name: viewID
	//   in: path
	//   description: Private view ID
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//   '403':
	//     description: not a board admin
	//   '404':
	//     description: board or private view not found

	vars := mux.Vars(r)
	boardID := vars["boardID"]
	viewID := vars["viewID"]
	userID := getUserID(r)

	if _, err := a.app.GetBoard(boardID); err != nil {
		a.errorResponse(w, r, err)
		return
	}
	if !a.requireBoardAdmin(w, r, userID, boardID) {
		return
	}

	auditRec := a.makeAuditRecord(r, "deletePrivateView", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("viewID", viewID)

	if err := a.app.DeletePrivateViewAsAdmin(boardID, viewID, userID); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("DELETE private view", mlog.String("boardID", boardID), mlog.String("viewID", viewID))
	jsonStringResponse(w, http.StatusOK, "{}")
	auditRec.Success()
}
