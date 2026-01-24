// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	migrationBatchSize = 100
)

func (a *App) RunBlockSuiteMigration() error {
	status, err := a.store.GetBlockSuiteMigrationStatus()
	if err != nil {
		a.logger.Error("Failed to get BlockSuite migration status", mlog.Err(err))
		return err
	}

	if status.IsMigrationComplete {
		a.logger.Info("BlockSuite migration already complete",
			mlog.Int("totalCards", int(status.TotalCards)),
			mlog.Int("migratedCards", int(status.MigratedCards)))
		return nil
	}

	a.logger.Info("Starting BlockSuite migration",
		mlog.Int("cardsToMigrate", int(status.TotalCards-status.MigratedCards)),
		mlog.Int("totalCards", int(status.TotalCards)),
		mlog.Int("alreadyMigrated", int(status.MigratedCards)))

	totalMigrated := 0
	offset := 0

	for {
		cards, totalCount, err := a.store.GetUnmigratedCardsWithContentBlocks(migrationBatchSize, offset)
		if err != nil {
			a.logger.Error("Failed to get unmigrated cards", mlog.Err(err))
			return err
		}

		if len(cards) == 0 {
			break
		}

		for _, card := range cards {
			if err := a.migrateCardToBlockSuite(card); err != nil {
				a.logger.Warn("Failed to migrate card to BlockSuite",
					mlog.String("cardID", card.Card.ID),
					mlog.Err(err))
				continue
			}
			totalMigrated++
		}

		a.logger.Info("BlockSuite migration progress",
			mlog.Int("batchMigrated", len(cards)),
			mlog.Int("totalMigrated", totalMigrated),
			mlog.Int("remaining", int(totalCount)-totalMigrated))

		if len(cards) < migrationBatchSize {
			break
		}
		offset += migrationBatchSize
	}

	a.logger.Info("BlockSuite migration completed",
		mlog.Int("totalMigrated", totalMigrated))

	return nil
}

func (a *App) migrateCardToBlockSuite(unmigratedCard *model.UnmigratedCard) error {
	card := unmigratedCard.Card
	contentBlocks := unmigratedCard.ContentBlocks

	snapshot := convertLegacyBlocksToDocSnapshot(card, contentBlocks)

	snapshotBytes, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}

	now := time.Now().UnixMilli()
	doc := &model.BlockSuiteDoc{
		DocID:     card.ID,
		CardID:    card.ID,
		BoardID:   card.BoardID,
		Snapshot:  snapshotBytes,
		CreatedAt: now,
		UpdatedAt: now,
		CreatedBy: card.CreatedBy,
		UpdatedBy: card.ModifiedBy,
	}

	return a.store.UpsertBlockSuiteDoc(doc)
}

type DocSnapshot struct {
	Type   string          `json:"type"`
	Meta   DocSnapshotMeta `json:"meta"`
	Blocks BlockSnapshot   `json:"blocks"`
}

type DocSnapshotMeta struct {
	ID         string            `json:"id"`
	Title      string            `json:"title"`
	CreateDate int64             `json:"createDate"`
	Tags       []string          `json:"tags"`
	BlobMap    map[string]string `json:"blobMap,omitempty"`
}

type BlockSnapshot struct {
	Type     string                 `json:"type"`
	ID       string                 `json:"id"`
	Flavour  string                 `json:"flavour"`
	Props    map[string]interface{} `json:"props"`
	Children []BlockSnapshot        `json:"children"`
}

type TextDelta struct {
	Insert     string                 `json:"insert"`
	Attributes map[string]interface{} `json:"attributes,omitempty"`
}

type BlockSuiteText struct {
	BlockSuiteInternalText bool        `json:"$blocksuite:internal:text$"`
	Delta                  []TextDelta `json:"delta"`
}

