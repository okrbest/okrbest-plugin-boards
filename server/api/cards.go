// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/audit"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	defaultPage    = "0"
	defaultPerPage = "100"
)

func (a *API) registerCardsRoutes(r *mux.Router) {
	// Cards APIs
	r.HandleFunc("/boards/{boardID}/cards", a.sessionRequired(a.handleCreateCard)).Methods("POST")
	r.HandleFunc("/boards/{boardID}/cards", a.sessionRequired(a.handleGetCards)).Methods("GET")
	r.HandleFunc("/boards/{boardID}/cards/by-ids", a.sessionRequired(a.handleQueryCardsByIDs)).Methods("POST")
	r.HandleFunc("/cards/{cardID}", a.sessionRequired(a.handlePatchCard)).Methods("PATCH")
	r.HandleFunc("/cards/{cardID}", a.sessionRequired(a.handleGetCard)).Methods("GET")

	// Sub-cards APIs
	r.HandleFunc("/boards/{boardID}/cards/{parentCardID}/subcards", a.sessionRequired(a.handleCreateSubCard)).Methods("POST")
	r.HandleFunc("/cards/{cardID}/subcards", a.sessionRequired(a.handleGetSubCards)).Methods("GET")
	r.HandleFunc("/cards/{cardID}/subcards/count", a.sessionRequired(a.handleGetSubCardCount)).Methods("GET")

	r.HandleFunc("/cards/{cardID}/link", a.sessionRequired(a.handleLinkCardAsSubCard)).Methods("POST")
	r.HandleFunc("/cards/{cardID}/link", a.sessionRequired(a.handleUnlinkSubCard)).Methods("DELETE")
}

