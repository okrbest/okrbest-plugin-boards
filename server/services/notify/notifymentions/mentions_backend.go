// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package notifymentions

import (
	"errors"
	"fmt"
	"sync"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"
	"github.com/mattermost/mattermost-plugin-boards/server/services/permissions"
	"github.com/wiggin77/merror"

	mm_model "github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	backendName = "notifyMentions"
)

var (
	ErrMentionPermission = errors.New("mention not permitted")
)

type MentionListener interface {
	OnMention(userID string, evt notify.BlockChangeEvent)
}

type BackendParams struct {
	AppAPI      AppAPI
	Permissions permissions.PermissionsService
	Delivery    MentionDelivery
	Logger      mlog.LoggerIFace
}

// Backend provides the notification backend for @mentions.
type Backend struct {
	appAPI      AppAPI
	permissions permissions.PermissionsService
	delivery    MentionDelivery
	logger      mlog.LoggerIFace

	mux       sync.RWMutex
	listeners []MentionListener
}

func New(params BackendParams) *Backend {
	return &Backend{
		appAPI:      params.AppAPI,
		permissions: params.Permissions,
		delivery:    params.Delivery,
		logger:      params.Logger,
	}
}

func (b *Backend) Start() error {
	return nil
}

func (b *Backend) ShutDown() error {
	_ = b.logger.Flush()
	return nil
}

func (b *Backend) Name() string {
	return backendName
}

func (b *Backend) AddListener(l MentionListener) {
	b.mux.Lock()
	defer b.mux.Unlock()
	b.listeners = append(b.listeners, l)
	b.logger.Debug("Mention listener added.", mlog.Int("listener_count", len(b.listeners)))
}

func (b *Backend) RemoveListener(l MentionListener) {
	b.mux.Lock()
	defer b.mux.Unlock()
	list := make([]MentionListener, 0, len(b.listeners))
	for _, listener := range b.listeners {
		if listener != l {
			list = append(list, listener)
		}
	}
	b.listeners = list
	b.logger.Debug("Mention listener removed.", mlog.Int("listener_count", len(b.listeners)))
}

func (b *Backend) BlockChanged(evt notify.BlockChangeEvent) error {
	if evt.Board == nil || evt.Card == nil {
		return nil
	}

	if evt.Action == notify.Delete {
		return nil
	}

	switch evt.BlockChanged.Type {
	case model.TypeText, model.TypeComment, model.TypeImage:
	default:
		return nil
	}

	mentions := extractMentions(evt.BlockChanged)
	if len(mentions) == 0 {
		return nil
	}

	oldMentions := extractMentions(evt.BlockOld)

	// 새로운 멘션만 필터링 (기존에 없던 것들)
	newMentions := make(map[string]struct{})
	for username := range mentions {
		if _, exists := oldMentions[username]; !exists {
			newMentions[username] = struct{}{}
		}
	}

	if len(newMentions) == 0 {
		return nil
	}

	b.mux.RLock()
	listeners := make([]MentionListener, len(b.listeners))
	copy(listeners, b.listeners)
	b.mux.RUnlock()

	// 채널 연결 보드인 경우 배치 처리
	if evt.Board.ChannelID != "" {
		return b.processBatchMentions(newMentions, evt, listeners)
	}

	// DM 모드: 기존대로 개별 처리
	return b.processIndividualMentions(newMentions, evt, listeners)
}

// processBatchMentions handles mentions for boards linked to a channel.
// All valid mentions are collected and sent as a single message to the channel.
func (b *Backend) processBatchMentions(newMentions map[string]struct{}, evt notify.BlockChangeEvent, listeners []MentionListener) error {
	merr := merror.New()
	validUsers := make([]*mm_model.User, 0, len(newMentions))
	validUserIDs := make([]string, 0, len(newMentions))

	// 유효한 멘션 사용자들 수집
	for username := range newMentions {
		user, err := b.validateAndProcessMention(username, evt)
		if err != nil {
			if errors.Is(err, ErrMentionPermission) {
				b.logger.Debug("Cannot deliver notification", mlog.String("user", username), mlog.Err(err))
			} else {
				merr.Append(fmt.Errorf("cannot validate mention for @%s: %w", username, err))
			}
			continue
		}
		if user != nil {
			validUsers = append(validUsers, user)
			validUserIDs = append(validUserIDs, user.Id)
		}
	}

	if len(validUsers) == 0 {
		return merr.ErrorOrNil()
	}

	// 배치 전송 (한 번에 모든 멘션된 사용자들에게)
	// extractText를 사용하여 개별 DM과 동일하게 ~100자로 제한
	// 배치 알림에서는 첫 번째 사용자 이름을 기준으로 추출 (모든 사용자에게 동일한 내용)
	firstUsername := validUsers[0].Username
	extract := extractText(evt.BlockChanged.Title, firstUsername, newLimits())
	userIDs, err := b.delivery.BatchMentionDeliver(validUsers, extract, evt)
	if err != nil {
		merr.Append(fmt.Errorf("cannot deliver batch notification: %w", err))
		return merr.ErrorOrNil()
	}

	b.logger.Debug("Batch mention notification delivered",
		mlog.Int("user_count", len(userIDs)),
		mlog.Int("listener_count", len(listeners)),
	)

	// 리스너들에게 알림
	for _, userID := range userIDs {
		for _, listener := range listeners {
			safeCallListener(listener, userID, evt, b.logger)
		}
	}

	return merr.ErrorOrNil()
}

