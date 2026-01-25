// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package plugindelivery

import (
	"fmt"

	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	mm_model "github.com/mattermost/mattermost/server/public/model"
)

const (
	// TODO: localize these when i18n is available.
	defAssigneeTemplate = "@%s님이 카드 [%s](%s)의 담당자로 @%s님을 지정했습니다 (보드: [%s](%s))"
)

// AssigneeDeliver notifies a user they have been assigned to a card via the plugin API.
func (pd *PluginDelivery) AssigneeDeliver(assigneeID string, assignerUsername string, evt notify.BlockChangeEvent) error {
	assignee, err := pd.api.GetUserByID(assigneeID)
	if err != nil {
		return fmt.Errorf("cannot find assignee user: %w", err)
	}

	// 보드에 연결된 채널이 있으면 그 채널로 메시지 전송, 없으면 DM으로 전송
	var channelID string
	if evt.Board.ChannelID != "" {
		// 보드와 연결된 채널로 메시지 전송
		channelID = evt.Board.ChannelID
	} else {
		// DM 채널로 메시지 전송 (기존 방식)
		channel, err := pd.getDirectChannel(evt.TeamID, assignee.Id, pd.botID)
		if err != nil {
			return fmt.Errorf("cannot get direct channel: %w", err)
		}
		channelID = channel.Id
	}

	link := utils.MakeCardLink(pd.serverRoot, evt.Board.TeamID, evt.Board.ID, evt.Card.ID)
	boardLink := utils.MakeBoardLink(pd.serverRoot, evt.Board.TeamID, evt.Board.ID)

	message := formatAssigneeMessage(assignerUsername, assignee.Username, evt.Card.Title, link, evt.Board.Title, boardLink)

	post := &mm_model.Post{
		UserId:    pd.botID,
		ChannelId: channelID,
		Message:   message,
	}

	if _, err := pd.api.CreatePost(post); err != nil {
		return err
	}

	return nil
}

func formatAssigneeMessage(assigner string, assignee string, cardTitle string, cardLink string, boardTitle string, boardLink string) string {
	return fmt.Sprintf(defAssigneeTemplate, assigner, cardTitle, cardLink, assignee, boardTitle, boardLink)
}
