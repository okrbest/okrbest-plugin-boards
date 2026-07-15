// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"
)

type boardACLRequest struct {
	Entries []model.BoardACLEntry `json:"entries"`
}

type boardACLEntryRequest struct {
	SubjectType  model.BoardACLSubjectType      `json:"subjectType"`
	SubjectID    string                         `json:"subjectId"`
	OrgUnitID    string                         `json:"orgUnitId"`
	PositionCode string                         `json:"positionCode"`
	Permission   model.EffectiveBoardPermission `json:"permission"`
}

func (a *API) handleGetOrgUnits(w http.ResponseWriter, r *http.Request) {
	teamID := r.URL.Query().Get("teamID")
	if teamID == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("teamID is required"))
		return
	}

	userID := getUserID(r)
	if !a.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to org units"))
		return
	}

	options, err := a.app.GetOrgUnitOptions(teamID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(options)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleGetPositions(w http.ResponseWriter, r *http.Request) {
	teamID := r.URL.Query().Get("teamID")
	if teamID == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("teamID is required"))
		return
	}

	userID := getUserID(r)
	if !a.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to positions"))
		return
	}

	options, err := a.app.GetPositionOptions(teamID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(options)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleGetBoardPermissionsMe(w http.ResponseWriter, r *http.Request) {
	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	response, err := a.permissions.GetBoardPermissions(userID, boardID)
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

func (a *API) handleGetBoardPermissionsPreview(w http.ResponseWriter, r *http.Request) {
	boardID := mux.Vars(r)["boardID"]
	requestorID := getUserID(r)
	targetUserID := r.URL.Query().Get("userID")
	if targetUserID == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("userID is required"))
		return
	}

	if !a.canManageBoardACL(requestorID, boardID) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to preview board permissions"))
		return
	}

	response, err := a.permissions.GetBoardPermissions(targetUserID, boardID)
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

func (a *API) handleGetBoardACL(w http.ResponseWriter, r *http.Request) {
	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to board acl"))
		return
	}

	board, err := a.app.GetBoard(boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	entries, err := model.ParseBoardACLFromProperties(board.Properties)
	if err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	data, err := json.Marshal(entries)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handlePutBoardACL(w http.ResponseWriter, r *http.Request) {
	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	if !a.canManageBoardACL(userID, boardID) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to update board acl"))
		return
	}

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var req boardACLRequest
	if err := json.Unmarshal(requestBody, &req); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	if err := validateACLManageScope(req.Entries); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	if err := normalizeAndValidateACLEntries(req.Entries); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	updated, err := a.persistBoardACL(boardID, userID, req.Entries)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(updated)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleCreateBoardACLEntry(w http.ResponseWriter, r *http.Request) {
	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	if !a.canManageBoardACL(userID, boardID) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to update board acl"))
		return
	}

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var req boardACLEntryRequest
	if err := json.Unmarshal(requestBody, &req); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	entry := model.BoardACLEntry{
		ID:           utils.NewID(utils.IDTypeBlock),
		SubjectType:  req.SubjectType,
		SubjectID:    req.SubjectID,
		OrgUnitID:    req.OrgUnitID,
		PositionCode: req.PositionCode,
		Permission:   req.Permission,
	}
	if err := validateACLManageScope([]model.BoardACLEntry{entry}); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}
	if err := normalizeAndValidateACLEntries([]model.BoardACLEntry{entry}); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	board, err := a.app.GetBoard(boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	entries, err := model.ParseBoardACLFromProperties(board.Properties)
	if err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}
	entries = append(entries, entry)

	updated, err := a.persistBoardACL(boardID, userID, entries)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(updated)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleDeleteBoardACLEntry(w http.ResponseWriter, r *http.Request) {
	boardID := mux.Vars(r)["boardID"]
	entryID := mux.Vars(r)["entryID"]
	userID := getUserID(r)

	if !a.canManageBoardACL(userID, boardID) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to update board acl"))
		return
	}

	board, err := a.app.GetBoard(boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	entries, err := model.ParseBoardACLFromProperties(board.Properties)
	if err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	filtered := make([]model.BoardACLEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.ID == entryID {
			continue
		}
		filtered = append(filtered, entry)
	}

	updated, err := a.persistBoardACL(boardID, userID, filtered)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(updated)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) persistBoardACL(boardID, userID string, entries []model.BoardACLEntry) ([]model.BoardACLEntry, error) {
	entries = filterOutUserACLEntries(entries)
	normalizeLegacyOrgManagePermissions(entries)

	updatedProperties := map[string]interface{}{
		model.BoardACLPropertyKey: entries,
	}

	boardPatch := &model.BoardPatch{UpdatedProperties: updatedProperties}
	if _, err := a.app.PatchBoard(boardPatch, boardID, userID); err != nil {
		return nil, err
	}

	return entries, nil
}

// filterOutUserACLEntries drops legacy per-user ACL entries. User-level
// exceptions are no longer configurable from the ACL UI, so any leftover
// entries from before that removal are pruned the next time ACL is saved.
func filterOutUserACLEntries(entries []model.BoardACLEntry) []model.BoardACLEntry {
	filtered := make([]model.BoardACLEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.SubjectType == model.BoardACLSubjectUser {
			continue
		}
		filtered = append(filtered, entry)
	}
	return filtered
}

func (a *API) canManageBoardACL(userID, boardID string) bool {
	if a.permissions.HasPermissionTo(userID, model.PermissionManageSystem) {
		return true
	}
	return a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles)
}

func normalizeAndValidateACLEntries(entries []model.BoardACLEntry) error {
	for i := range entries {
		if entries[i].ID == "" {
			entries[i].ID = utils.NewID(utils.IDTypeBlock)
		}

		switch entries[i].SubjectType {
		case model.BoardACLSubjectUser:
			if entries[i].SubjectID == "" {
				return model.NewErrBadRequest("subjectId is required")
			}
		case model.BoardACLSubjectOrgPos:
			if entries[i].OrgUnitID == "" {
				return model.NewErrBadRequest("orgUnitId is required")
			}
			if entries[i].PositionCode == "" {
				return model.NewErrBadRequest("positionCode is required")
			}
		case model.BoardACLSubjectOrgUnit, model.BoardACLSubjectPosition:
			if entries[i].SubjectID == "" {
				return model.NewErrBadRequest("subjectId is required")
			}
		default:
			return model.NewErrBadRequest("invalid subjectType")
		}

		switch entries[i].Permission {
		case model.EffectiveBoardPermissionView, model.EffectiveBoardPermissionCommenter, model.EffectiveBoardPermissionEdit, model.EffectiveBoardPermissionManage:
		default:
			return model.NewErrBadRequest("invalid permission")
		}
	}

	return nil
}

func validateACLManageScope(entries []model.BoardACLEntry) error {
	for _, entry := range entries {
		if entry.Permission != model.EffectiveBoardPermissionManage {
			continue
		}
		if entry.SubjectType != model.BoardACLSubjectUser {
			return model.NewErrBadRequest("manage permission is only allowed for user subjectType")
		}
	}
	return nil
}

func normalizeLegacyOrgManagePermissions(entries []model.BoardACLEntry) {
	for i := range entries {
		if entries[i].Permission != model.EffectiveBoardPermissionManage {
			continue
		}
		entries[i].Permission = model.EffectiveBoardPermissionEdit
	}
}