// processIndividualMentions handles mentions for boards not linked to a channel (DM mode).
// Each mention is sent as a separate DM to the mentioned user.
func (b *Backend) processIndividualMentions(newMentions map[string]struct{}, evt notify.BlockChangeEvent, listeners []MentionListener) error {
	merr := merror.New()

	for username := range newMentions {
		extract := extractText(evt.BlockChanged.Title, username, newLimits())

		userID, err := b.deliverMentionNotification(username, extract, evt)
		if err != nil {
			if errors.Is(err, ErrMentionPermission) {
				b.logger.Debug("Cannot deliver notification", mlog.String("user", username), mlog.Err(err))
			} else {
				merr.Append(fmt.Errorf("cannot deliver notification for @%s: %w", username, err))
			}
			continue
		}

		if userID == "" {
			continue
		}

		b.logger.Debug("Mention notification delivered",
			mlog.String("user", username),
			mlog.Int("listener_count", len(listeners)),
		)

		for _, listener := range listeners {
			safeCallListener(listener, userID, evt, b.logger)
		}
	}

	return merr.ErrorOrNil()
}

func safeCallListener(listener MentionListener, userID string, evt notify.BlockChangeEvent, logger mlog.LoggerIFace) {
	// don't let panicky listeners stop notifications
	defer func() {
		if r := recover(); r != nil {
			logger.Error("panic calling @mention notification listener", mlog.Any("err", r))
		}
	}()
	listener.OnMention(userID, evt)
}

