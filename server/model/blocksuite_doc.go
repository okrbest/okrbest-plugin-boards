// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"encoding/json"
	"fmt"
	"io"
)

// ErrBlockSuiteDocNotFound is returned when a BlockSuite document is not found.
type ErrBlockSuiteDocNotFound struct {
	id string
}

func NewErrBlockSuiteDocNotFound(id string) *ErrBlockSuiteDocNotFound {
	return &ErrBlockSuiteDocNotFound{id: id}
}

func (e *ErrBlockSuiteDocNotFound) Error() string {
	return fmt.Sprintf("blocksuite document not found: %s", e.id)
}

// ErrInvalidBlockSuiteDoc is returned when a BlockSuite document fails validation.
type ErrInvalidBlockSuiteDoc struct {
	msg string
}

func NewErrInvalidBlockSuiteDoc(msg string) *ErrInvalidBlockSuiteDoc {
	return &ErrInvalidBlockSuiteDoc{msg: msg}
}

func (e *ErrInvalidBlockSuiteDoc) Error() string {
	return fmt.Sprintf("invalid blocksuite document: %s", e.msg)
}

// BlockSuiteDoc represents a BlockSuite editor document stored in the database.
// It contains a snapshot of the Yjs document state in binary format.
// swagger:model
type BlockSuiteDoc struct {
	// The ID for the document (typically same as CardID)
	// required: true
	DocID string `json:"docId"`

	// The ID of the card this document belongs to
	// required: true
	CardID string `json:"cardId"`

	// The ID of the board for filtering/permissions
	// required: true
	BoardID string `json:"boardId"`

	// The Yjs document snapshot in binary format
	// required: true
	Snapshot []byte `json:"-"`

	// The creation timestamp in milliseconds
	// required: false
	CreatedAt int64 `json:"createdAt,omitempty"`

	// The last update timestamp in milliseconds
	// required: false
	UpdatedAt int64 `json:"updatedAt,omitempty"`

	// The user ID who created this document
	// required: false
	CreatedBy string `json:"createdBy,omitempty"`

	// The user ID who last updated this document
	// required: false
	UpdatedBy string `json:"updatedBy,omitempty"`

	// Plaintext content extracted from the document for search/indexing
	// required: false
	ContentText string `json:"contentText,omitempty"`

	// Summary of the last diff/change made to the document
	// required: false
	LastDiffSummary string `json:"last_diff_summary,omitempty"`
}

// BlockSuiteDocInfo represents metadata about a BlockSuite document (without the snapshot).
// This is useful for listing documents without loading the full binary data.
// swagger:model
type BlockSuiteDocInfo struct {
	// The ID for the document
	// required: true
	DocID string `json:"docId"`

	// The ID of the card this document belongs to
	// required: true
	CardID string `json:"cardId"`

	// The ID of the board
	// required: true
	BoardID string `json:"boardId"`

	// The creation timestamp in milliseconds
	// required: false
	CreatedAt int64 `json:"createdAt,omitempty"`

	// The last update timestamp in milliseconds
	// required: false
	UpdatedAt int64 `json:"updatedAt,omitempty"`

	// The user ID who created this document
	// required: false
	CreatedBy string `json:"createdBy,omitempty"`

	// The user ID who last updated this document
	// required: false
	UpdatedBy string `json:"updatedBy,omitempty"`
}

// IsValid validates the BlockSuiteDoc structure.
func (d *BlockSuiteDoc) IsValid() error {
	if d.DocID == "" {
		return NewErrInvalidBlockSuiteDoc("doc_id cannot be empty")
	}
	if d.CardID == "" {
		return NewErrInvalidBlockSuiteDoc("card_id cannot be empty")
	}
	if d.BoardID == "" {
		return NewErrInvalidBlockSuiteDoc("board_id cannot be empty")
	}
	if d.Snapshot == nil {
		return NewErrInvalidBlockSuiteDoc("snapshot cannot be nil")
	}
	return nil
}

// ToInfo converts a BlockSuiteDoc to BlockSuiteDocInfo (metadata only).
func (d *BlockSuiteDoc) ToInfo() *BlockSuiteDocInfo {
	return &BlockSuiteDocInfo{
		DocID:     d.DocID,
		CardID:    d.CardID,
		BoardID:   d.BoardID,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
		CreatedBy: d.CreatedBy,
		UpdatedBy: d.UpdatedBy,
	}
}

// BlockSuiteDocPatch represents a partial update to a BlockSuiteDoc.
// swagger:model
type BlockSuiteDocPatch struct {
	// The Yjs document snapshot in binary format
	// required: false
	Snapshot *[]byte `json:"snapshot,omitempty"`

	// The last update timestamp in milliseconds
	// required: false
	UpdatedAt *int64 `json:"updatedAt,omitempty"`

	// The user ID who last updated this document
	// required: false
	UpdatedBy *string `json:"updatedBy,omitempty"`
}

// Patch applies a BlockSuiteDocPatch to a BlockSuiteDoc.
func (d *BlockSuiteDoc) Patch(patch *BlockSuiteDocPatch) {
	if patch.Snapshot != nil {
		d.Snapshot = *patch.Snapshot
	}
	if patch.UpdatedAt != nil {
		d.UpdatedAt = *patch.UpdatedAt
	}
	if patch.UpdatedBy != nil {
		d.UpdatedBy = *patch.UpdatedBy
	}
}

// BlockSuiteDocFromJSON decodes a BlockSuiteDoc from JSON.
func BlockSuiteDocFromJSON(data io.Reader) (*BlockSuiteDoc, error) {
	var doc BlockSuiteDoc
	if err := json.NewDecoder(data).Decode(&doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

// BlockSuiteDocInfoFromJSON decodes a BlockSuiteDocInfo from JSON.
func BlockSuiteDocInfoFromJSON(data io.Reader) (*BlockSuiteDocInfo, error) {
	var info BlockSuiteDocInfo
	if err := json.NewDecoder(data).Decode(&info); err != nil {
		return nil, err
	}
	return &info, nil
}
