// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strings"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/audit"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (a *API) registerBoardsRoutes(r *mux.Router) {
	r.HandleFunc("/teams/{teamID}/boards", a.sessionRequired(a.handleGetBoards)).Methods("GET")
	r.HandleFunc("/boards", a.sessionRequired(a.handleCreateBoard)).Methods("POST")
	r.HandleFunc("/boards/{boardID}", a.attachSession(a.handleGetBoard)).Methods("GET")
	r.HandleFunc("/boards/{boardID}", a.sessionRequired(a.handlePatchBoard)).Methods("PATCH")
	r.HandleFunc("/boards/{boardID}", a.sessionRequired(a.handleDeleteBoard)).Methods("DELETE")
	r.HandleFunc("/boards/{boardID}/duplicate", a.sessionRequired(a.handleDuplicateBoard)).Methods("POST")
	r.HandleFunc("/boards/{boardID}/undelete", a.sessionRequired(a.handleUndeleteBoard)).Methods("POST")
	r.HandleFunc("/boards/{boardID}/metadata", a.sessionRequired(a.handleGetBoardMetadata)).Methods("GET")
	r.HandleFunc("/boards/{boardID}/permissions/me", a.sessionRequired(a.handleGetBoardPermissionsMe)).Methods("GET")
	// /notify is used by auto-notify flow (card close) to send subscription diff notifications.
	r.HandleFunc("/boards/{boardID}/notify", a.sessionRequired(a.handleSendBoardNotification)).Methods("POST")
	// /notify/share is used only by explicit share actions (button/menu click).
	r.HandleFunc("/boards/{boardID}/notify/share", a.sessionRequired(a.handleSendBoardShareNotification)).Methods("POST")
}

