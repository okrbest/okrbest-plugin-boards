// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// ProcessScheduledComments processes all scheduled comments that are due to be sent.
// This method is called periodically by the scheduler.
func (a *App) ProcessScheduledComments() error {
	now := model.GetMillis()

	comments, err := a.store.GetScheduledComments(now)
	if err != nil {
		return err
	}

	if len(comments) == 0 {
		return nil
	}

	a.logger.Debug("Processing scheduled comments",
		mlog.Int("count", len(comments)),
	)

	for _, comment := range comments {
		if err := a.sendScheduledComment(comment); err != nil {
			a.logger.Error("Failed to send scheduled comment",
				mlog.String("blockID", comment.ID),
				mlog.String("boardID", comment.BoardID),
				mlog.String("cardID", comment.ParentID),
				mlog.Err(err),
			)
			continue
		}
	}

	return nil
}

// sendScheduledComment marks a comment as sent and triggers notifications.
func (a *App) sendScheduledComment(comment *model.Block) error {
	// Update status to sent
	patch := &model.BlockPatch{
		UpdatedFields: map[string]interface{}{
			model.BlockFieldScheduledStatus: model.ScheduledStatusSent,
		},
	}

	// Use PatchBlockAndNotify to trigger mentions
	updatedComment, err := a.PatchBlockAndNotify(comment.ID, patch, comment.CreatedBy, false)
	if err != nil {
		return err
	}

	// Get board for WebSocket broadcast
	board, err := a.store.GetBoard(comment.BoardID)
	if err != nil {
		a.logger.Warn("Failed to get board for scheduled comment",
			mlog.String("boardID", comment.BoardID),
			mlog.Err(err),
		)
		// Continue anyway - the comment is already updated
	}

	// Broadcast via WebSocket
	if board != nil {
		a.blockChangeNotifier.Enqueue(func() error {
			a.wsAdapter.BroadcastBlockChange(board.TeamID, updatedComment)
			return nil
		})
	}

	// Trigger notifications for mentions in the comment
	a.notifyBlockChanged(notify.Add, updatedComment, nil, comment.CreatedBy)

	// Post notification to linked channel if exists
	if board != nil && board.ChannelID != "" {
		a.postScheduledCommentNotification(board, comment)
	}

	a.logger.Info("Scheduled comment sent",
		mlog.String("blockID", comment.ID),
		mlog.String("boardID", comment.BoardID),
		mlog.String("cardID", comment.ParentID),
		mlog.String("createdBy", comment.CreatedBy),
	)

	return nil
}

// postScheduledCommentNotification posts a notification to the linked channel.
func (a *App) postScheduledCommentNotification(board *model.Board, comment *model.Block) {
	card, err := a.store.GetBlock(comment.ParentID)
	if err != nil || card == nil {
		a.logger.Warn("Failed to get card for scheduled comment notification",
			mlog.String("cardID", comment.ParentID),
			mlog.Err(err),
		)
		return
	}

	user, err := a.store.GetUserByID(comment.CreatedBy)
	if err != nil || user == nil {
		a.logger.Warn("Failed to get user for scheduled comment notification",
			mlog.String("userID", comment.CreatedBy),
			mlog.Err(err),
		)
		return
	}

	cardLink := utils.MakeCardLink(a.config.ServerRoot, board.TeamID, board.ID, card.ID)
	message := fmt.Sprintf("📝 **%s** commented on [%s](%s):\n> %s",
		user.Username,
		card.Title,
		cardLink,
		comment.Title,
	)

	if err := a.store.PostMessage(message, "", board.ChannelID); err != nil {
		a.logger.Error("Failed to post scheduled comment notification to channel",
			mlog.String("channelID", board.ChannelID),
			mlog.Err(err),
		)
	}
}

// CreateScheduledComment creates a new scheduled comment with validation.
func (a *App) CreateScheduledComment(boardID, cardID, userID, title string, scheduledAt int64) (*model.Block, error) {
	// Validate scheduled time
	now := model.GetMillis()
	minScheduleTime := now + (60 * 1000) // At least 1 minute in the future

	if scheduledAt < minScheduleTime {
		return nil, model.NewErrBadRequest("scheduled time must be at least 1 minute in the future")
	}

	maxScheduleTime := now + (int64(model.MaxScheduleDays) * 24 * 60 * 60 * 1000)
	if scheduledAt > maxScheduleTime {
		return nil, model.NewErrBadRequest("scheduled time cannot be more than 30 days in the future")
	}

	// Check user's scheduled comments limit
	count, err := a.store.GetScheduledCommentsCountByUser(userID)
	if err != nil {
		return nil, err
	}

	if count >= model.MaxScheduledCommentsPerUser {
		return nil, model.NewErrBadRequest("maximum scheduled comments limit reached")
	}

	// Create the comment block
	comment := &model.Block{
		ID:        utils.NewID(utils.IDTypeBlock),
		ParentID:  cardID,
		BoardID:   boardID,
		Type:      model.TypeComment,
		Title:     title,
		CreatedBy: userID,
		CreateAt:  now,
		UpdateAt:  now,
		Fields: map[string]interface{}{
			model.BlockFieldScheduledAt:     scheduledAt,
			model.BlockFieldScheduledStatus: model.ScheduledStatusPending,
		},
	}

	if insertErr := a.store.InsertBlock(comment, userID); insertErr != nil {
		return nil, insertErr
	}

	a.metrics.IncrementBlocksInserted(1)

	// Get board for WebSocket broadcast
	board, err := a.store.GetBoard(boardID)
	if err != nil {
		a.logger.Warn("Failed to get board for scheduled comment",
			mlog.String("boardID", boardID),
			mlog.Err(err),
		)
	}

	// Broadcast the new scheduled comment via WebSocket
	if board != nil {
		a.blockChangeNotifier.Enqueue(func() error {
			a.wsAdapter.BroadcastBlockChange(board.TeamID, comment)
			return nil
		})
	}

	a.logger.Info("Scheduled comment created",
		mlog.String("blockID", comment.ID),
		mlog.String("boardID", boardID),
		mlog.String("cardID", cardID),
		mlog.String("userID", userID),
		mlog.String("scheduledAt", formatScheduledTime(scheduledAt)),
	)

	return comment, nil
}

