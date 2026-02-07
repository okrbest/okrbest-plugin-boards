// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/audit"
)

// ScheduledCommentRequest represents the request body for creating a scheduled comment.
type ScheduledCommentRequest struct {
	CardID      string `json:"cardId"`
	Title       string `json:"title"`
	ScheduledAt int64  `json:"scheduledAt"`
}

// ScheduledCommentUpdateRequest represents the request body for updating a scheduled comment.
type ScheduledCommentUpdateRequest struct {
	Title       *string `json:"title,omitempty"`
	ScheduledAt *int64  `json:"scheduledAt,omitempty"`
}

func (a *API) registerScheduledCommentsRoutes(r *mux.Router) {
	// Get my scheduled comments
	r.HandleFunc("/me/scheduled-comments", a.sessionRequired(a.handleGetMyScheduledComments)).Methods(http.MethodGet)

	// Board-specific scheduled comment routes
	r.HandleFunc("/boards/{boardID}/scheduled-comments", a.sessionRequired(a.handleCreateScheduledComment)).Methods(http.MethodPost)
	r.HandleFunc("/boards/{boardID}/cards/{cardID}/scheduled-comments", a.sessionRequired(a.handleGetScheduledCommentsForCard)).Methods(http.MethodGet)

	// Individual scheduled comment operations
	r.HandleFunc("/boards/{boardID}/scheduled-comments/{blockID}", a.sessionRequired(a.handleUpdateScheduledComment)).Methods(http.MethodPatch)
	r.HandleFunc("/boards/{boardID}/scheduled-comments/{blockID}/cancel", a.sessionRequired(a.handleCancelScheduledComment)).Methods(http.MethodPost)
	r.HandleFunc("/boards/{boardID}/scheduled-comments/{blockID}/send-now", a.sessionRequired(a.handleSendScheduledCommentNow)).Methods(http.MethodPost)
}

func (a *API) handleGetMyScheduledComments(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /me/scheduled-comments getMyScheduledComments
	//
	// Returns all pending scheduled comments for the current user
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
	//       type: array
	//       items:
	//         "$ref": "#/definitions/Block"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)

	comments, err := a.app.GetMyScheduledComments(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(comments)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)

	auditRec := a.makeAuditRecord(r, "getMyScheduledComments", audit.Fail)
	auditRec.AddMeta("count", len(comments))
	auditRec.Success()
	a.audit.LogRecord(audit.LevelRead, auditRec)
}

func (a *API) handleCreateScheduledComment(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /boards/{boardID}/scheduled-comments createScheduledComment
	//
	// Creates a new scheduled comment
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
	// - name: body
	//   in: body
	//   required: true
	//   schema:
	//     "$ref": "#/definitions/ScheduledCommentRequest"
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       "$ref": "#/definitions/Block"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	vars := mux.Vars(r)
	boardID := vars["boardID"]
	userID := getUserID(r)

	requestBody := ScheduledCommentRequest{}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid request body"))
		return
	}

	// Validate required fields
	if requestBody.CardID == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("cardId is required"))
		return
	}
	if requestBody.Title == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("title is required"))
		return
	}
	if requestBody.ScheduledAt == 0 {
		a.errorResponse(w, r, model.NewErrBadRequest("scheduledAt is required"))
		return
	}

	// Check permission to comment on board cards
	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionCommentBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to create scheduled comment"))
		return
	}

	comment, err := a.app.CreateScheduledComment(boardID, requestBody.CardID, userID, requestBody.Title, requestBody.ScheduledAt)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(comment)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)

	auditRec := a.makeAuditRecord(r, "createScheduledComment", audit.Fail)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("cardID", requestBody.CardID)
	auditRec.AddMeta("blockID", comment.ID)
	auditRec.AddMeta("scheduledAt", requestBody.ScheduledAt)
	auditRec.Success()
	a.audit.LogRecord(audit.LevelModify, auditRec)
}

