// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package notifymentions

import (
	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"

	mm_model "github.com/mattermost/mattermost/server/public/model"
)

// MentionDelivery provides an interface for delivering @mention notifications to other systems, such as
// channels server via plugin API.
// On success the user id of the user mentioned is returned.
type MentionDelivery interface {
	MentionDeliver(mentionedUser *mm_model.User, extract string, evt notify.BlockChangeEvent) (string, error)
	UserByUsername(mentionUsername string) (*mm_model.User, error)
	// BatchMentionDeliver sends a single notification for multiple mentioned users.
	// Used when board is linked to a channel to avoid duplicate messages.
	// Returns the list of user IDs that were successfully notified.
	BatchMentionDeliver(mentionedUsers []*mm_model.User, extract string, evt notify.BlockChangeEvent) ([]string, error)
}