// CancelScheduledComment cancels a scheduled comment.
func (a *App) CancelScheduledComment(blockID, userID string) (*model.Block, error) {
	block, err := a.store.GetBlock(blockID)
	if err != nil {
		return nil, err
	}

	if block == nil {
		return nil, model.NewErrNotFound("block not found")
	}

	// Verify it's a comment
	if block.Type != model.TypeComment {
		return nil, model.NewErrBadRequest("block is not a comment")
	}

	// Verify it's a pending scheduled comment
	status, _ := block.Fields[model.BlockFieldScheduledStatus].(string)
	if status != model.ScheduledStatusPending {
		return nil, model.NewErrBadRequest("comment is not scheduled or already sent")
	}

	// Verify ownership - only creator can cancel
	if block.CreatedBy != userID {
		return nil, model.NewErrForbidden("can only cancel own scheduled comments")
	}

	// Update status to canceled.
	patch := &model.BlockPatch{
		UpdatedFields: map[string]interface{}{
			model.BlockFieldScheduledStatus: model.ScheduledStatusCanceled,
		},
	}

	updatedBlock, err := a.PatchBlock(blockID, patch, userID)
	if err != nil {
		return nil, err
	}

	a.logger.Info("Scheduled comment canceled",
		mlog.String("blockID", blockID),
		mlog.String("userID", userID),
	)

	return updatedBlock, nil
}

// SendScheduledCommentNow immediately sends a scheduled comment.
func (a *App) SendScheduledCommentNow(blockID, userID string) (*model.Block, error) {
	block, err := a.store.GetBlock(blockID)
	if err != nil {
		return nil, err
	}

	if block == nil {
		return nil, model.NewErrNotFound("block not found")
	}

	// Verify it's a comment
	if block.Type != model.TypeComment {
		return nil, model.NewErrBadRequest("block is not a comment")
	}

	// Verify it's a pending scheduled comment
	status, _ := block.Fields[model.BlockFieldScheduledStatus].(string)
	if status != model.ScheduledStatusPending {
		return nil, model.NewErrBadRequest("comment is not scheduled or already sent")
	}

	// Verify ownership - only creator can send now
	if block.CreatedBy != userID {
		return nil, model.NewErrForbidden("can only send own scheduled comments")
	}

	if err := a.sendScheduledComment(block); err != nil {
		return nil, err
	}

	// Return the updated block
	return a.store.GetBlock(blockID)
}

// UpdateScheduledComment updates the content or scheduled time of a scheduled comment.
func (a *App) UpdateScheduledComment(blockID, userID string, title *string, scheduledAt *int64) (*model.Block, error) {
	block, err := a.store.GetBlock(blockID)
	if err != nil {
		return nil, err
	}

	if block == nil {
		return nil, model.NewErrNotFound("block not found")
	}

	// Verify it's a comment
	if block.Type != model.TypeComment {
		return nil, model.NewErrBadRequest("block is not a comment")
	}

	// Verify it's a pending scheduled comment
	status, _ := block.Fields[model.BlockFieldScheduledStatus].(string)
	if status != model.ScheduledStatusPending {
		return nil, model.NewErrBadRequest("comment is not scheduled or already sent")
	}

	// Verify ownership
	if block.CreatedBy != userID {
		return nil, model.NewErrForbidden("can only update own scheduled comments")
	}

	patch := &model.BlockPatch{}

	if title != nil {
		patch.Title = title
	}

	if scheduledAt != nil {
		// Validate new scheduled time
		now := model.GetMillis()
		minScheduleTime := now + (60 * 1000) // At least 1 minute in the future

		if *scheduledAt < minScheduleTime {
			return nil, model.NewErrBadRequest("scheduled time must be at least 1 minute in the future")
		}

		maxScheduleTime := now + (int64(model.MaxScheduleDays) * 24 * 60 * 60 * 1000)
		if *scheduledAt > maxScheduleTime {
			return nil, model.NewErrBadRequest("scheduled time cannot be more than 30 days in the future")
		}

		patch.UpdatedFields = map[string]interface{}{
			model.BlockFieldScheduledAt: *scheduledAt,
		}
	}

	return a.PatchBlock(blockID, patch, userID)
}

// GetMyScheduledComments returns all pending scheduled comments for a user.
func (a *App) GetMyScheduledComments(userID string) ([]*model.Block, error) {
	return a.store.GetScheduledCommentsByUser(userID)
}

// GetScheduledCommentsForCard returns scheduled comments for a card.
// Only returns comments created by the requesting user.
func (a *App) GetScheduledCommentsForCard(cardID, userID string) ([]*model.Block, error) {
	comments, err := a.store.GetScheduledCommentsForCard(cardID)
	if err != nil {
		return nil, err
	}

	// Filter to only show user's own scheduled comments
	var result []*model.Block
	for _, c := range comments {
		if c.CreatedBy == userID {
			result = append(result, c)
		}
	}

	return result, nil
}

// formatScheduledTime formats the scheduled time for logging.
func formatScheduledTime(scheduledAt int64) string {
	return time.UnixMilli(scheduledAt).Format(time.RFC3339)
}