func (a *API) handleGetScheduledCommentsForCard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /boards/{boardID}/cards/{cardID}/scheduled-comments getScheduledCommentsForCard
	//
	// Returns scheduled comments for a specific card
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
	// - name: cardID
	//   in: path
	//   description: Card ID
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
	//         "$ref": "#/definitions/Block"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	vars := mux.Vars(r)
	boardID := vars["boardID"]
	cardID := vars["cardID"]
	userID := getUserID(r)

	// Check permission to view board
	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to view scheduled comments"))
		return
	}

	comments, err := a.app.GetScheduledCommentsForCard(cardID, userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(comments)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)

	auditRec := a.makeAuditRecord(r, "getScheduledCommentsForCard", audit.Fail)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("cardID", cardID)
	auditRec.AddMeta("count", len(comments))
	auditRec.Success()
	a.audit.LogRecord(audit.LevelRead, auditRec)
}

func (a *API) handleUpdateScheduledComment(w http.ResponseWriter, r *http.Request) {
	// swagger:operation PATCH /boards/{boardID}/scheduled-comments/{blockID} updateScheduledComment
	//
	// Updates a scheduled comment's content or scheduled time
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
	// - name: blockID
	//   in: path
	//   description: Block ID
	//   required: true
	//   type: string
	// - name: body
	//   in: body
	//   required: true
	//   schema:
	//     "$ref": "#/definitions/ScheduledCommentUpdateRequest"
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       "$ref": "#/definitions/Block"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	vars := mux.Vars(r)
	boardID := vars["boardID"]
	blockID := vars["blockID"]
	userID := getUserID(r)

	// Check permission to comment on board
	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionCommentBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to update scheduled comment"))
		return
	}

	requestBody := ScheduledCommentUpdateRequest{}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid request body"))
		return
	}

	comment, err := a.app.UpdateScheduledComment(blockID, userID, requestBody.Title, requestBody.ScheduledAt)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(comment)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)

	auditRec := a.makeAuditRecord(r, "updateScheduledComment", audit.Fail)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("blockID", blockID)
	auditRec.Success()
	a.audit.LogRecord(audit.LevelModify, auditRec)
}

func (a *API) handleCancelScheduledComment(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /boards/{boardID}/scheduled-comments/{blockID}/cancel cancelScheduledComment
	//
	// Cancels a scheduled comment
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
	// - name: blockID
	//   in: path
	//   description: Block ID
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       "$ref": "#/definitions/Block"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	vars := mux.Vars(r)
	boardID := vars["boardID"]
	blockID := vars["blockID"]
	userID := getUserID(r)

	// Check permission to comment on board
	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionCommentBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to cancel scheduled comment"))
		return
	}

	comment, err := a.app.CancelScheduledComment(blockID, userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(comment)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)

	auditRec := a.makeAuditRecord(r, "cancelScheduledComment", audit.Fail)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("blockID", blockID)
	auditRec.Success()
	a.audit.LogRecord(audit.LevelModify, auditRec)
}

func (a *API) handleSendScheduledCommentNow(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /boards/{boardID}/scheduled-comments/{blockID}/send-now sendScheduledCommentNow
	//
	// Immediately sends a scheduled comment
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
	// - name: blockID
	//   in: path
	//   description: Block ID
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       "$ref": "#/definitions/Block"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	vars := mux.Vars(r)
	boardID := vars["boardID"]
	blockID := vars["blockID"]
	userID := getUserID(r)

	// Check permission to comment on board
	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionCommentBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to send scheduled comment"))
		return
	}

	comment, err := a.app.SendScheduledCommentNow(blockID, userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(comment)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)

	auditRec := a.makeAuditRecord(r, "sendScheduledCommentNow", audit.Fail)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("blockID", blockID)
	auditRec.Success()
	a.audit.LogRecord(audit.LevelModify, auditRec)
}
