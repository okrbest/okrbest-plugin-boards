// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// cardToMarkdown converts a card and its related blocks to a Markdown string.
func cardToMarkdown(board model.Board, card *model.Block, allBlocks []*model.Block, bsDoc *model.BlockSuiteDoc) string {
	var sb strings.Builder

	// Title
	sb.WriteString("# " + card.Title + "\n\n")

	// Properties table
	if props := cardPropertiesToMarkdown(board, card); props != "" {
		sb.WriteString(props)
	}

	// Content: prefer BlockSuite snapshot, fall back to legacy blocks
	var contentMD string
	if bsDoc != nil && len(bsDoc.Snapshot) > 0 {
		contentMD = docSnapshotToMarkdown(bsDoc.Snapshot)
	} else {
		contentMD = legacyBlocksToMarkdown(card.ID, allBlocks)
	}
	if contentMD != "" {
		sb.WriteString("## Content\n\n")
		sb.WriteString(contentMD)
		sb.WriteString("\n")
	}

	// Comments
	if comments := commentsToMarkdown(card.ID, allBlocks); comments != "" {
		sb.WriteString(comments)
	}

	return sb.String()
}

// cardPropertiesToMarkdown generates a Markdown table for card properties.
func cardPropertiesToMarkdown(board model.Board, card *model.Block) string {
	propsRaw, ok := card.Fields["properties"].(map[string]interface{})
	if !ok || len(propsRaw) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("## Properties\n\n")
	sb.WriteString("| Property | Value |\n")
	sb.WriteString("| -------- | ----- |\n")

	hasRows := false
	for _, propDef := range board.CardProperties {
		propID, _ := propDef["id"].(string)
		propName, _ := propDef["name"].(string)
		propType, _ := propDef["type"].(string)

		rawVal, hasVal := propsRaw[propID]
		if !hasVal {
			continue
		}
		valStr := resolvePropertyValue(propDef, propType, rawVal)
		if valStr == "" {
			continue
		}
		sb.WriteString("| " + propName + " | " + valStr + " |\n")
		hasRows = true
	}

	if !hasRows {
		return ""
	}
	sb.WriteString("\n")
	return sb.String()
}

// resolvePropertyValue converts a raw property value to a display string.
func resolvePropertyValue(propDef map[string]interface{}, propType string, rawVal interface{}) string {
	switch propType {
	case "select":
		optID, ok := rawVal.(string)
		if !ok {
			return fmt.Sprintf("%v", rawVal)
		}
		opts, _ := propDef["options"].([]interface{})
		for _, o := range opts {
			opt, _ := o.(map[string]interface{})
			if opt["id"] == optID {
				name, _ := opt["value"].(string)
				return name
			}
		}
		return optID
	case "multiSelect":
		ids, ok := rawVal.([]interface{})
		if !ok {
			return fmt.Sprintf("%v", rawVal)
		}
		opts, _ := propDef["options"].([]interface{})
		optMap := make(map[string]string)
		for _, o := range opts {
			opt, _ := o.(map[string]interface{})
			id, _ := opt["id"].(string)
			val, _ := opt["value"].(string)
			optMap[id] = val
		}
		var names []string
		for _, id := range ids {
			idStr, _ := id.(string)
			if name, ok := optMap[idStr]; ok {
				names = append(names, name)
			}
		}
		return strings.Join(names, ", ")
	case "checkbox":
		if b, ok := rawVal.(bool); ok {
			if b {
				return "Yes"
			}
			return "No"
		}
		return fmt.Sprintf("%v", rawVal)
	default:
		return fmt.Sprintf("%v", rawVal)
	}
}

// legacyBlocksToMarkdown converts legacy content blocks (pre-BlockSuite) to Markdown.
func legacyBlocksToMarkdown(cardID string, allBlocks []*model.Block) string {
	var sb strings.Builder
	for _, block := range allBlocks {
		if block.ParentID != cardID {
			continue
		}
		if block.Type == model.TypeComment || block.Type == model.TypeCard || block.Type == model.TypeView {
			continue
		}
		line := legacyBlockToMarkdownLine(block)
		if line != "" {
			sb.WriteString(line + "\n")
		}
	}
	return sb.String()
}

// legacyBlockToMarkdownLine converts a single legacy block to a Markdown line.
func legacyBlockToMarkdownLine(block *model.Block) string {
	switch block.Type {
	case model.TypeText:
		return block.Title
	case "h1":
		return "# " + block.Title
	case "h2":
		return "## " + block.Title
	case "h3":
		return "### " + block.Title
	case model.TypeCheckbox:
		if checked, ok := block.Fields["value"].(bool); ok && checked {
			return "- [x] " + block.Title
		}
		return "- [ ] " + block.Title
	case model.TypeDivider:
		return "---"
	case model.TypeImage:
		if fileID, ok := block.Fields["fileId"].(string); ok {
			return "![](" + fileID + ")"
		}
		return ""
	case model.TypeAttachment:
		fileID := ""
		filename := block.Title
		if fid, ok := block.Fields["attachmentId"].(string); ok {
			fileID = fid
		} else if fid, ok := block.Fields["fileId"].(string); ok {
			fileID = fid
		}
		if filename == "" {
			filename = fileID
		}
		return "[" + filename + "](" + fileID + ")"
	case "quote":
		return "> " + block.Title
	default:
		return block.Title
	}
}

