// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

func (a *API) handleGetBoardPermissionsMe(w http.ResponseWriter, r *http.Request) {
	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	response, err := a.permissions.GetBoardPermissions(userID, boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// Merged here rather than inside the permissions service: that service is
	// what the app asks for board permissions, so having it ask the app back for
	// card permissions would close a loop between the two.
	cardPermissions, err := a.app.GetCardPermissionsForUser(userID, boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	response.CardPermissions = cardPermissions

	data, err := json.Marshal(response)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}
