// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package notifysubscriptions

import (
	"bytes"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
	"text/template"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/wiggin77/merror"

	mm_model "github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	// card change notifications.
	defAddCardNotify    = "{{.Authors | printAuthors \"알 수 없는 사용자\" }}님이 카드 [{{.Card.Title}}]({{. | makeLink}})를 추가했습니다.\n"
	defModifyCardNotify = "###### {{.Authors | printAuthors \"알 수 없는 사용자\" }}님이 보드 {{. | makeBoardLink}}에서 카드 [{{.Card.Title}}]({{. | makeLink}})를 수정했습니다.\n"
	defDeleteCardNotify = "{{.Authors | printAuthors \"알 수 없는 사용자\" }}님이 카드 [{{.Card.Title}}]({{. | makeLink}})를 삭제했습니다.\n"
)

var (
	// templateCache is a map of text templateCache keyed by languange code.
	templateCache    = make(map[string]*template.Template)
	templateCacheMux sync.Mutex
	mentionPattern   = regexp.MustCompile(`@[a-zA-Z0-9_\-]+`)
)

func isMentionOnly(s string) bool {
	clean := mentionPattern.ReplaceAllString(s, "")
	clean = strings.TrimSpace(clean)
	return clean == ""
}

// DiffConvOpts provides options when converting diffs to slack attachments.
type DiffConvOpts struct {
	Language      string
	MakeCardLink  func(block *model.Block, board *model.Board, card *model.Block) string
	MakeBoardLink func(board *model.Board) string
	Logger        mlog.LoggerIFace
}

// getTemplate returns a new or cached named template based on the language specified.
func getTemplate(name string, opts DiffConvOpts, def string) (*template.Template, error) {
	templateCacheMux.Lock()
	defer templateCacheMux.Unlock()

	key := name + "&" + opts.Language
	t, ok := templateCache[key]
	if !ok {
		t = template.New(key)

		if opts.MakeCardLink == nil {
			opts.MakeCardLink = func(block *model.Block, _ *model.Board, _ *model.Block) string {
				return fmt.Sprintf("`%s`", block.Title)
			}
		}

		if opts.MakeBoardLink == nil {
			opts.MakeBoardLink = func(board *model.Board) string {
				return fmt.Sprintf("`%s`", board.Title)
			}
		}
		myFuncs := template.FuncMap{
			"getBoardDescription": getBoardDescription,
			"makeLink": func(diff *Diff) string {
				return opts.MakeCardLink(diff.NewBlock, diff.Board, diff.Card)
			},
			"makeBoardLink": func(diff *Diff) string {
				return opts.MakeBoardLink(diff.Board)
			},
			"stripNewlines": func(s string) string {
				return strings.TrimSpace(strings.ReplaceAll(s, "\n", "¶ "))
			},
			"printAuthors": func(empty string, authors StringMap) string {
				return makeAuthorsList(authors, empty)
			},
		}
		t.Funcs(myFuncs)

		s := def // TODO: lookup i18n string when supported on server
		t2, err := t.Parse(s)
		if err != nil {
			return nil, fmt.Errorf("cannot parse markdown template '%s' for notifications: %w", key, err)
		}
		templateCache[key] = t2
	}
	return t, nil
}

func makeAuthorsList(authors StringMap, empty string) string {
	if len(authors) == 0 {
		return empty
	}
	prefix := ""
	sb := &strings.Builder{}
	for _, name := range authors.Values() {
		sb.WriteString(prefix)
		sb.WriteString("@")
		sb.WriteString(strings.TrimSpace(name))
		prefix = ", "
	}
	return sb.String()
}

// execTemplate executes the named template corresponding to the template name and language specified.
func execTemplate(w io.Writer, name string, opts DiffConvOpts, def string, data interface{}) error {
	t, err := getTemplate(name, opts, def)
	if err != nil {
		return err
	}
	return t.Execute(w, data)
}

// Diffs2SlackAttachments converts a slice of `Diff` to slack attachments to be used in a post.
func Diffs2SlackAttachments(diffs []*Diff, opts DiffConvOpts) ([]*mm_model.SlackAttachment, error) {
	var attachments []*mm_model.SlackAttachment
	merr := merror.New()

	for _, d := range diffs {
		// only handle cards for now.
		if d.BlockType == model.TypeCard {
			a, err := cardDiff2SlackAttachment(d, opts)
			if err != nil {
				merr.Append(err)
				continue
			}
			if a == nil {
				continue
			}
			attachments = append(attachments, a)
		}
	}
	return attachments, merr.ErrorOrNil()
}

