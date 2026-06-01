// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/wiggin77/merror"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// archiveBlockSuiteDoc is used for serializing BlockSuiteDoc in archive files.
// The Snapshot field uses json:"snapshot" (not "-") so it gets base64-encoded.
type archiveBlockSuiteDoc struct {
	DocID       string `json:"docId"`
	CardID      string `json:"cardId"`
	BoardID     string `json:"boardId"`
	Snapshot    []byte `json:"snapshot"`
	ContentText string `json:"contentText,omitempty"`
}

type archiveFilesMeta struct {
	Files map[string]string `json:"files"`
}

var (
	newline = []byte{'\n'}
)

func (a *App) ExportArchive(w io.Writer, opt model.ExportArchiveOptions) (errs error) {
	boards, err := a.getBoardsForArchive(opt.BoardIDs)
	if err != nil {
		return err
	}

	merr := merror.New()
	defer func() {
		errs = merr.ErrorOrNil()
	}()

	// wrap the writer in a zip.
	zw := zip.NewWriter(w)
	defer func() {
		merr.Append(zw.Close())
	}()

	if err := a.writeArchiveVersion(zw); err != nil {
		merr.Append(err)
		return
	}

	for _, board := range boards {
		if err := a.writeArchiveBoard(zw, board, opt); err != nil {
			merr.Append(fmt.Errorf("cannot export board %s: %w", board.ID, err))
			return
		}
	}
	return nil
}

// writeArchiveVersion writes a version file to the zip.
func (a *App) writeArchiveVersion(zw *zip.Writer) error {
	archiveHeader := model.ArchiveHeader{
		Version: archiveVersion,
		Date:    model.GetMillis(),
	}
	b, _ := json.Marshal(&archiveHeader)

	w, err := zw.Create("version.json")
	if err != nil {
		return fmt.Errorf("cannot write archive header: %w", err)
	}

	if _, err := w.Write(b); err != nil {
		return fmt.Errorf("cannot write archive header: %w", err)
	}
	return nil
}

// writeArchiveBoard writes a single board to the archive in a zip directory.
func (a *App) writeArchiveBoard(zw *zip.Writer, board model.Board, opt model.ExportArchiveOptions) error {
	// create a directory per board
	w, err := zw.Create(board.ID + "/board.jsonl")
	if err != nil {
		return err
	}

	// write the board block first
	if err = a.writeArchiveBoardLine(w, board); err != nil {
		return err
	}

	var files []string
	// write the board's blocks
	// TODO: paginate this
	blocks, err := a.GetBlocksForBoard(board.ID)
	if err != nil {
		return err
	}

	for _, block := range blocks {
		if err = a.writeArchiveBlockLine(w, block); err != nil {
			return err
		}
		if block.Type == model.TypeImage || block.Type == model.TypeAttachment {
			filename, err2 := extractFilename(block)
			if err2 != nil {
				return err2
			}
			files = append(files, filename)
		}
	}

	boardMembers, err := a.GetMembersForBoard(board.ID)
	if err != nil {
		return err
	}

	for _, boardMember := range boardMembers {
		if err = a.writeArchiveBoardMemberLine(w, boardMember); err != nil {
			return err
		}
	}

	// write BlockSuite docs
	bsDocs, err := a.store.GetBlockSuiteDocsByBoardID(board.ID)
	if err != nil {
		return err
	}
	bsDocsByCardID := make(map[string]*model.BlockSuiteDoc, len(bsDocs))
	for _, doc := range bsDocs {
		bsDocsByCardID[doc.CardID] = doc
		if err = a.writeArchiveBlockSuiteDocLine(w, doc); err != nil {
			return err
		}
		// collect file IDs embedded in BlockSuite snapshots (affine:image via blobMap)
		for _, fileID := range extractBlockSuiteFileIDs(doc.Snapshot) {
			files = append(files, fileID)
		}
	}

	// write per-card markdown files
	a.writeArchiveCardMarkdownFiles(zw, board, blocks, bsDocsByCardID)

	// Persist original display names so import can restore attachment titles.
	if err := a.writeArchiveFilesMeta(zw, board.ID, files); err != nil {
		return err
	}

	// write the files (legacy blocks + BlockSuite embedded images)
	for _, filename := range files {
		if err := a.writeArchiveFile(zw, filename, board.ID, opt); err != nil {
			return fmt.Errorf("cannot write file %s to archive: %w", filename, err)
		}
	}
	return nil
}