func (a *API) handleCreateCard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /boards/{boardID}/cards createCard
	//
	// Creates a new card for the specified board.
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
	//   description: the card to create
	//   required: true
	//   schema:
	//     "$ref": "#/definitions/Card"
	// - name: disable_notify
	//   in: query
	//   description: Disables notifications (for bulk data inserting)
	//   required: false
	//   type: bool
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       $ref: '#/definitions/Card'
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	boardID := mux.Vars(r)["boardID"]

	val := r.URL.Query().Get("disable_notify")
	disableNotify := val == True

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var newCard *model.Card
	if err = json.Unmarshal(requestBody, &newCard); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to create card"))
		return
	}

	if newCard.BoardID != "" && newCard.BoardID != boardID {
		a.errorResponse(w, r, model.ErrBoardIDMismatch)
		return
	}

	newCard.PopulateWithBoardID(boardID)
	if err = newCard.CheckValid(); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	auditRec := a.makeAuditRecord(r, "createCard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("boardID", boardID)

	// create card
	card, err := a.app.CreateCard(newCard, boardID, userID, disableNotify)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("CreateCard",
		mlog.String("boardID", boardID),
		mlog.String("cardID", card.ID),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(card)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleGetCards(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /boards/{boardID}/cards getCards
	//
	// Fetches cards for the specified board.
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
	// - name: page
	//   in: query
	//   description: The page to select (default=0)
	//   required: false
	//   type: integer
	// - name: per_page
	//   in: query
	//   description: Number of cards to return per page(default=100)
	//   required: false
	//   type: integer
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       type: array
	//       items:
	//         "$ref": "#/definitions/Card"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"
	userID := getUserID(r)
	boardID := mux.Vars(r)["boardID"]

	query := r.URL.Query()
	strPage := query.Get("page")
	strPerPage := query.Get("per_page")

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to fetch cards"))
		return
	}

	if strPage == "" {
		strPage = defaultPage
	}
	if strPerPage == "" {
		strPerPage = defaultPerPage
	}

	page, err := strconv.Atoi(strPage)
	if err != nil {
		message := fmt.Sprintf("invalid `page` parameter: %s", err)
		a.errorResponse(w, r, model.NewErrBadRequest(message))
	}

	perPage, err := strconv.Atoi(strPerPage)
	if err != nil {
		message := fmt.Sprintf("invalid `per_page` parameter: %s", err)
		a.errorResponse(w, r, model.NewErrBadRequest(message))
	}

	auditRec := a.makeAuditRecord(r, "getCards", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("page", page)
	auditRec.AddMeta("per_page", perPage)

	cards, err := a.app.GetCardsForBoard(boardID, page, perPage)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	cards, err = a.app.FilterCardsForUser(userID, boardID, cards)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("GetCards",
		mlog.String("boardID", boardID),
		mlog.String("userID", userID),
		mlog.Int("page", page),
		mlog.Int("per_page", perPage),
		mlog.Int("count", len(cards)),
	)

	data, err := json.Marshal(cards)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

type queryCardsByIDsRequest struct {
	IDs []string `json:"ids"`
}

func (a *API) handleQueryCardsByIDs(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	boardID := mux.Vars(r)["boardID"]

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to fetch cards"))
		return
	}

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var request queryCardsByIDsRequest
	if len(requestBody) > 0 {
		if err = json.Unmarshal(requestBody, &request); err != nil {
			a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
			return
		}
	}

	auditRec := a.makeAuditRecord(r, "queryCardsByIDs", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("idsCount", len(request.IDs))

	cards, err := a.app.GetCardsByIDs(boardID, request.IDs)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	cards, err = a.app.FilterCardsForUser(userID, boardID, cards)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("QueryCardsByIDs",
		mlog.String("boardID", boardID),
		mlog.String("userID", userID),
		mlog.Int("idsCount", len(request.IDs)),
		mlog.Int("count", len(cards)),
	)

	data, err := json.Marshal(cards)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.Success()
}

func (a *API) handlePatchCard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation PATCH /cards/{cardID}/cards patchCard
	//
	// Patches the specified card.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: cardID
	//   in: path
	//   description: Card ID
	//   required: true
	//   type: string
	// - name: Body
	//   in: body
	//   description: the card patch
	//   required: true
	//   schema:
	//     "$ref": "#/definitions/CardPatch"
	// - name: disable_notify
	//   in: query
	//   description: Disables notifications (for bulk data patching)
	//   required: false
	//   type: bool
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       $ref: '#/definitions/Card'
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	val := r.URL.Query().Get("disable_notify")
	disableNotify := val == True

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	card, err := a.app.GetCardByID(cardID)
	if err != nil {
		message := fmt.Sprintf("could not fetch card %s: %s", cardID, err)
		a.errorResponse(w, r, model.NewErrBadRequest(message))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, card.BoardID, model.PermissionManageBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to patch card"))
		return
	}

	var patch *model.CardPatch
	if err = json.Unmarshal(requestBody, &patch); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	auditRec := a.makeAuditRecord(r, "patchCard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("boardID", card.BoardID)
	auditRec.AddMeta("cardID", card.ID)

	// patch card
	cardPatched, err := a.app.PatchCard(patch, card.ID, userID, disableNotify)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("PatchCard",
		mlog.String("boardID", cardPatched.BoardID),
		mlog.String("cardID", cardPatched.ID),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(cardPatched)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleGetCard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /cards/{cardID} getCard
	//
	// Fetches the specified card.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
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
	//       $ref: '#/definitions/Card'
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	card, err := a.app.GetCardByID(cardID)
	if err != nil {
		message := fmt.Sprintf("could not fetch card %s: %s", cardID, err)
		a.errorResponse(w, r, model.NewErrBadRequest(message))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, card.BoardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to fetch card"))
		return
	}

	auditRec := a.makeAuditRecord(r, "getCard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("boardID", card.BoardID)
	auditRec.AddMeta("cardID", card.ID)

	a.logger.Debug("GetCard",
		mlog.String("boardID", card.BoardID),
		mlog.String("cardID", card.ID),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(card)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleCreateSubCard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /boards/{boardID}/cards/{parentCardID}/subcards createSubCard
	//
	// Creates a new sub-card under the specified parent card.
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
	// - name: parentCardID
	//   in: path
	//   description: Parent Card ID
	//   required: true
	//   type: string
	// - name: Body
	//   in: body
	//   description: the sub-card to create
	//   required: true
	//   schema:
	//     "$ref": "#/definitions/Card"
	// - name: disable_notify
	//   in: query
	//   description: Disables notifications (for bulk data inserting)
	//   required: false
	//   type: bool
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       $ref: '#/definitions/Card'
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	vars := mux.Vars(r)
	boardID := vars["boardID"]
	parentCardID := vars["parentCardID"]

	val := r.URL.Query().Get("disable_notify")
	disableNotify := val == True

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var newCard *model.Card
	if err = json.Unmarshal(requestBody, &newCard); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to create sub-card"))
		return
	}

	if newCard.BoardID != "" && newCard.BoardID != boardID {
		a.errorResponse(w, r, model.ErrBoardIDMismatch)
		return
	}

	newCard.PopulateWithBoardID(boardID)

	auditRec := a.makeAuditRecord(r, "createSubCard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("boardID", boardID)
	auditRec.AddMeta("parentCardID", parentCardID)

	// create sub-card
	card, err := a.app.CreateSubCard(newCard, parentCardID, boardID, userID, disableNotify)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("CreateSubCard",
		mlog.String("boardID", boardID),
		mlog.String("parentCardID", parentCardID),
		mlog.String("cardID", card.ID),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(card)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleGetSubCards(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /cards/{cardID}/subcards getSubCards
	//
	// Fetches sub-cards for the specified parent card.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: cardID
	//   in: path
	//   description: Parent Card ID
	//   required: true
	//   type: string
	// - name: page
	//   in: query
	//   description: The page to select (default=0)
	//   required: false
	//   type: integer
	// - name: per_page
	//   in: query
	//   description: Number of cards to return per page (default=100)
	//   required: false
	//   type: integer
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       type: array
	//       items:
	//         "$ref": "#/definitions/Card"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	query := r.URL.Query()
	strPage := query.Get("page")
	strPerPage := query.Get("per_page")

	// Get parent card to check board permission
	parentCard, err := a.app.GetCardByID(cardID)
	if err != nil {
		a.errorResponse(w, r, model.NewErrNotFound("parent card not found"))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, parentCard.BoardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to fetch sub-cards"))
		return
	}

	if strPage == "" {
		strPage = defaultPage
	}
	if strPerPage == "" {
		strPerPage = defaultPerPage
	}

	page, err := strconv.Atoi(strPage)
	if err != nil {
		message := fmt.Sprintf("invalid `page` parameter: %s", err)
		a.errorResponse(w, r, model.NewErrBadRequest(message))
		return
	}

	perPage, err := strconv.Atoi(strPerPage)
	if err != nil {
		message := fmt.Sprintf("invalid `per_page` parameter: %s", err)
		a.errorResponse(w, r, model.NewErrBadRequest(message))
		return
	}

	auditRec := a.makeAuditRecord(r, "getSubCards", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("parentCardID", cardID)
	auditRec.AddMeta("page", page)
	auditRec.AddMeta("per_page", perPage)

	cards, err := a.app.GetSubCards(cardID, page, perPage)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("GetSubCards",
		mlog.String("parentCardID", cardID),
		mlog.String("userID", userID),
		mlog.Int("page", page),
		mlog.Int("per_page", perPage),
		mlog.Int("count", len(cards)),
	)

	data, err := json.Marshal(cards)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleGetSubCardCount(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /cards/{cardID}/subcards/count getSubCardCount
	//
	// Returns the count of sub-cards for the specified parent card.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: cardID
	//   in: path
	//   description: Parent Card ID
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       type: object
	//       properties:
	//         count:
	//           type: integer
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	// Get parent card to check board permission
	parentCard, err := a.app.GetCardByID(cardID)
	if err != nil {
		a.errorResponse(w, r, model.NewErrNotFound("parent card not found"))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, parentCard.BoardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to fetch sub-card count"))
		return
	}

	auditRec := a.makeAuditRecord(r, "getSubCardCount", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("parentCardID", cardID)

	count, err := a.app.GetSubCardCount(cardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("GetSubCardCount",
		mlog.String("parentCardID", cardID),
		mlog.String("userID", userID),
		mlog.Int("count", count),
	)

	response := map[string]int{"count": count}
	data, err := json.Marshal(response)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// response
	jsonBytesResponse(w, http.StatusOK, data)

	auditRec.Success()
}

func (a *API) handleLinkCardAsSubCard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation POST /cards/{cardID}/link linkCardAsSubCard
	//
	// Links an existing card as a sub-card of the specified parent card.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: cardID
	//   in: path
	//   description: Card ID to link as sub-card
	//   required: true
	//   type: string
	// - name: Body
	//   in: body
	//   description: the parent card ID
	//   required: true
	//   schema:
	//     type: object
	//     properties:
	//       parentCardId:
	//         type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       $ref: '#/definitions/Card'
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var linkRequest struct {
		ParentCardID string `json:"parentCardId"`
	}
	if err = json.Unmarshal(requestBody, &linkRequest); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest(err.Error()))
		return
	}

	if linkRequest.ParentCardID == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("parentCardId is required"))
		return
	}

	card, err := a.app.GetCardByID(cardID)
	if err != nil {
		a.errorResponse(w, r, model.NewErrNotFound("card not found"))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, card.BoardID, model.PermissionManageBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to link card"))
		return
	}

	auditRec := a.makeAuditRecord(r, "linkCardAsSubCard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("cardID", cardID)
	auditRec.AddMeta("parentCardID", linkRequest.ParentCardID)

	linkedCard, err := a.app.LinkCardAsSubCard(cardID, linkRequest.ParentCardID, userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("LinkCardAsSubCard",
		mlog.String("cardID", cardID),
		mlog.String("parentCardID", linkRequest.ParentCardID),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(linkedCard)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.Success()
}

func (a *API) handleUnlinkSubCard(w http.ResponseWriter, r *http.Request) {
	// swagger:operation DELETE /cards/{cardID}/link unlinkSubCard
	//
	// Unlinks a sub-card and makes it a top-level card.
	//
	// ---
	// produces:
	// - application/json
	// parameters:
	// - name: cardID
	//   in: path
	//   description: Card ID to unlink
	//   required: true
	//   type: string
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       $ref: '#/definitions/Card'
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	card, err := a.app.GetCardByID(cardID)
	if err != nil {
		a.errorResponse(w, r, model.NewErrNotFound("card not found"))
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, card.BoardID, model.PermissionManageBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to unlink card"))
		return
	}

	auditRec := a.makeAuditRecord(r, "unlinkSubCard", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("cardID", cardID)

	unlinkedCard, err := a.app.UnlinkSubCard(cardID, userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("UnlinkSubCard",
		mlog.String("cardID", cardID),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(unlinkedCard)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.Success()
}