func cardDiff2SlackAttachment(cardDiff *Diff, opts DiffConvOpts) (*mm_model.SlackAttachment, error) {
	// sanity check
	if cardDiff.NewBlock == nil && cardDiff.OldBlock == nil {
		return nil, nil
	}

	attachment := &mm_model.SlackAttachment{}
	buf := &bytes.Buffer{}

	// card added
	if cardDiff.NewBlock != nil && cardDiff.OldBlock == nil {
		if err := execTemplate(buf, "AddCardNotify", opts, defAddCardNotify, cardDiff); err != nil {
			return nil, err
		}
		attachment.Pretext = buf.String()
		attachment.Fallback = attachment.Pretext
		// 박스 클릭을 위해 TitleLink만 설정 (Title은 표시하지 않음)
		attachment.TitleLink = opts.MakeCardLink(cardDiff.Card, cardDiff.Board, cardDiff.Card)
		return attachment, nil
	}

	// card deleted
	if (cardDiff.NewBlock == nil || cardDiff.NewBlock.DeleteAt != 0) && cardDiff.OldBlock != nil {
		buf.Reset()
		if err := execTemplate(buf, "DeleteCardNotify", opts, defDeleteCardNotify, cardDiff); err != nil {
			return nil, err
		}
		attachment.Pretext = buf.String()
		attachment.Fallback = attachment.Pretext
		// 박스 클릭을 위해 TitleLink만 설정 (Title은 표시하지 않음)
		attachment.TitleLink = opts.MakeCardLink(cardDiff.Card, cardDiff.Board, cardDiff.Card)
		return attachment, nil
	}

	// at this point new and old block are non-nil

	opts.Logger.Debug("cardDiff2SlackAttachment",
		mlog.String("board_id", cardDiff.Board.ID),
		mlog.String("card_id", cardDiff.Card.ID),
		mlog.String("new_block_id", cardDiff.NewBlock.ID),
		mlog.String("old_block_id", cardDiff.OldBlock.ID),
		mlog.Int("childDiffs", len(cardDiff.Diffs)),
	)

	buf.Reset()
	if err := execTemplate(buf, "ModifyCardNotify", opts, defModifyCardNotify, cardDiff); err != nil {
		return nil, fmt.Errorf("cannot write notification for card %s: %w", cardDiff.NewBlock.ID, err)
	}
	attachment.Pretext = buf.String()
	attachment.Fallback = attachment.Pretext

	// 박스 클릭을 위해 TitleLink만 설정 (Title은 표시하지 않음)
	attachment.TitleLink = opts.MakeCardLink(cardDiff.Card, cardDiff.Board, cardDiff.Card)

	// title changes
	attachment.Fields = appendTitleChanges(attachment.Fields, cardDiff)

	// property changes
	attachment.Fields = appendPropertyChanges(attachment.Fields, cardDiff)

	// comment add/delete (멘션만 포함된 댓글은 멘션 알림으로 대체됨)
	attachment.Fields = appendCommentChanges(attachment.Fields, cardDiff)

	// File Attachment add/delete
	attachment.Fields = appendAttachmentChanges(attachment.Fields, cardDiff)

	// content/description changes
	attachment.Fields = appendContentChanges(attachment.Fields, cardDiff, opts.Logger)

	if len(attachment.Fields) == 0 {
		return nil, nil
	}
	return attachment, nil
}

func appendTitleChanges(fields []*mm_model.SlackAttachmentField, cardDiff *Diff) []*mm_model.SlackAttachmentField {
	if cardDiff.NewBlock.Title != cardDiff.OldBlock.Title {
		fields = append(fields, &mm_model.SlackAttachmentField{
			Short: false,
			Title: "제목",
			Value: fmt.Sprintf("%s  ~~`%s`~~", stripNewlines(cardDiff.NewBlock.Title), stripNewlines(cardDiff.OldBlock.Title)),
		})
	}
	return fields
}

func appendPropertyChanges(fields []*mm_model.SlackAttachmentField, cardDiff *Diff) []*mm_model.SlackAttachmentField {
	if len(cardDiff.PropDiffs) == 0 {
		return fields
	}

	for _, propDiff := range cardDiff.PropDiffs {
		if propDiff.NewValue == propDiff.OldValue {
			continue
		}

		var val string
		if propDiff.OldValue != "" {
			// Don't use backticks for old value - it prevents @mention parsing
			val = fmt.Sprintf("%s  ~~%s~~", stripNewlines(propDiff.NewValue), stripNewlines(propDiff.OldValue))
		} else {
			val = propDiff.NewValue
		}

		fields = append(fields, &mm_model.SlackAttachmentField{
			Short: false,
			Title: propDiff.Name,
			Value: val,
		})
	}
	return fields
}