// validateAndProcessMention validates if a mention is allowed and processes auto-membership.
// Returns the mentioned user if valid, nil if the username doesn't exist.
func (b *Backend) validateAndProcessMention(username string, evt notify.BlockChangeEvent) (*mm_model.User, error) {
	mentionedUser, err := b.delivery.UserByUsername(username)
	if err != nil {
		if model.IsErrNotFound(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("cannot lookup mentioned user: %w", err)
	}

	if evt.ModifiedBy == nil {
		return nil, fmt.Errorf("invalid user cannot mention: %w", ErrMentionPermission)
	}

	if evt.Board.Type == model.BoardTypeOpen {
		switch {
		case evt.ModifiedBy.SchemeAdmin, evt.ModifiedBy.SchemeEditor, evt.ModifiedBy.SchemeCommenter:
			if !b.permissions.HasPermissionToTeam(mentionedUser.Id, evt.TeamID, model.PermissionViewTeam) {
				return nil, fmt.Errorf("%s cannot mention non-team member %s : %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
			}
			member, err := b.appAPI.GetMemberForBoard(evt.Board.ID, mentionedUser.Id)
			if member == nil || model.IsErrNotFound(err) {
				newBoardMember := &model.BoardMember{
					UserID:  mentionedUser.Id,
					BoardID: evt.Board.ID,
					SchemeViewer: evt.Board.MinimumRole == model.BoardRoleViewer ||
						evt.Board.MinimumRole == model.BoardRoleCommenter ||
						evt.Board.MinimumRole == model.BoardRoleEditor,
					SchemeCommenter: evt.Board.MinimumRole == model.BoardRoleCommenter ||
						evt.Board.MinimumRole == model.BoardRoleEditor,
					SchemeEditor: evt.Board.MinimumRole == model.BoardRoleEditor,
				}
				if _, err = b.appAPI.AddMemberToBoard(newBoardMember); err != nil {
					return nil, fmt.Errorf("cannot add mentioned user %s to board %s: %w", mentionedUser.Id, evt.Board.ID, err)
				}
				b.logger.Debug("auto-added mentioned user to board",
					mlog.String("user_id", mentionedUser.Id),
					mlog.String("board_id", evt.Board.ID),
				)
			}
		case evt.ModifiedBy.SchemeViewer:
			return nil, fmt.Errorf("%s (viewer) cannot mention user %s: %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
		default:
			if !b.permissions.HasPermissionToBoard(mentionedUser.Id, evt.Board.ID, model.PermissionViewBoard) {
				return nil, fmt.Errorf("%s cannot mention non-board member %s : %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
			}
		}
	} else {
		switch {
		case evt.ModifiedBy.SchemeViewer:
			return nil, fmt.Errorf("%s (viewer) cannot mention user %s: %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
		default:
			if !b.permissions.HasPermissionToBoard(mentionedUser.Id, evt.Board.ID, model.PermissionViewBoard) {
				return nil, fmt.Errorf("%s cannot mention non-board member %s : %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
			}
		}
	}

	return mentionedUser, nil
}

func (b *Backend) deliverMentionNotification(username string, extract string, evt notify.BlockChangeEvent) (string, error) {
	mentionedUser, err := b.delivery.UserByUsername(username)
	if err != nil {
		if model.IsErrNotFound(err) {
			// not really an error; could just be someone typed "@sometext"
			return "", nil
		} else {
			return "", fmt.Errorf("cannot lookup mentioned user: %w", err)
		}
	}

	if evt.ModifiedBy == nil {
		return "", fmt.Errorf("invalid user cannot mention: %w", ErrMentionPermission)
	}

	if evt.Board.Type == model.BoardTypeOpen {
		// public board rules:
		//    - admin, editor, commenter: can mention anyone on team (mentioned users are automatically added to board)
		//    - guest: can mention board members
		switch {
		case evt.ModifiedBy.SchemeAdmin, evt.ModifiedBy.SchemeEditor, evt.ModifiedBy.SchemeCommenter:
			if !b.permissions.HasPermissionToTeam(mentionedUser.Id, evt.TeamID, model.PermissionViewTeam) {
				return "", fmt.Errorf("%s cannot mention non-team member %s : %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
			}
			// add mentioned user to board (if not already a member)
			member, err := b.appAPI.GetMemberForBoard(evt.Board.ID, mentionedUser.Id)
			if member == nil || model.IsErrNotFound(err) {
				// create memberships based on minimum board role
				newBoardMember := &model.BoardMember{
					UserID:  mentionedUser.Id,
					BoardID: evt.Board.ID,
					SchemeViewer: evt.Board.MinimumRole == model.BoardRoleViewer ||
						evt.Board.MinimumRole == model.BoardRoleCommenter ||
						evt.Board.MinimumRole == model.BoardRoleEditor,
					SchemeCommenter: evt.Board.MinimumRole == model.BoardRoleCommenter ||
						evt.Board.MinimumRole == model.BoardRoleEditor,
					SchemeEditor: evt.Board.MinimumRole == model.BoardRoleEditor,
				}
				if _, err = b.appAPI.AddMemberToBoard(newBoardMember); err != nil {
					return "", fmt.Errorf("cannot add mentioned user %s to board %s: %w", mentionedUser.Id, evt.Board.ID, err)
				}
				b.logger.Debug("auto-added mentioned user to board",
					mlog.String("user_id", mentionedUser.Id),
					mlog.String("board_id", evt.Board.ID),
					mlog.String("board_type", string(evt.Board.Type)),
				)
			} else {
				b.logger.Debug("skipping auto-add mentioned user to board; already a member",
					mlog.String("user_id", mentionedUser.Id),
					mlog.String("board_id", evt.Board.ID),
					mlog.String("board_type", string(evt.Board.Type)),
				)
			}
		case evt.ModifiedBy.SchemeViewer:
			// viewer should not have gotten this far since they cannot add text to a card
			return "", fmt.Errorf("%s (viewer) cannot mention user %s: %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
		default:
			// this is a guest
			if !b.permissions.HasPermissionToBoard(mentionedUser.Id, evt.Board.ID, model.PermissionViewBoard) {
				return "", fmt.Errorf("%s cannot mention non-board member %s : %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
			}
		}
	} else {
		// private board rules:
		//    - admin, editor, commenter, guest: can mention board members
		switch {
		case evt.ModifiedBy.SchemeViewer:
			// viewer should not have gotten this far since they cannot add text to a card
			return "", fmt.Errorf("%s (viewer) cannot mention user %s: %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
		default:
			// everyone else can mention board members
			if !b.permissions.HasPermissionToBoard(mentionedUser.Id, evt.Board.ID, model.PermissionViewBoard) {
				return "", fmt.Errorf("%s cannot mention non-board member %s : %w", evt.ModifiedBy.UserID, mentionedUser.Id, ErrMentionPermission)
			}
		}
	}

	return b.delivery.MentionDeliver(mentionedUser, extract, evt)
}
