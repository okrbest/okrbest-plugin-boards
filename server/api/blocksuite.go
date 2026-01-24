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
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	mmModel "github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (a *API) registerBlockSuiteRoutes(r *mux.Router) {
	// BlockSuite Document APIs
	r.HandleFunc("/cards/{cardID}/blocksuite/content", a.sessionRequired(a.handleGetCardBlockSuiteContent)).Methods("GET")
	r.HandleFunc("/cards/{cardID}/blocksuite/content", a.sessionRequired(a.handleSaveCardBlockSuiteContent)).Methods("PUT")
	r.HandleFunc("/cards/{cardID}/blocksuite/info", a.sessionRequired(a.handleGetCardBlockSuiteInfo)).Methods("GET")
	r.HandleFunc("/cards/{cardID}/blocksuite", a.sessionRequired(a.handleDeleteCardBlockSuiteDoc)).Methods("DELETE")
}

func (a *API) handleGetCardBlockSuiteContent(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /cards/{cardID}/blocksuite/content getCardBlockSuiteContent
	//
	// Fetches the BlockSuite document content (Yjs snapshot) for the specified card.
	//
	// ---
	// produces:
	// - application/octet-stream
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
	//       type: string
	//       format: binary
	//   '404':
	//     description: document not found
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	auditRec := a.makeAuditRecord(r, "getCardBlockSuiteContent", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("cardID", cardID)

	// Get card to check board permissions
	card, err := a.app.GetCardByID(cardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, card.BoardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to view card"))
		return
	}

	// Get BlockSuite document
	doc, err := a.app.GetBlockSuiteDocByCardID(cardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("GetCardBlockSuiteContent",
		mlog.String("cardID", cardID),
		mlog.String("docID", doc.DocID),
		mlog.String("userID", userID),
		mlog.Int("snapshotSize", len(doc.Snapshot)),
	)

	// Return binary snapshot
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(doc.Snapshot)

	auditRec.Success()
}

func (a *API) handleSaveCardBlockSuiteContent(w http.ResponseWriter, r *http.Request) {
	// swagger:operation PUT /cards/{cardID}/blocksuite/content saveCardBlockSuiteContent
	//
	// Saves the BlockSuite document content (Yjs snapshot) for the specified card.
	//
	// ---
	// consumes:
	// - application/octet-stream
	// produces:
	// - application/json
	// parameters:
	// - name: cardID
	//   in: path
	//   description: Card ID
	//   required: true
	//   type: string
	// - name: body
	//   in: body
	//   description: Yjs document snapshot (binary)
	//   required: true
	//   schema:
	//     type: string
	//     format: binary
	// security:
	// - BearerAuth: []
	// responses:
	//   '200':
	//     description: success
	//     schema:
	//       "$ref": "#/definitions/BlockSuiteDocInfo"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	auditRec := a.makeAuditRecord(r, "saveCardBlockSuiteContent", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("cardID", cardID)

	// Get card to check board permissions
	card, err := a.app.GetCardByID(cardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	// Check permissions: board card management permission OR system admin (for batch migration)
	hasBoardPermission := a.permissions.HasPermissionToBoard(userID, card.BoardID, model.PermissionManageBoardCards)
	isSystemAdmin := a.permissions.HasPermissionTo(userID, mmModel.PermissionGetAnalytics)

	if !hasBoardPermission && !isSystemAdmin {
		a.errorResponse(w, r, model.NewErrPermission("access denied to modify card"))
		return
	}

	// Read binary snapshot from request body
	snapshot, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("failed to read request body"))
		return
	}

	// Create/Update BlockSuite document
	now := utils.GetMillis()
	doc := &model.BlockSuiteDoc{
		DocID:     cardID, // Use cardID as docID for simplicity
		CardID:    cardID,
		BoardID:   card.BoardID,
		Snapshot:  snapshot,
		CreatedAt: now,
		UpdatedAt: now,
		CreatedBy: userID,
		UpdatedBy: userID,
	}

	err = a.app.UpsertBlockSuiteDoc(doc)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("SaveCardBlockSuiteContent",
		mlog.String("cardID", cardID),
		mlog.String("docID", doc.DocID),
		mlog.String("userID", userID),
		mlog.Int("snapshotSize", len(snapshot)),
	)

	// Return document info
	info := doc.ToInfo()
	data, err := json.Marshal(info)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.Success()
}

func (a *API) handleGetCardBlockSuiteInfo(w http.ResponseWriter, r *http.Request) {
	// swagger:operation GET /cards/{cardID}/blocksuite/info getCardBlockSuiteInfo
	//
	// Fetches metadata about the BlockSuite document for the specified card (without the snapshot).
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
	//       "$ref": "#/definitions/BlockSuiteDocInfo"
	//   '404':
	//     description: document not found
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	auditRec := a.makeAuditRecord(r, "getCardBlockSuiteInfo", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)
	auditRec.AddMeta("cardID", cardID)

	// Get card to check board permissions
	card, err := a.app.GetCardByID(cardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, card.BoardID, model.PermissionViewBoard) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to view card"))
		return
	}

	// Get BlockSuite document info
	info, err := a.app.GetBlockSuiteDocInfoByCardID(cardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("GetCardBlockSuiteInfo",
		mlog.String("cardID", cardID),
		mlog.String("docID", info.DocID),
		mlog.String("userID", userID),
	)

	data, err := json.Marshal(info)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.Success()
}

func (a *API) handleDeleteCardBlockSuiteDoc(w http.ResponseWriter, r *http.Request) {
	// swagger:operation DELETE /cards/{cardID}/blocksuite deleteCardBlockSuiteDoc
	//
	// Deletes the BlockSuite document for the specified card.
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
	//   '404':
	//     description: document not found
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"
	//   default:
	//     description: internal error
	//     schema:
	//       "$ref": "#/definitions/ErrorResponse"

	userID := getUserID(r)
	cardID := mux.Vars(r)["cardID"]

	auditRec := a.makeAuditRecord(r, "deleteCardBlockSuiteDoc", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("cardID", cardID)

	// Get card to check board permissions
	card, err := a.app.GetCardByID(cardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	if !a.permissions.HasPermissionToBoard(userID, card.BoardID, model.PermissionManageBoardCards) {
		a.errorResponse(w, r, model.NewErrPermission("access denied to modify card"))
		return
	}

	// Delete BlockSuite document
	err = a.app.DeleteBlockSuiteDocByCardID(cardID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	a.logger.Debug("DeleteCardBlockSuiteDoc",
		mlog.String("cardID", cardID),
		mlog.String("userID", userID),
	)

	jsonStringResponse(w, http.StatusOK, "{}")
	auditRec.Success()
}