func convertLegacyBlocksToDocSnapshot(card *model.Block, contentBlocks []*model.Block) *DocSnapshot {
	sortedBlocks := sortBlocksByContentOrder(contentBlocks, card.Fields)

	pageID := "page:" + card.ID
	surfaceID := utils.NewID(utils.IDTypeNone)
	noteID := utils.NewID(utils.IDTypeNone)

	blobMap := make(map[string]string)
	contentChildren := make([]BlockSnapshot, 0, len(sortedBlocks))
	for _, block := range sortedBlocks {
		snapshots, fileId := convertContentBlockToSnapshots(block)
		contentChildren = append(contentChildren, snapshots...)
		if fileId != "" {
			blobMap[fileId] = fileId
		}
	}

	if len(contentChildren) == 0 {
		contentChildren = append(contentChildren, BlockSnapshot{
			Type:    "block",
			ID:      utils.NewID(utils.IDTypeNone),
			Flavour: "affine:paragraph",
			Props: map[string]interface{}{
				"type": "text",
				"text": BlockSuiteText{
					BlockSuiteInternalText: true,
					Delta:                  []TextDelta{},
				},
			},
			Children: []BlockSnapshot{},
		})
	}

	noteBlock := BlockSnapshot{
		Type:    "block",
		ID:      noteID,
		Flavour: "affine:note",
		Props: map[string]interface{}{
			"xywh":        "[0,0,800,600]",
			"background":  "--affine-background-secondary-color",
			"index":       "a0",
			"hidden":      false,
			"displayMode": "both",
		},
		Children: contentChildren,
	}

	surfaceBlock := BlockSnapshot{
		Type:     "block",
		ID:       surfaceID,
		Flavour:  "affine:surface",
		Props:    map[string]interface{}{"elements": map[string]interface{}{}},
		Children: []BlockSnapshot{},
	}

	pageBlock := BlockSnapshot{
		Type:    "block",
		ID:      pageID,
		Flavour: "affine:page",
		Props: map[string]interface{}{
			"title": BlockSuiteText{
				BlockSuiteInternalText: true,
				Delta:                  parseTextToDelta(card.Title),
			},
		},
		Children: []BlockSnapshot{surfaceBlock, noteBlock},
	}

	meta := DocSnapshotMeta{
		ID:         card.ID,
		Title:      card.Title,
		CreateDate: card.CreateAt,
		Tags:       []string{},
	}
	if len(blobMap) > 0 {
		meta.BlobMap = blobMap
	}

	return &DocSnapshot{
		Type:   "page",
		Meta:   meta,
		Blocks: pageBlock,
	}
}

func sortBlocksByContentOrder(blocks []*model.Block, cardFields map[string]interface{}) []*model.Block {
	if cardFields == nil {
		return blocks
	}

	contentOrderRaw, ok := cardFields["contentOrder"]
	if !ok {
		return blocks
	}

	var flatOrder []string
	switch co := contentOrderRaw.(type) {
	case []interface{}:
		for _, item := range co {
			switch v := item.(type) {
			case string:
				flatOrder = append(flatOrder, v)
			case []interface{}:
				for _, subItem := range v {
					if s, ok := subItem.(string); ok {
						flatOrder = append(flatOrder, s)
					}
				}
			}
		}
	case []string:
		flatOrder = co
	}

	if len(flatOrder) == 0 {
		return blocks
	}

	orderMap := make(map[string]int)
	for i, id := range flatOrder {
		orderMap[id] = i
	}

	sorted := make([]*model.Block, len(blocks))
	copy(sorted, blocks)

	sort.Slice(sorted, func(i, j int) bool {
		iIndex, iOk := orderMap[sorted[i].ID]
		jIndex, jOk := orderMap[sorted[j].ID]

		if !iOk && !jOk {
			return false
		}
		if !iOk {
			return false
		}
		if !jOk {
			return true
		}
		return iIndex < jIndex
	})

	return sorted
}

