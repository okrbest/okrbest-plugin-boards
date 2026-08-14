// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/audit"

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
	r.HandleFunc("/teams/{teamID}/org-profiles", a.sessionRequired(a.handleGetOrgProfiles)).Methods("GET")

	// Duty tiers sit beside the organization lookups because they are read
	// under the same bar — a board admin writing a rule has to see which duties
	// "C-Level" stands for. Writing is a different question and the handler asks
	// it separately (009 FR-011b).
	r.HandleFunc("/teams/{teamID}/duty-tiers", a.sessionRequired(a.handleGetDutyTiers)).Methods("GET")
	r.HandleFunc("/teams/{teamID}/duty-tiers", a.sessionRequired(a.handleSetDutyTiers)).Methods("PUT")
}

// dutyTiersResponse carries the tiers plus whether this viewer may change them.
//
// The flag is computed here rather than on the client: a team admin is not a
// system role, so the browser cannot tell from the user object alone.
type dutyTiersResponse struct {
	Tiers   []model.DutyTier `json:"tiers"`
	CanEdit bool             `json:"canEdit"`
}

func (a *API) handleGetDutyTiers(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamID := vars["teamID"]
	userID := getUserID(r)

	if !a.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to team"))
		return
	}

	tiers, err := a.app.GetDutyTiers(teamID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(dutyTiersResponse{Tiers: tiers, CanEdit: a.app.CanEditDutyTiers(userID, teamID)})
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleSetDutyTiers(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamID := vars["teamID"]
	userID := getUserID(r)

	// Viewing the team is the floor; the app layer asks the real question. Doing
	// it in both places keeps a caller who is not on the team from learning
	// whether the team exists.
	if !a.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to team"))
		return
	}

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var tiers []model.DutyTier
	if err = json.Unmarshal(requestBody, &tiers); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid duty tiers: "+err.Error()))
		return
	}

	auditRec := a.makeAuditRecord(r, "setDutyTiers", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("teamID", teamID)
	auditRec.AddMeta("tierCount", len(tiers))

	if err = a.app.SetDutyTiers(userID, teamID, tiers); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(dutyTiersResponse{Tiers: tiers, CanEdit: true})
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.Success()
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

func (a *API) handleGetOrgProfiles(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /teams/{teamID}/org-profiles getOrgProfiles
	//
	// Returns which organization unit each user of a team belongs to
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
	//         "$ref": "#/definitions/UserOrgMembership"
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

	// The candidate pool is resolved exactly the way the person selector
	// resolves it — same call, same guest handling, same bot exclusion. Anything
	// narrower would leave users that a team wide search can surface without a
	// known organization, and the narrowing would silently drop them.
	isGuest, err := a.userIsGuest(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	asGuestUser := ""
	if isGuest {
		asGuestUser = userID
	}

	users, err := a.app.SearchTeamUsers(teamID, "", asGuestUser, true)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	userIDs := make([]string, 0, len(users))
	for _, user := range users {
		if user != nil {
			userIDs = append(userIDs, user.ID)
		}
	}

	profiles, err := a.app.GetUserOrgProfiles(teamID, userIDs)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// Built by walking users rather than the profile map so the order is stable
	// across requests. Users bound to nothing are left out entirely.
	memberships := make([]model.UserOrgMembership, 0, len(profiles))
	for _, id := range userIDs {
		profile, ok := profiles[id]
		if !ok || profile == nil || profile.PrimaryOrgUnitID == "" {
			continue
		}
		memberships = append(memberships, model.UserOrgMembership{
			UserID:    id,
			OrgUnitID: profile.PrimaryOrgUnitID,
		})
	}

	a.logger.Debug("GetOrgProfiles",
		mlog.String("teamID", teamID),
		mlog.Int("users", len(userIDs)),
		mlog.Int("assigned", len(memberships)),
	)

	data, err := json.Marshal(memberships)
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