func appendCommentChanges(fields []*mm_model.SlackAttachmentField, cardDiff *Diff) []*mm_model.SlackAttachmentField {
	for _, child := range cardDiff.Diffs {
		if child.BlockType == model.TypeComment {
			var format string
			var msg string
			isAdd := false
			if child.NewBlock != nil && child.OldBlock == nil {
				// added comment
				format = "%s"
				msg = child.NewBlock.Title
				isAdd = true
			}

			if (child.NewBlock == nil || child.NewBlock.DeleteAt != 0) && child.OldBlock != nil {
				// deleted comment
				format = "~~`%s`~~"
				msg = stripNewlines(child.OldBlock.Title)
			}

			// 새 댓글이 멘션만 포함하는 경우 멘션 알림과 중복되므로 제외
			if isAdd && isMentionOnly(msg) {
				continue
			}

			// 삭제된 댓글도 멘션만 포함했다면 알림 제외
			if !isAdd && format != "" && isMentionOnly(msg) {
				continue
			}

			if format != "" {
				// Put author mention in Value (not Title) so Mattermost parses it as a mention
				authorMention := makeAuthorsList(child.Authors, "알 수 없는 사용자")
				fields = append(fields, &mm_model.SlackAttachmentField{
					Short: false,
					Title: "댓글",
					Value: fmt.Sprintf("%s님: %s", authorMention, fmt.Sprintf(format, msg)),
				})
			}
		}
	}
	return fields
}

func appendAttachmentChanges(fields []*mm_model.SlackAttachmentField, cardDiff *Diff) []*mm_model.SlackAttachmentField {
	for _, child := range cardDiff.Diffs {
		if child.BlockType == model.TypeAttachment {
			var format string
			var msg string
			if child.NewBlock != nil && child.OldBlock == nil {
				format = "첨부 파일 추가: **`%s`**"
				msg = child.NewBlock.Title
			} else {
				format = "첨부 파일 삭제: ~~`%s`~~"
				msg = stripNewlines(child.OldBlock.Title)
			}

			if format != "" {
				// Put author mention in Value (not Title) so Mattermost parses it as a mention
				authorMention := makeAuthorsList(child.Authors, "알 수 없는 사용자")
				fields = append(fields, &mm_model.SlackAttachmentField{
					Short: false,
					Title: "첨부 파일",
					Value: fmt.Sprintf("%s님: %s", authorMention, fmt.Sprintf(format, msg)),
				})
			}
		}
	}
	return fields
}

func appendContentChanges(fields []*mm_model.SlackAttachmentField, cardDiff *Diff, logger mlog.LoggerIFace) []*mm_model.SlackAttachmentField {
	for _, child := range cardDiff.Diffs {
		var opAdd, opDelete bool
		var opString string

		switch {
		case child.OldBlock == nil && child.NewBlock != nil:
			opAdd = true
			opString = "추가됨" // TODO: localize when i18n added to server
		case child.NewBlock == nil || child.NewBlock.DeleteAt != 0:
			opDelete = true
			opString = "삭제됨"
		default:
			opString = "수정됨"
		}

		var newTitle, oldTitle string
		if child.OldBlock != nil {
			oldTitle = child.OldBlock.Title
		}
		if child.NewBlock != nil {
			newTitle = child.NewBlock.Title
		}

		switch child.BlockType {
		case model.TypeDivider, model.TypeComment:
			// do nothing
			continue
		case model.TypeImage:
			if newTitle == "" {
				newTitle = "이미지가 " + opString + "." // TODO: localize when i18n added to server
			}
			oldTitle = ""
		case model.TypeAttachment:
			if newTitle == "" {
				newTitle = "첨부 파일이 " + opString + "." // TODO: localize when i18n added to server
			}
			oldTitle = ""
		default:
			if !opAdd {
				if opDelete {
					newTitle = ""
				}
				// only strip newlines when modifying or deleting
				oldTitle = stripNewlines(oldTitle)
				newTitle = stripNewlines(newTitle)
			}
			if newTitle == oldTitle {
				continue
			}
		}

		logger.Trace("appendContentChanges",
			mlog.String("type", string(child.BlockType)),
			mlog.String("opString", opString),
			mlog.String("oldTitle", oldTitle),
			mlog.String("newTitle", newTitle),
		)

		markdown := generateMarkdownDiff(oldTitle, newTitle, logger)
		if markdown == "" {
			continue
		}

		// 실제 멘션 패턴이 포함된 Description 변경은 멘션 알림과 중복되므로 제외
		// 패턴: @username (@ 뒤에 영문자/숫자/언더스코어/하이픈)
		if mentionPattern.MatchString(newTitle) || mentionPattern.MatchString(oldTitle) {
			if isMentionOnly(newTitle) && isMentionOnly(oldTitle) {
				logger.Debug("appendContentChanges - skipping description with mention",
					mlog.String("type", string(child.BlockType)),
				)
				continue
			}
		}

		fields = append(fields, &mm_model.SlackAttachmentField{
			Short: false,
			Title: "설명",
			Value: markdown,
		})
	}
	return fields
}