func convertContentBlockToSnapshots(block *model.Block) ([]BlockSnapshot, string) {
	blockType := string(block.Type)
	fields := block.Fields
	if fields == nil {
		fields = make(map[string]interface{})
	}

	var fileId string

	switch blockType {
	case "text":
		return parseMultilineMarkdown(block.Title, block.ID), ""

	case "h1", "h2", "h3":
		return []BlockSnapshot{createParagraphSnapshot(block.ID, blockType, block.Title)}, ""

	case "quote":
		return []BlockSnapshot{createParagraphSnapshot(block.ID, "quote", block.Title)}, ""

	case "checkbox":
		snapshot := BlockSnapshot{
			Type:    "block",
			ID:      block.ID,
			Flavour: "affine:list",
			Props: map[string]interface{}{
				"type":    "todo",
				"checked": getBoolField(fields, "value"),
				"text": BlockSuiteText{
					BlockSuiteInternalText: true,
					Delta:                  parseTextToDelta(block.Title),
				},
			},
			Children: []BlockSnapshot{},
		}
		return []BlockSnapshot{snapshot}, ""

	case "list-item":
		snapshot := BlockSnapshot{
			Type:    "block",
			ID:      block.ID,
			Flavour: "affine:list",
			Props: map[string]interface{}{
				"type": "bulleted",
				"text": BlockSuiteText{
					BlockSuiteInternalText: true,
					Delta:                  parseTextToDelta(block.Title),
				},
			},
			Children: []BlockSnapshot{},
		}
		return []BlockSnapshot{snapshot}, ""

	case "divider":
		snapshot := BlockSnapshot{
			Type:     "block",
			ID:       block.ID,
			Flavour:  "affine:divider",
			Props:    map[string]interface{}{},
			Children: []BlockSnapshot{},
		}
		return []BlockSnapshot{snapshot}, ""

	case "image":
		fileId = getStringField(fields, "fileId")
		snapshot := BlockSnapshot{
			Type:    "block",
			ID:      block.ID,
			Flavour: "affine:image",
			Props: map[string]interface{}{
				"sourceId": fileId,
				"width":    getIntField(fields, "width"),
				"height":   getIntField(fields, "height"),
			},
			Children: []BlockSnapshot{},
		}
		return []BlockSnapshot{snapshot}, fileId

	case "video", "attachment":
		filename := getStringField(fields, "filename")
		if filename == "" {
			filename = "file"
		}
		return []BlockSnapshot{createParagraphSnapshot(block.ID, "text", "["+blockType+": "+filename+"]")}, ""

	default:
		return parseMultilineMarkdown(block.Title, block.ID), ""
	}
}

func createParagraphSnapshot(id, paragraphType, text string) BlockSnapshot {
	return BlockSnapshot{
		Type:    "block",
		ID:      id,
		Flavour: "affine:paragraph",
		Props: map[string]interface{}{
			"type": paragraphType,
			"text": BlockSuiteText{
				BlockSuiteInternalText: true,
				Delta:                  parseTextToDelta(text),
			},
		},
		Children: []BlockSnapshot{},
	}
}

var (
	headerPattern     = regexp.MustCompile(`^(#{1,6})\s+(.*)$`)
	bulletListPattern = regexp.MustCompile(`^[-*+]\s+(.*)$`)
	numberListPattern = regexp.MustCompile(`^\d+\.\s+(.*)$`)
	quotePattern      = regexp.MustCompile(`^>\s*(.*)$`)
)

