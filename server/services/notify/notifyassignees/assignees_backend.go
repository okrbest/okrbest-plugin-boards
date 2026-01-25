// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package notifyassignees

import (
	"encoding/json"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"
	"github.com/mattermost/mattermost-plugin-boards/server/services/permissions"
	"github.com/wiggin77/merror"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	backendName = "notifyAssignees"
)

type BackendParams struct {
	AppAPI      AppAPI
	Permissions permissions.PermissionsService
	Delivery    AssigneeDelivery
	Logger      mlog.LoggerIFace
}

// Backend provides the notification backend for assignee changes.
type Backend struct {
	appAPI      AppAPI
	permissions permissions.PermissionsService
	delivery    AssigneeDelivery
	logger      mlog.LoggerIFace
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

func (b *Backend) BlockChanged(evt notify.BlockChangeEvent) error {
	if evt.Board == nil || evt.Card == nil {
		return nil
	}

	// Only process card updates (not additions or deletions for assignee notifications)
	if evt.Action != notify.Update {
		return nil
	}

	// Only process card blocks
	if evt.BlockChanged.Type != model.TypeCard {
		return nil
	}

	// Get the person/multiPerson property changes
	newAssignees := b.extractAssignees(evt.BlockChanged, evt.Board)
	oldAssignees := b.extractAssignees(evt.BlockOld, evt.Board)

	// Find newly added assignees
	addedAssignees := b.findAddedAssignees(oldAssignees, newAssignees)
	if len(addedAssignees) == 0 {
		return nil
	}

	// Get the assigner's username
	var assignerUsername string
	if evt.ModifiedBy != nil {
		user, err := b.appAPI.GetUserByID(evt.ModifiedBy.UserID)
		if err == nil && user != nil {
			assignerUsername = user.Username
		}
	}

	merr := merror.New()

	for _, assigneeID := range addedAssignees {
		// Don't notify users who assigned themselves
		if evt.ModifiedBy != nil && assigneeID == evt.ModifiedBy.UserID {
			continue
		}

		// Check if assignee has permission to view the board
		if !b.permissions.HasPermissionToBoard(assigneeID, evt.Board.ID, model.PermissionViewBoard) {
			b.logger.Debug("Assignee doesn't have permission to view board, skipping notification",
				mlog.String("assignee_id", assigneeID),
				mlog.String("board_id", evt.Board.ID),
			)
			continue
		}

		// Deliver the notification
		if err := b.delivery.AssigneeDeliver(assigneeID, assignerUsername, evt); err != nil {
			b.logger.Error("Failed to deliver assignee notification",
				mlog.String("assignee_id", assigneeID),
				mlog.Err(err),
			)
			merr.Append(err)
			continue
		}

		// Auto-subscribe the assignee to the card
		b.subscribeAssigneeToCard(assigneeID, evt)

		b.logger.Debug("Assignee notification delivered",
			mlog.String("assignee_id", assigneeID),
			mlog.String("card_id", evt.Card.ID),
		)
	}

	return merr.ErrorOrNil()
}

// extractAssignees extracts all person and multiPerson property values from a block.
func (b *Backend) extractAssignees(block *model.Block, board *model.Board) map[string]bool {
	assignees := make(map[string]bool)

	if block == nil || board == nil {
		return assignees
	}

	propsIface, ok := block.Fields["properties"]
	if !ok {
		return assignees
	}

	blockProps, ok := propsIface.(map[string]interface{})
	if !ok {
		return assignees
	}

	// Build a map of property info (type and name) from board's cardProperties
	propInfo := make(map[string]struct {
		Type string
		Name string
	})
	for _, prop := range board.CardProperties {
		propID, _ := prop["id"].(string)
		propType, _ := prop["type"].(string)
		propName, _ := prop["name"].(string)
		if propID != "" && propType != "" {
			propInfo[propID] = struct {
				Type string
				Name string
			}{Type: propType, Name: propName}
		}
	}

	for propID, value := range blockProps {
		info, ok := propInfo[propID]
		if !ok {
			continue
		}

		// Only process properties named "담당자" (Assignee)
		if info.Name != "담당자" {
			continue
		}

		switch info.Type {
		case "person":
			if userID, ok := value.(string); ok && userID != "" {
				assignees[userID] = true
			}
		case "multiPerson":
			switch v := value.(type) {
			case []interface{}:
				for _, item := range v {
					if userID, ok := item.(string); ok && userID != "" {
						assignees[userID] = true
					}
				}
			case []string:
				for _, userID := range v {
					if userID != "" {
						assignees[userID] = true
					}
				}
			case string:
				// Handle JSON string format
				if v != "" {
					var userIDs []string
					if err := json.Unmarshal([]byte(v), &userIDs); err == nil {
						for _, userID := range userIDs {
							if userID != "" {
								assignees[userID] = true
							}
						}
					}
				}
			}
		}
	}

	return assignees
}

// findAddedAssignees returns assignees that are in newAssignees but not in oldAssignees.
func (b *Backend) findAddedAssignees(oldAssignees, newAssignees map[string]bool) []string {
	var added []string
	for userID := range newAssignees {
		if !oldAssignees[userID] {
			added = append(added, userID)
		}
	}
	return added
}

// subscribeAssigneeToCard creates a subscription for the assignee to the card.
func (b *Backend) subscribeAssigneeToCard(assigneeID string, evt notify.BlockChangeEvent) {
	sub := &model.Subscription{
		BlockType:      model.TypeCard,
		BlockID:        evt.Card.ID,
		SubscriberType: model.SubTypeUser,
		SubscriberID:   assigneeID,
	}

	if _, err := b.appAPI.CreateSubscription(sub); err != nil {
		b.logger.Warn("Cannot subscribe assignee to card",
			mlog.String("assignee_id", assigneeID),
			mlog.String("card_id", evt.Card.ID),
			mlog.Err(err),
		)
	}
}