func (a *API) handleGetBoards(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /teams/{teamID}/boards getBoards
	//
	// Returns team boards
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
	//         "$ref": "#/definitions/Board"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	teamID := mux.Vars(r)["teamID"]
	userID := getUserID(r)
	hasTeamAccess := a.permissions.HasPermissionToTeam(userID, teamID, model.PermissionViewTeam)

	auditRec := a.makeAuditRecord(r, "getBoards", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("teamID", teamID)

	isGuest, err := a.userIsGuest(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// retrieve boards list
	boards, err := a.app.GetBoardsForUserAndTeam(userID, teamID, !isGuest)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	a.logger.Debug("GetBoards permission evaluation",
		mlog.String("userID", userID),
		mlog.String("teamID", teamID),
		mlog.Bool("hasTeamAccess", hasTeamAccess),
		mlog.Bool("isGuest", isGuest),
		mlog.Int("boardsCount", len(boards)),
	)
	if !hasTeamAccess && len(boards) == 0 {
		a.errorResponse(w, r, model.NewErrPermission("access denied to team"))
		return
	}

	a.logger.Debug("GetBoards",
		mlog.String("teamID", teamID),
		mlog.Int("boardsCount", len(boards)),
	)

	data, err := json.Marshal(boards)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.AddMeta("boardsCount", len(boards))
	auditRec.Success()
}

func (a *API) handleCreateBoard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /boards createBoard
	//
	// Creates a new board
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: Body
	//   in: body
	//   description: the board to create
	//   required: true
	//   schema:
	//     "$ref": "#/definitions/Board"
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       $ref: '#/definitions/Board'
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var newBoard *model.Board
	if err = json.Unmarshal(requestBody, &newBoard); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	if validationErr := newBoard.IsValid(); validationErr != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(validationErr.Error()))
		return
	}

	if newBoard.Type == model.BoardTypeOpen {
		if !a.permissions.HasPermissionToTeam(userID, newBoard.TeamID, model.PermissionCreatePublicChannel) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to create public boards"))
			return
		}
	} else {
		if !a.permissions.HasPermissionToTeam(userID, newBoard.TeamID, model.PermissionCreatePrivateChannel) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to create private boards"))
			return
		}
	}

	isGuest, err := a.userIsGuest(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	if isGuest {
		a.errorResponse(w, r, model.NewErrPermission("access denied to create board"))
		return
	}

	if err = newBoard.IsValid(); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	auditRec := a.makeAuditRecord(r, "createBoard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("teamID", newBoard.TeamID)
	auditRec.AddMeta("boardType", newBoard.Type)

	// create board
	board, err := a.app.CreateBoard(newBoard, userID, true)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("CreateBoard",
		mlog.String("teamID", board.TeamID),
		mlog.String("boardID", board.ID),
		mlog.String("boardType", string(board.Type)),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(board)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleGetBoard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /boards/{boardID} getBoard
	//
	// Returns a board
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
	//     schema:
	//       "$ref": "#/definitions/Board"
	//   '404':
	//     description: board not found
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	hasValidReadToken := a.hasValidReadTokenForBoard(r, boardID)
	if userID == "" && !hasValidReadToken {
		a.errorResponse(w, r, model.NewErrUnauthorized("access denied to board"))
		return
	}

	board, err := a.app.GetBoard(boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	if !hasValidReadToken {
		canViewBoard := a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard)
		if board.Type == model.BoardTypePrivate {
			if !canViewBoard {
				a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
				return
			}
		} else if !canViewBoard {
			var isGuest bool
			isGuest, err = a.userIsGuest(userID)
			if err != nil {
				a.errorResponse(w, r, err)
				return
			}
			if isGuest {
				if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
					a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
					return
				}
			}
			if !a.permissions.HasPermissionToTeam(userID, board.TeamID, model.PermissionViewTeam) {
				a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
				return
			}
		}
	}

	auditRec := a.makeAuditRecord(r, "getBoard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("boardID", boardID)

	a.logger.Debug("GetBoard",
		mlog.String("boardID", boardID),
	)

	data, err := json.Marshal(board)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handlePatchBoard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation PATCH /boards/{boardID} patchBoard
	//
	// Partially updates a board
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
	// - name: Body
	//   in: body
	//   description: board patch to apply
	//   required: true
	//   schema:
	//     "$ref": "#/definitions/BoardPatch"
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       $ref: '#/definitions/Board'
	//   '404':
	//     description: board not found
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	boardID := mux.Vars(r)["boardID"]
	if _, err := a.app.GetBoard(boardID); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	userID := getUserID(r)

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var patch *model.BoardPatch
	if err = json.Unmarshal(requestBody, &patch); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	if err = patch.IsValid(); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardProperties) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to modifying board properties"))
		return
	}

	if patch.Type != nil || patch.MinimumRole != nil {
		if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardType) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to modifying board type"))
			return
		}
	}
	if patch.ChannelID != nil {
		if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to modifying board access"))
			return
		}
	}
	// Card access rules decide who may read which cards, so editing them is
	// barred at the same level as editing board membership (FR-002), not at the
	// looser bar that guards ordinary board properties.
	if patchTouchesPropertyAccess(patch) {
		if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to modifying card access rules"))
			return
		}
	}
	// Whether a board is used as an OKR board says what kind of board it is,
	// which is a coarser statement than who may read which card. Switching it off
	// stops every new card from landing on its rung, for everyone at once, so it
	// is barred at the same level as the rules rather than at the looser bar that
	// guards ordinary board properties.
	if patchTouchesOkrBoard(patch) {
		if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to modifying OKR board settings"))
			return
		}
	}
	// The property editor lock itself. A switch that restricts editors is not a
	// restriction if an editor can turn it off.
	if patchTouchesAdminOnlyCardProperties(patch) {
		if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to modifying the card property lock"))
			return
		}
	}
	// What the board records, on a board that asked for this to be an admin's job.
	// A property's type or a select's options reach every card already filed under
	// them, which is why a board may put them behind the same bar as the rules.
	if patchTouchesCardProperties(patch) {
		locked, lockErr := a.boardLocksCardProperties(boardID)
		if lockErr != nil {
			a.errorResponse(w, r, lockErr)
			return
		}
		if locked && !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to modifying card properties"))
			return
		}
	}

	auditRec := a.makeAuditRecord(r, "patchBoard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("userID", userID)

	// patch board
	updatedBoard, err := a.app.PatchBoard(patch, boardID, userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("PatchBoard",
		mlog.String("boardID", boardID),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(updatedBoard)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

// patchTouchesPropertyAccess reports whether a board patch writes or clears the
// card access rule set.
func patchTouchesPropertyAccess(patch *model.BoardPatch) bool {
	if _, ok := patch.UpdatedProperties[model.PropertyAccessKey]; ok {
		return true
	}
	return slices.Contains(patch.DeletedProperties, model.PropertyAccessKey)
}

// boardLocksCardProperties reports whether this board put its property editor
// behind the board admin bar.
//
// Read from the board rather than carried in the request: the switch is the
// board's state, and a client that has not seen the latest one must not decide
// the answer.
func (a *API) boardLocksCardProperties(boardID string) (bool, error) {
	board, err := a.app.GetBoard(boardID)
	if err != nil {
		return false, err
	}
	if board == nil {
		return false, nil
	}
	return model.CardPropertiesAdminOnly(board.Properties), nil
}

// patchTouchesCardProperties reports whether a board patch changes what the board
// records — a property's name, type, required flag, or the options a select
// offers. All of those arrive the same way, so the five kinds are not told apart.
func patchTouchesCardProperties(patch *model.BoardPatch) bool {
	return len(patch.UpdatedCardProperties) > 0 || len(patch.DeletedCardProperties) > 0
}

// patchTouchesAdminOnlyCardProperties reports whether a board patch flips the
// property editor lock itself. Written and deleted are both asked about, the same
// way the OKR switch is.
func patchTouchesAdminOnlyCardProperties(patch *model.BoardPatch) bool {
	if _, ok := patch.UpdatedProperties[model.AdminOnlyCardPropertiesKey]; ok {
		return true
	}
	return slices.Contains(patch.DeletedProperties, model.AdminOnlyCardPropertiesKey)
}

// patchTouchesOkrBoard reports whether a board patch switches the OKR ladder on
// or off. Switching it on arrives as a written key and switching it off as a
// deleted one, so both shapes are asked about.
func patchTouchesOkrBoard(patch *model.BoardPatch) bool {
	if _, ok := patch.UpdatedProperties[model.OkrBoardKey]; ok {
		return true
	}
	return slices.Contains(patch.DeletedProperties, model.OkrBoardKey)
}

func (a *API) handleDeleteBoard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation DELETE /boards/{boardID} deleteBoard
	//
	// Removes a board
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
	//   '404':
	//     description: board not found
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	// Check if board exists
	if _, err := a.app.GetBoard(boardID); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionDeleteBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to delete board"))
		return
	}

	auditRec := a.makeAuditRecord(r, "deleteBoard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("boardID", boardID)

	if err := a.app.DeleteBoard(boardID, userID); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("DELETE Board", mlog.String("boardID", boardID))
	jsonStringResponse(w, http.StatusOK, "{}")

	auditRec.Success()
}

func (a *API) handleDuplicateBoard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /boards/{boardID}/duplicate duplicateBoard
	//
	// Returns the new created board and all the blocks
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
	//     schema:
	//       $ref: '#/definitions/BoardsAndBlocks'
	//   '404':
	//     description: board not found
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)
	query := r.URL.Query()
	asTemplate := query.Get("asTemplate")
	toTeam := query.Get("toTeam")

	if userID == "" {
		a.errorResponse(w, r, model.NewErrUnauthorized("access denied to board"))
		return
	}

	board, err := a.app.GetBoard(boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	if toTeam == "" {
		toTeam = board.TeamID
	}

	if toTeam == "" && !a.permissions.HasPermissionToTeam(userID, board.TeamID, model.PermissionViewTeam) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to team"))
		return
	}

	if toTeam != "" && !a.permissions.HasPermissionToTeam(userID, toTeam, model.PermissionViewTeam) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to team"))
		return
	}

	if board.IsTemplate && board.Type == model.BoardTypeOpen {
		if board.TeamID != model.GlobalTeamID && !a.permissions.HasPermissionToTeam(userID, board.TeamID, model.PermissionViewTeam) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
			return
		}
	} else {
		if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
			return
		}
	}

	isGuest, err := a.userIsGuest(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	if isGuest {
		a.errorResponse(w, r, model.NewErrPermission("access denied to create board"))
		return
	}

	auditRec := a.makeAuditRecord(r, "duplicateBoard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("boardID", boardID)

	a.logger.Debug("DuplicateBoard",
		mlog.String("boardID", boardID),
	)

	boardsAndBlocks, _, err := a.app.DuplicateBoard(boardID, userID, toTeam, asTemplate == True)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(boardsAndBlocks)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleUndeleteBoard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /boards/{boardID}/undelete undeleteBoard
	//
	// Undeletes a board
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: boardID
	//   in: path
	//   description: ID of board to undelete
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	ctx := r.Context()
	session := ctx.Value(sessionContextKey).(*model.Session)
	userID := session.UserID

	vars := mux.Vars(r)
	boardID := vars["boardID"]

	auditRec := a.makeAuditRecord(r, "undeleteBoard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("boardID", boardID)

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionDeleteBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to undelete board"))
		return
	}

	err := a.app.UndeleteBoard(boardID, userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("UNDELETE Board", mlog.String("boardID", boardID))
	jsonStringResponse(w, http.StatusOK, "{}")

	auditRec.Success()
}

func (a *API) handleGetBoardMetadata(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /boards/{boardID}/metadata getBoardMetadata
	//
	// Returns a board's metadata
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
	//     schema:
	//       "$ref": "#/definitions/BoardMetadata"
	//   '404':
	//     description: board not found
	//   '501':
	//     description: required license not found
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	boardID := mux.Vars(r)["boardID"]
	userID := getUserID(r)

	board, boardMetadata, err := a.app.GetBoardMetadata(boardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	if board == nil || boardMetadata == nil {
		a.errorResponse(w, r, model.NewErrNotFound("board metadata BoardID="+boardID))
		return
	}

	if board.Type == model.BoardTypePrivate {
		if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
			a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
			return
		}
	} else {
		if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
			if !a.permissions.HasPermissionToTeam(userID, board.TeamID, model.PermissionViewTeam) {
				a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
				return
			}
		}
	}

	auditRec := a.makeAuditRecord(r, "getBoardMetadata", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("boardID", boardID)

	data, err := json.Marshal(boardMetadata)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleSendBoardNotification(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	vars := mux.Vars(r)
	boardID := vars["boardID"]

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
		return
	}

	// 요청 본문에서 cardID 읽기
	var requestBody struct {
		CardID string `json:"cardID"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid request body"))
		return
	}
	if strings.TrimSpace(requestBody.CardID) == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("cardID is required"))
		return
	}

	// Auto-notify endpoint: sends subscription-based diff notifications.
	err := a.app.SendCardNotification(boardID, userID, requestBody.CardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonStringResponse(w, http.StatusOK, "{}")
}

func (a *API) handleSendBoardShareNotification(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	vars := mux.Vars(r)
	boardID := vars["boardID"]

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to board"))
		return
	}

	var requestBody struct {
		CardID string `json:"cardID"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid request body"))
		return
	}
	if strings.TrimSpace(requestBody.CardID) == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("cardID is required"))
		return
	}

	// Explicit share endpoint: posts a channel share message with links.
	err := a.app.SendCardShareNotification(boardID, userID, requestBody.CardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonStringResponse(w, http.StatusOK, "{}")
}