func parseMultilineMarkdown(text, baseID string) []BlockSnapshot {
	if text == "" {
		return []BlockSnapshot{createParagraphSnapshot(baseID, "text", "")}
	}

	lines := strings.Split(text, "\n")
	snapshots := make([]BlockSnapshot, 0, len(lines))

	for i, line := range lines {
		blockID := baseID
		if i > 0 {
			blockID = utils.NewID(utils.IDTypeNone)
		}

		trimmedLine := strings.TrimSpace(line)
		if trimmedLine == "" {
			if len(snapshots) == 0 {
				snapshots = append(snapshots, createParagraphSnapshot(blockID, "text", ""))
			}
			continue
		}

		if match := headerPattern.FindStringSubmatch(line); match != nil {
			level := len(match[1])
			headerType := "text"
			if level == 1 {
				headerType = "h1"
			} else if level == 2 {
				headerType = "h2"
			} else if level >= 3 {
				headerType = "h3"
			}
			snapshots = append(snapshots, createParagraphSnapshot(blockID, headerType, match[2]))
			continue
		}

		if match := bulletListPattern.FindStringSubmatch(line); match != nil {
			snapshot := BlockSnapshot{
				Type:    "block",
				ID:      blockID,
				Flavour: "affine:list",
				Props: map[string]interface{}{
					"type": "bulleted",
					"text": BlockSuiteText{
						BlockSuiteInternalText: true,
						Delta:                  parseTextToDelta(match[1]),
					},
				},
				Children: []BlockSnapshot{},
			}
			snapshots = append(snapshots, snapshot)
			continue
		}

		if match := numberListPattern.FindStringSubmatch(line); match != nil {
			snapshot := BlockSnapshot{
				Type:    "block",
				ID:      blockID,
				Flavour: "affine:list",
				Props: map[string]interface{}{
					"type": "numbered",
					"text": BlockSuiteText{
						BlockSuiteInternalText: true,
						Delta:                  parseTextToDelta(match[1]),
					},
				},
				Children: []BlockSnapshot{},
			}
			snapshots = append(snapshots, snapshot)
			continue
		}

		if match := quotePattern.FindStringSubmatch(line); match != nil {
			snapshots = append(snapshots, createParagraphSnapshot(blockID, "quote", match[1]))
			continue
		}

		snapshots = append(snapshots, createParagraphSnapshot(blockID, "text", line))
	}

	if len(snapshots) == 0 {
		return []BlockSnapshot{createParagraphSnapshot(baseID, "text", "")}
	}

	return snapshots
}

func getBlockSuiteFlavour(blockType string) string {
	switch blockType {
	case "text", "h1", "h2", "h3", "quote":
		return "affine:paragraph"
	case "checkbox", "list-item":
		return "affine:list"
	case "divider":
		return "affine:divider"
	case "image":
		return "affine:image"
	case "video", "attachment":
		return "affine:paragraph"
	default:
		return "affine:paragraph"
	}
}

var (
	linkPattern      = regexp.MustCompile(`^\[([^\]]+)\]\(([^)]+)\)`)
	boldPattern      = regexp.MustCompile(`^\*\*(.+?)\*\*`)
	boldAltPattern   = regexp.MustCompile(`^__(.+?)__`)
	strikePattern    = regexp.MustCompile(`^~~(.+?)~~`)
	codePattern      = regexp.MustCompile("^`([^`]+)`")
	italicPattern    = regexp.MustCompile(`^\*([^*]+)\*`)
	italicAltPattern = regexp.MustCompile(`^_([^_]+)_`)
)

type tokenType string

const (
	tokenText   tokenType = "text"
	tokenBold   tokenType = "bold"
	tokenItalic tokenType = "italic"
	tokenStrike tokenType = "strike"
	tokenCode   tokenType = "code"
	tokenLink   tokenType = "link"
)

type token struct {
	typ     tokenType
	content string
	url     string
}

