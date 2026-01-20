// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

func (a *API) registerConfigRoutes(r *mux.Router) {
	// Config APIs
	r.HandleFunc("/clientConfig", a.getClientConfig).Methods("GET")
	r.HandleFunc("/limits", a.handleGetCloudLimits).Methods("GET")
}

func (a *API) handleGetCloudLimits(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /limits getCloudLimits
	//
	// Returns the cloud limits (dummy implementation)
	//
	// ---
	// produces:
	// - application/json
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       "$ref": "#/definitions/BoardsCloudLimits"

	limits := model.BoardsCloudLimits{
		Cards:              model.LimitUnlimited,
		UsedCards:          0,
		CardLimitTimestamp: 0,
		Views:              model.LimitUnlimited,
	}

	jsonBytes, err := json.Marshal(limits)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, jsonBytes)
}

func (a *API) getClientConfig(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /clientConfig getClientConfig
	//
	// Returns the client configuration
	//
	// ---
	// produces:
	// - application/json
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       "$ref": "#/definitions/ClientConfig"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	clientConfig := a.app.GetClientConfig()

	configData, err := json.Marshal(clientConfig)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, configData)
}
