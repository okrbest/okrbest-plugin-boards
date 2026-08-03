// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/mattermost/mattermost-plugin-boards/server/model"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// Read-only organization lookups backing the card access rule selectors.
//
// The main server exposes its own organization endpoints, but those require
// team admin. Rule editing is open to board admins, who are usually not team
// admins, so these routes exist with a view-team bar instead. Organization and
// duty names are already readable by team members through the main server's
// org-profile-summary endpoint, so this does not widen what is visible.
func (a *API) registerOrgRoutes(r *mux.Router) {
	r.HandleFunc("/teams/{teamID}/org-units", a.sessionRequired(a.handleGetOrgUnits)).Methods("GET")
	r.HandleFunc("/teams/{teamID}/duties", a.sessionRequired(a.handleGetDuties)).Methods("GET")
}

func (a *API) handleGetOrgUnits(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /teams/{teamID}/org-units getOrgUnits
	//
	// Returns the active organization units (divisions and departments) of a team
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: teamID
	//   in: path
	//   description: Team ID
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       type: array
	//       items:
	//         "$ref": "#/definitions/OrgUnit"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	teamID := mux.Vars(r)["teamID"]
	userID := getUserID(r)

	if !a.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to team"))
		return
	}

	units, err := a.app.GetOrgUnitsForTeam(teamID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("GetOrgUnits",
		mlog.String("teamID", teamID),
		mlog.Int("count", len(units)),
	)

	data, err := json.Marshal(units)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleGetDuties(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /teams/{teamID}/duties getDuties
	//
	// Returns the active duties (직책) of a team. Positions (직위) are excluded.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: teamID
	//   in: path
	//   description: Team ID
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       type: array
	//       items:
	//         "$ref": "#/definitions/Duty"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	teamID := mux.Vars(r)["teamID"]
	userID := getUserID(r)

	if !a.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to team"))
		return
	}

	duties, err := a.app.GetDutiesForTeam(teamID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("GetDuties",
		mlog.String("teamID", teamID),
		mlog.Int("count", len(duties)),
	)

	data, err := json.Marshal(duties)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}