func tokenize(text string) []token {
	var tokens []token
	remaining := text
	i := 0

	for i < len(remaining) {
		slice := remaining[i:]

		if match := linkPattern.FindStringSubmatch(slice); match != nil {
			if i > 0 {
				tokens = append(tokens, token{typ: tokenText, content: remaining[:i]})
			}
			tokens = append(tokens, token{typ: tokenLink, content: match[1], url: match[2]})
			remaining = remaining[i+len(match[0]):]
			i = 0
			continue
		}

		boldMatch := boldPattern.FindStringSubmatch(slice)
		if boldMatch == nil {
			boldMatch = boldAltPattern.FindStringSubmatch(slice)
		}
		if boldMatch != nil {
			if i > 0 {
				tokens = append(tokens, token{typ: tokenText, content: remaining[:i]})
			}
			tokens = append(tokens, token{typ: tokenBold, content: boldMatch[1]})
			remaining = remaining[i+len(boldMatch[0]):]
			i = 0
			continue
		}

		if match := strikePattern.FindStringSubmatch(slice); match != nil {
			if i > 0 {
				tokens = append(tokens, token{typ: tokenText, content: remaining[:i]})
			}
			tokens = append(tokens, token{typ: tokenStrike, content: match[1]})
			remaining = remaining[i+len(match[0]):]
			i = 0
			continue
		}

		if match := codePattern.FindStringSubmatch(slice); match != nil {
			if i > 0 {
				tokens = append(tokens, token{typ: tokenText, content: remaining[:i]})
			}
			tokens = append(tokens, token{typ: tokenCode, content: match[1]})
			remaining = remaining[i+len(match[0]):]
			i = 0
			continue
		}

		italicMatch := italicPattern.FindStringSubmatch(slice)
		if italicMatch == nil {
			italicMatch = italicAltPattern.FindStringSubmatch(slice)
		}
		if italicMatch != nil {
			char := remaining[i]
			nextChar := byte(0)
			if i+1 < len(remaining) {
				nextChar = remaining[i+1]
			}
			isNotBoldSyntax := !((char == '*' && nextChar == '*') || (char == '_' && nextChar == '_'))
			if isNotBoldSyntax {
				if i > 0 {
					tokens = append(tokens, token{typ: tokenText, content: remaining[:i]})
				}
				tokens = append(tokens, token{typ: tokenItalic, content: italicMatch[1]})
				remaining = remaining[i+len(italicMatch[0]):]
				i = 0
				continue
			}
		}

		i++
	}

	if len(remaining) > 0 {
		tokens = append(tokens, token{typ: tokenText, content: remaining})
	}

	return tokens
}

func tokensToDelta(tokens []token) []TextDelta {
	var delta []TextDelta

	for _, tok := range tokens {
		if len(tok.content) == 0 {
			continue
		}

		switch tok.typ {
		case tokenText:
			delta = append(delta, TextDelta{Insert: tok.content})
		case tokenBold:
			delta = append(delta, TextDelta{Insert: tok.content, Attributes: map[string]interface{}{"bold": true}})
		case tokenItalic:
			delta = append(delta, TextDelta{Insert: tok.content, Attributes: map[string]interface{}{"italic": true}})
		case tokenStrike:
			delta = append(delta, TextDelta{Insert: tok.content, Attributes: map[string]interface{}{"strike": true}})
		case tokenCode:
			delta = append(delta, TextDelta{Insert: tok.content, Attributes: map[string]interface{}{"code": true}})
		case tokenLink:
			delta = append(delta, TextDelta{Insert: tok.content, Attributes: map[string]interface{}{"link": tok.url}})
		}
	}

	return delta
}

func parseTextToDelta(text string) []TextDelta {
	if text == "" {
		return []TextDelta{}
	}
	tokens := tokenize(text)
	return tokensToDelta(tokens)
}

func getStringField(fields map[string]interface{}, key string) string {
	if v, ok := fields[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getBoolField(fields map[string]interface{}, key string) bool {
	if v, ok := fields[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

func getIntField(fields map[string]interface{}, key string) int {
	if v, ok := fields[key]; ok {
		switch n := v.(type) {
		case int:
			return n
		case int64:
			return int(n)
		case float64:
			return int(n)
		}
	}
	return 0
}