// extractBlockSuiteFileIDs parses a BlockSuite snapshot and returns all blob/file IDs
// registered in the snapshot's blobMap (used by affine:image blocks).
func extractBlockSuiteFileIDs(snapshot []byte) []string {
	if len(snapshot) == 0 {
		return nil
	}
	var ds DocSnapshot
	if err := json.Unmarshal(snapshot, &ds); err != nil {
		return nil
	}
	ids := make([]string, 0, len(ds.Meta.BlobMap))
	for _, fileID := range ds.Meta.BlobMap {
		if fileID != "" {
			ids = append(ids, fileID)
		}
	}
	return ids
}

// writeArchiveBlockSuiteDocLine writes a single BlockSuite document to the archive.
func (a *App) writeArchiveBlockSuiteDocLine(w io.Writer, doc *model.BlockSuiteDoc) error {
	archiveDoc := archiveBlockSuiteDoc{
		DocID:       doc.DocID,
		CardID:      doc.CardID,
		BoardID:     doc.BoardID,
		Snapshot:    doc.Snapshot,
		ContentText: doc.ContentText,
	}
	b, err := json.Marshal(&archiveDoc)
	if err != nil {
		return err
	}
	line := model.ArchiveLine{
		Type: "blocksuitedoc",
		Data: b,
	}
	b, err = json.Marshal(&line)
	if err != nil {
		return err
	}
	if _, err = w.Write(b); err != nil {
		return err
	}
	_, err = w.Write(newline)
	return err
}

// writeArchiveCardMarkdownFiles writes a .md file for each card into the archive.
func (a *App) writeArchiveCardMarkdownFiles(zw *zip.Writer, board model.Board, blocks []*model.Block, bsDocsByCardID map[string]*model.BlockSuiteDoc) {
	for _, block := range blocks {
		if block.Type != model.TypeCard {
			continue
		}

		bsDoc := bsDocsByCardID[block.ID]
		md := cardToMarkdown(board, block, blocks, bsDoc)

		filename := sanitizeFilename(block.Title)
		if filename == "" {
			filename = block.ID
		}

		fw, err := zw.Create(board.ID + "/cards/" + filename + ".md")
		if err != nil {
			a.logger.Warn("cannot create .md file in archive",
				mlog.String("cardID", block.ID),
				mlog.Err(err),
			)
			continue
		}
		if _, err := io.WriteString(fw, md); err != nil {
			a.logger.Warn("cannot write .md file in archive",
				mlog.String("cardID", block.ID),
				mlog.Err(err),
			)
		}
	}
}

func (a *App) writeArchiveFilesMeta(zw *zip.Writer, boardID string, files []string) error {
	if len(files) == 0 {
		return nil
	}

	meta := make(map[string]string, len(files))
	for _, archiveFileName := range files {
		if _, exists := meta[archiveFileName]; exists {
			continue
		}

		fileInfo, err := a.GetFileInfo(archiveFileName)
		if err != nil || fileInfo == nil || fileInfo.Name == "" {
			continue
		}
		meta[archiveFileName] = fileInfo.Name
	}

	if len(meta) == 0 {
		return nil
	}

	payload, err := json.Marshal(&archiveFilesMeta{Files: meta})
	if err != nil {
		return err
	}

	w, err := zw.Create(boardID + "/files_meta.json")
	if err != nil {
		return err
	}
	_, err = w.Write(payload)
	return err
}