// commentsToMarkdown converts comment blocks to a Markdown section.
func commentsToMarkdown(cardID string, allBlocks []*model.Block) string {
	var comments []*model.Block
	for _, block := range allBlocks {
		if block.ParentID == cardID && block.Type == model.TypeComment {
			comments = append(comments, block)
		}
	}
	if len(comments) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("## Comments\n\n")
	for _, comment := range comments {
		sb.WriteString("**" + comment.CreatedBy + "**:\n")
		sb.WriteString(comment.Title + "\n\n")
	}
	return sb.String()
}

// docSnapshotToMarkdown converts a BlockSuite DocSnapshot (JSON bytes) to Markdown.
func docSnapshotToMarkdown(snapshot []byte) string {
	if len(snapshot) == 0 {
		return ""
	}
	var ds DocSnapshot
	if err := json.Unmarshal(snapshot, &ds); err != nil {
		return ""
	}

	var sb strings.Builder
	renderBlockSuiteNode(&sb, ds.Blocks, 0)
	return strings.TrimSpace(sb.String())
}

// renderBlockSuiteNode recursively renders a BlockSnapshot node to Markdown.
func renderBlockSuiteNode(sb *strings.Builder, node BlockSnapshot, depth int) {
	switch node.Flavour {
	case "affine:page", "affine:note":
		for _, child := range node.Children {
			renderBlockSuiteNode(sb, child, depth)
		}
	case "affine:surface":
		// skip canvas/whiteboard surface

	case "affine:heading":
		level := 1
		if t, ok := node.Props["type"].(string); ok && len(t) == 2 && t[0] == 'h' {
			if n := int(t[1] - '0'); n >= 1 && n <= 6 {
				level = n
			}
		}
		text := deltaPropToMarkdown(node.Props)
		sb.WriteString(strings.Repeat("#", level) + " " + text + "\n\n")

	case "affine:paragraph":
		text := deltaPropToMarkdown(node.Props)
		if text != "" {
			sb.WriteString(text + "\n\n")
		}
		for _, child := range node.Children {
			renderBlockSuiteNode(sb, child, depth+1)
		}

	case "affine:list":
		listType := "bulleted"
		if t, ok := node.Props["type"].(string); ok {
			listType = t
		}
		checked, _ := node.Props["checked"].(bool)
		text := deltaPropToMarkdown(node.Props)
		indent := strings.Repeat("  ", depth)
		switch listType {
		case "numbered":
			sb.WriteString(indent + "1. " + text + "\n")
		case "todo":
			if checked {
				sb.WriteString(indent + "- [x] " + text + "\n")
			} else {
				sb.WriteString(indent + "- [ ] " + text + "\n")
			}
		default:
			sb.WriteString(indent + "- " + text + "\n")
		}
		for _, child := range node.Children {
			renderBlockSuiteNode(sb, child, depth+1)
		}
		if depth == 0 {
			sb.WriteString("\n")
		}

	case "affine:divider":
		sb.WriteString("---\n\n")

	case "affine:code":
		lang, _ := node.Props["language"].(string)
		text := deltaPropToMarkdown(node.Props)
		sb.WriteString("```" + lang + "\n" + text + "\n```\n\n")

	case "affine:image":
		src, _ := node.Props["sourceId"].(string)
		sb.WriteString("![](" + src + ")\n\n")

	default:
		text := deltaPropToMarkdown(node.Props)
		if text != "" {
			sb.WriteString(text + "\n\n")
		}
		for _, child := range node.Children {
			renderBlockSuiteNode(sb, child, depth)
		}
	}
}

// deltaPropToMarkdown converts the "text" prop of a BlockSnapshot to inline Markdown.
func deltaPropToMarkdown(props map[string]interface{}) string {
	textProp, ok := props["text"]
	if !ok {
		return ""
	}
	// textProp is a BlockSuiteText-like map: { "delta": [...], "$blocksuite:internal:text$": true }
	textMap, ok := textProp.(map[string]interface{})
	if !ok {
		if s, ok := textProp.(string); ok {
			return s
		}
		return ""
	}

	deltaRaw, ok := textMap["delta"]
	if !ok {
		return ""
	}
	deltaArr, ok := deltaRaw.([]interface{})
	if !ok {
		return ""
	}

	var sb strings.Builder
	for _, item := range deltaArr {
		itemMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		insert, _ := itemMap["insert"].(string)
		var attrs map[string]interface{}
		if a, ok := itemMap["attributes"].(map[string]interface{}); ok {
			attrs = a
		}
		sb.WriteString(applyInlineMarkdown(insert, attrs))
	}
	return sb.String()
}

// applyInlineMarkdown applies bold/italic/code/link formatting to a text string.
func applyInlineMarkdown(text string, attrs map[string]interface{}) string {
	if text == "" || attrs == nil {
		return text
	}
	if bold, _ := attrs["bold"].(bool); bold {
		text = "**" + text + "**"
	}
	if italic, _ := attrs["italic"].(bool); italic {
		text = "*" + text + "*"
	}
	if code, _ := attrs["code"].(bool); code {
		text = "`" + text + "`"
	}
	if link, _ := attrs["link"].(string); link != "" {
		text = "[" + text + "](" + link + ")"
	}
	return text
}

var invalidFilenameChars = regexp.MustCompile(`[/\\:*?"<>|]`)

// sanitizeFilename removes characters that are invalid in filenames.
func sanitizeFilename(name string) string {
	name = invalidFilenameChars.ReplaceAllString(name, "_")
	name = strings.TrimSpace(name)
	name = strings.Trim(name, ".")
	if len(name) > 100 {
		name = name[:100]
	}
	return name
}
