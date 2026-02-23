// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package plugindelivery

import (
	"fmt"
	"strings"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

const (
	// TODO: localize these when i18n is available.
	defCommentTemplate     = "@%s님이 @%s님을 카드 [%s](%s) 댓글에서 언급했습니다 (보드: [%s](%s))\n> %s"
	defDescriptionTemplate = "@%s님이 @%s님을 카드 [%s](%s)에서 언급했습니다 (보드: [%s](%s))\n> %s"

	// Templates for batch mentions (multiple users in one message)
	defBatchCommentTemplate     = "@%s님이 %s님을 카드 [%s](%s) 댓글에서 언급했습니다 (보드: [%s](%s))\n> %s"
	defBatchDescriptionTemplate = "@%s님이 %s님을 카드 [%s](%s)에서 언급했습니다 (보드: [%s](%s))\n> %s"
)

func formatMessage(author string, mentionedUser string, extract string, card string, link string, block *model.Block, boardLink string, board string) string {
	template := defDescriptionTemplate
	if block.Type == model.TypeComment {
		template = defCommentTemplate
	}
	return fmt.Sprintf(template, author, mentionedUser, card, link, board, boardLink, extract)
}

// formatBatchMessage formats a message for multiple mentioned users.
func formatBatchMessage(author string, mentionedUsernames []string, extract string, card string, link string, block *model.Block, boardLink string, board string) string {
	template := defBatchDescriptionTemplate
	if block.Type == model.TypeComment {
		template = defBatchCommentTemplate
	}

	// Format usernames as "@user1, @user2, @user3"
	formattedUsers := formatUserList(mentionedUsernames)

	return fmt.Sprintf(template, author, formattedUsers, card, link, board, boardLink, extract)
}

// formatUserList formats a list of usernames with @ prefix.
// e.g., ["user1", "user2", "user3"] -> "@user1, @user2, @user3"
func formatUserList(usernames []string) string {
	if len(usernames) == 0 {
		return ""
	}

	formatted := make([]string, len(usernames))
	for i, username := range usernames {
		formatted[i] = "@" + username
	}
	return strings.Join(formatted, ", ")
}