// writeArchiveBoardMemberLine writes a single boardMember to the archive.
func (a *App) writeArchiveBoardMemberLine(w io.Writer, boardMember *model.BoardMember) error {
	bm, err := json.Marshal(&boardMember)
	if err != nil {
		return err
	}
	line := model.ArchiveLine{
		Type: "boardMember",
		Data: bm,
	}

	bm, err = json.Marshal(&line)
	if err != nil {
		return err
	}

	_, err = w.Write(bm)
	if err != nil {
		return err
	}

	_, err = w.Write(newline)
	return err
}

// writeArchiveBlockLine writes a single block to the archive.
func (a *App) writeArchiveBlockLine(w io.Writer, block *model.Block) error {
	b, err := json.Marshal(&block)
	if err != nil {
		return err
	}
	line := model.ArchiveLine{
		Type: "block",
		Data: b,
	}

	b, err = json.Marshal(&line)
	if err != nil {
		return err
	}

	_, err = w.Write(b)
	if err != nil {
		return err
	}

	// jsonl files need a newline
	_, err = w.Write(newline)
	return err
}

// writeArchiveBlockLine writes a single block to the archive.
func (a *App) writeArchiveBoardLine(w io.Writer, board model.Board) error {
	b, err := json.Marshal(&board)
	if err != nil {
		return err
	}
	line := model.ArchiveLine{
		Type: "board",
		Data: b,
	}

	b, err = json.Marshal(&line)
	if err != nil {
		return err
	}

	_, err = w.Write(b)
	if err != nil {
		return err
	}

	// jsonl files need a newline
	_, err = w.Write(newline)
	return err
}

// writeArchiveFile writes a single file to the archive.
func (a *App) writeArchiveFile(zw *zip.Writer, filename string, boardID string, opt model.ExportArchiveOptions) error {
	dest, err := zw.Create(boardID + "/" + filename)
	if err != nil {
		return err
	}

	// Use GetFilePath + filesBackend.Reader directly to bypass ValidateFileOwnership.
	// ValidateFileOwnership fails for BlockSuite-uploaded files because their storage path
	// (boards/YYYYMMDD/fileId) does not match the expected path (teamID/boardID/fileId).
	// Export is a trusted admin operation so ownership validation is not required here.
	_, filePath, err := a.GetFilePath(opt.TeamID, boardID, filename)
	if err != nil {
		a.logger.Error("archive file missing for export",
			mlog.String("filename", filename),
			mlog.String("team_id", opt.TeamID),
			mlog.String("board_id", boardID),
			mlog.Err(err),
		)
		return nil
	}

	exists, err := a.filesBackend.FileExists(filePath)
	if err != nil {
		return err
	}
	if !exists {
		a.logger.Error("archive file missing for export",
			mlog.String("filename", filename),
			mlog.String("team_id", opt.TeamID),
			mlog.String("board_id", boardID),
		)
		return nil
	}

	reader, err := a.filesBackend.Reader(filePath)
	if err != nil {
		return err
	}
	defer reader.Close()

	_, err = io.Copy(dest, reader)
	return err
}

// getBoardsForArchive fetches all the specified boards.
func (a *App) getBoardsForArchive(boardIDs []string) ([]model.Board, error) {
	boards := make([]model.Board, 0, len(boardIDs))

	for _, id := range boardIDs {
		b, err := a.GetBoard(id)
		if err != nil {
			return nil, fmt.Errorf("could not fetch board %s: %w", id, err)
		}

		boards = append(boards, *b)
	}
	return boards, nil
}

func extractFilename(block *model.Block) (string, error) {
	// Attachment blocks are normalized as attachmentId first in the webapp,
	// while image blocks use fileId first. Keep archive export aligned.
	fieldOrder := []string{model.BlockFieldFileId, model.BlockFieldAttachmentId}
	if block.Type == model.TypeAttachment {
		fieldOrder = []string{model.BlockFieldAttachmentId, model.BlockFieldFileId}
	}

	for _, field := range fieldOrder {
		if value, ok := block.Fields[field]; ok {
			if filename, ok := value.(string); ok && filename != "" {
				return filename, nil
			}
		}
	}

	return "", model.ErrInvalidImageBlock
}
