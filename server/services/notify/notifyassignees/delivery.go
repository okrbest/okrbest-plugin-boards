// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package notifyassignees

import (
	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"
)

// AssigneeDelivery provides the interface for delivering assignee notifications.
type AssigneeDelivery interface {
	// AssigneeDeliver notifies a user they have been assigned to a card.
	AssigneeDeliver(assigneeID string, assignerUsername string, evt notify.BlockChangeEvent) error
}
