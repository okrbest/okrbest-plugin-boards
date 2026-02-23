// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package plugindelivery

import (
	"fmt"

	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	mm_model "github.com/mattermost/mattermost/server/public/model"
)

// MentionDeliver notifies a user they have been mentioned in a block via the plugin API.
// Used for DM notifications (when board is not linked to a channel).
func (pd *PluginDelivery) MentionDeliver(mentionedUser *mm_model.User, extract string, evt notify.BlockChangeEvent) (string, error) {
	author, err := pd.api.GetUserByID(evt.ModifiedBy.UserID)
	if err != nil {
		return "", fmt.Errorf("cannot find user: %w", err)
	}

	// DM 채널로 메시지 전송
	channel, err := pd.getDirectChannel(evt.TeamID, mentionedUser.Id, pd.botID)
	if err != nil {
		return "", fmt.Errorf("cannot get direct channel: %w", err)
	}

	link := utils.MakeCardLink(pd.serverRoot, evt.Board.TeamID, evt.Board.ID, evt.Card.ID)
	boardLink := utils.MakeBoardLink(pd.serverRoot, evt.Board.TeamID, evt.Board.ID)

	post := &mm_model.Post{
		UserId:    pd.botID,
		ChannelId: channel.Id,
		Message:   formatMessage(author.Username, mentionedUser.Username, extract, evt.Card.Title, link, evt.BlockChanged, boardLink, evt.Board.Title),
	}

	if _, err := pd.api.CreatePost(post); err != nil {
		return "", err
	}

	return mentionedUser.Id, nil
}

// BatchMentionDeliver sends a single notification to a channel for multiple mentioned users.
// This is used when the board is linked to a channel to avoid duplicate messages.
func (pd *PluginDelivery) BatchMentionDeliver(mentionedUsers []*mm_model.User, extract string, evt notify.BlockChangeEvent) ([]string, error) {
	if len(mentionedUsers) == 0 {
		return nil, nil
	}

	// 채널 연결이 없으면 배치 전송 불가
	if evt.Board.ChannelID == "" {
		return nil, fmt.Errorf("batch mention delivery requires board to be linked to a channel")
	}

	author, err := pd.api.GetUserByID(evt.ModifiedBy.UserID)
	if err != nil {
		return nil, fmt.Errorf("cannot find user: %w", err)
	}

	link := utils.MakeCardLink(pd.serverRoot, evt.Board.TeamID, evt.Board.ID, evt.Card.ID)
	boardLink := utils.MakeBoardLink(pd.serverRoot, evt.Board.TeamID, evt.Board.ID)

	// 멘션된 사용자들의 username 목록 추출
	usernames := make([]string, len(mentionedUsers))
	userIDs := make([]string, len(mentionedUsers))
	for i, user := range mentionedUsers {
		usernames[i] = user.Username
		userIDs[i] = user.Id
	}

	post := &mm_model.Post{
		UserId:    pd.botID,
		ChannelId: evt.Board.ChannelID,
		Message:   formatBatchMessage(author.Username, usernames, extract, evt.Card.Title, link, evt.BlockChanged, boardLink, evt.Board.Title),
	}

	if _, err := pd.api.CreatePost(post); err != nil {
		return nil, err
	}

	return userIDs, nil
}
