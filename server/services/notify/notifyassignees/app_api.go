// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package notifyassignees

import (
	"github.com/mattermost/mattermost-plugin-boards/server/model"
)

// AppAPI provides APIs for the assignee notification backend.
type AppAPI interface {
	GetUserByID(userID string) (*model.User, error)
	GetMemberForBoard(boardID, userID string) (*model.BoardMember, error)
	CreateSubscription(sub *model.Subscription) (*model.Subscription, error)
}
