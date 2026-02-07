// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	mmModel "github.com/mattermost/mattermost/server/public/model"
)

func (a *API) registerStatisticsRoutes(r *mux.Router) {
	r.HandleFunc("/statistics", a.sessionRequired(a.handleStatistics)).Methods("GET")
	r.HandleFunc("/statistics/migration", a.sessionRequired(a.handleMigrationStatus)).Methods("GET")
	r.HandleFunc("/migration/unmigrated-cards", a.sessionRequired(a.handleGetUnmigratedCards)).Methods("GET")
}

func (a *API) handleStatistics(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /statistics handleStatistics
	//
	// Fetches the statistic  of the server.
	//
	// ---
	// produces:
	// - application/json
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//         "$ref": "#/definitions/BoardStatistics"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	// user must have right to access analytics
	userID := getUserID(r)
	if !a.permissions.HasPermissionTo(userID, mmModel.PermissionGetAnalytics) {
		a.errorResponse(w, r, model.NewErrPermission("access denied System Statistics"))
		return
	}

	boardCount, err := a.app.GetBoardCount(false)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	cardCount, err := a.app.GetUsedCardsCount()
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	stats := model.BoardsStatistics{
		Boards: boardCount,
		Cards:  cardCount,
	}
	data, err := json.Marshal(stats)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleMigrationStatus(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if !a.permissions.HasPermissionTo(userID, mmModel.PermissionGetAnalytics) {
		a.errorResponse(w, r, model.NewErrPermission("access denied Migration Status"))
		return
	}

	status, err := a.app.GetBlockSuiteMigrationStatus()
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(status)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleGetUnmigratedCards(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if !a.permissions.HasPermissionTo(userID, mmModel.PermissionGetAnalytics) {
		a.errorResponse(w, r, model.NewErrPermission("access denied Unmigrated Cards"))
		return
	}

	limit := 50
	offset := 0

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 100 {
			limit = parsedLimit
		}
	}

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if parsedOffset, err := strconv.Atoi(offsetStr); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	response, err := a.app.GetUnmigratedCardsWithContentBlocks(limit, offset)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(response)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}
