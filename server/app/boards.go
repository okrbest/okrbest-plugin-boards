// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"errors"
	"fmt"
	"strings"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/mattermost/mattermost-plugin-boards/server/services/notify"
	"github.com/mattermost/mattermost-plugin-boards/server/utils"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

var (
	ErrNewBoardCannotHaveID = errors.New("new board cannot have an ID")
)

const linkBoardMessage = "@%s님이 보드 [%s](%s)를 이 채널에 연결했습니다"
const unlinkBoardMessage = "@%s님이 보드 [%s](%s)와 이 채널의 연결을 해제했습니다"
const shareCardMessage = "@%s가 카드 [%s](%s)를 공유 하였습니다 (보드: [%s](%s))"

var (
	errNoDefaultCategoryFound   = errors.New("no default category found for user")
	errBoardNotLinkedToChannel  = errors.New("board is not linked to any channel")
	errSubscriptionsUnavailable = errors.New("subscriptions backend is not initialized")
)

func (a *App) GetBoard(boardID string) (*model.Board, error) {
	board, err := a.store.GetBoard(boardID)
	if err != nil {
		return nil, err
	}
	return board, nil
}

func (a *App) GetBoardCount(includeDeleted bool) (int64, error) {
	return a.store.GetBoardCount(includeDeleted)
}

func (a *App) GetBoardMetadata(boardID string) (*model.Board, *model.BoardMetadata, error) {
	license := a.store.GetLicense()
	if license == nil || !(*license.Features.Compliance) {
		return nil, nil, model.ErrInsufficientLicense
	}

	board, err := a.GetBoard(boardID)
	if model.IsErrNotFound(err) {
		// Board may have been deleted, retrieve most recent history instead
		board, err = a.getBoardHistory(boardID, true)
		if err != nil {
			return nil, nil, err
		}
	}
	if err != nil {
		return nil, nil, err
	}

	earliestTime, _, err := a.getBoardDescendantModifiedInfo(boardID, false)
	if err != nil {
		return nil, nil, err
	}

	latestTime, lastModifiedBy, err := a.getBoardDescendantModifiedInfo(boardID, true)
	if err != nil {
		return nil, nil, err
	}

	boardMetadata := model.BoardMetadata{
		BoardID:                 boardID,
		DescendantFirstUpdateAt: earliestTime,
		DescendantLastUpdateAt:  latestTime,
		CreatedBy:               board.CreatedBy,
		LastModifiedBy:          lastModifiedBy,
	}
	return board, &boardMetadata, nil
}

// getBoardForBlock returns the board that owns the specified block.
func (a *App) getBoardForBlock(blockID string) (*model.Board, error) {
	block, err := a.GetBlockByID(blockID)
	if err != nil {
		return nil, fmt.Errorf("cannot get block %s: %w", blockID, err)
	}

	board, err := a.GetBoard(block.BoardID)
	if err != nil {
		return nil, fmt.Errorf("cannot get board %s: %w", block.BoardID, err)
	}

	return board, nil
}

func (a *App) getBoardHistory(boardID string, latest bool) (*model.Board, error) {
	opts := model.QueryBoardHistoryOptions{
		Limit:      1,
		Descending: latest,
	}
	boards, err := a.store.GetBoardHistory(boardID, opts)
	if err != nil {
		return nil, fmt.Errorf("could not get history for board: %w", err)
	}
	if len(boards) == 0 {
		return nil, nil
	}

	return boards[0], nil
}

func (a *App) getBoardDescendantModifiedInfo(boardID string, latest bool) (int64, string, error) {
	board, err := a.getBoardHistory(boardID, latest)
	if err != nil {
		return 0, "", err
	}
	if board == nil {
		return 0, "", fmt.Errorf("history not found for board: %w", err)
	}

	var timestamp int64
	modifiedBy := board.ModifiedBy
	if latest {
		timestamp = board.UpdateAt
	} else {
		timestamp = board.CreateAt
	}

	// use block_history to fetch blocks in case they were deleted and no longer exist in blocks table.
	opts := model.QueryBlockHistoryOptions{
		Limit:      1,
		Descending: latest,
	}
	blocks, err := a.store.GetBlockHistoryDescendants(boardID, opts)
	if err != nil {
		return 0, "", fmt.Errorf("could not get blocks history descendants for board: %w", err)
	}
	if len(blocks) > 0 {
		// Compare the board history info with the descendant block info, if it exists
		block := blocks[0]
		if latest && block.UpdateAt > timestamp {
			timestamp = block.UpdateAt
			modifiedBy = block.ModifiedBy
		} else if !latest && block.CreateAt < timestamp {
			timestamp = block.CreateAt
			modifiedBy = block.ModifiedBy
		}
	}
	return timestamp, modifiedBy, nil
}

func (a *App) setBoardCategoryFromSource(sourceBoardID, destinationBoardID, userID, teamID string, asTemplate bool) error {
	// find source board's category ID for the user
	userCategoryBoards, err := a.GetUserCategoryBoards(userID, teamID)
	if err != nil {
		return err
	}

	var destinationCategoryID string

	for _, categoryBoard := range userCategoryBoards {
		for _, metadata := range categoryBoard.BoardMetadata {
			if metadata.BoardID == sourceBoardID {
				// category found!
				destinationCategoryID = categoryBoard.ID
				break
			}
		}
	}

	if destinationCategoryID == "" {
		// if source board is not mapped to a category for this user,
		// then move new board to default category
		if !asTemplate {
			return a.addBoardsToDefaultCategory(userID, teamID, []*model.Board{{ID: destinationBoardID}})
		} else {
			return nil
		}
	}

	// now that we have source board's category,
	// we send destination board to the same category
	return a.AddUpdateUserCategoryBoard(teamID, userID, destinationCategoryID, []string{destinationBoardID})
}

func (a *App) DuplicateBoard(boardID, userID, toTeam string, asTemplate bool) (*model.BoardsAndBlocks, []*model.BoardMember, error) {
	bab, members, cardIDMapping, err := a.store.DuplicateBoard(boardID, userID, toTeam, asTemplate)
	if err != nil {
		return nil, nil, err
	}

	// copy any file attachments from the duplicated blocks.
	fileIDMapping, err := a.CopyAndUpdateCardFiles(boardID, userID, bab.Blocks, asTemplate)
	if err != nil {
		dbab := model.NewDeleteBoardsAndBlocksFromBabs(bab)
		if dErr := a.store.DeleteBoardsAndBlocks(dbab, userID); dErr != nil {
			a.logger.Error("Cannot delete board after duplication error when updating block's file info", mlog.String("boardID", bab.Boards[0].ID), mlog.Err(dErr))
		}
		return nil, nil, fmt.Errorf("could not patch file IDs while duplicating board %s: %w", boardID, err)
	}

	if len(cardIDMapping) > 0 {
		if copyErr := a.CopyBlockSuiteDocs(cardIDMapping, fileIDMapping); copyErr != nil {
			a.logger.Warn("Failed to copy BlockSuite docs during board duplication", mlog.String("boardID", boardID), mlog.Err(copyErr))
		}
	}

	if !asTemplate {
		for _, board := range bab.Boards {
			if categoryErr := a.setBoardCategoryFromSource(boardID, board.ID, userID, toTeam, asTemplate); categoryErr != nil {
				return nil, nil, categoryErr
			}
		}
	}

	a.blockChangeNotifier.Enqueue(func() error {
		teamID := ""
		for _, board := range bab.Boards {
			teamID = board.TeamID
			a.wsAdapter.BroadcastBoardChange(teamID, board)
		}
		for _, block := range bab.Blocks {
			blk := block
			a.wsAdapter.BroadcastBlockChange(teamID, blk)
			a.notifyBlockChanged(notify.Add, blk, nil, userID)
		}
		for _, member := range members {
			a.wsAdapter.BroadcastMemberChange(teamID, member.BoardID, member)
		}
		return nil
	})

	return bab, members, err
}

func (a *App) GetBoardsForUserAndTeam(userID, teamID string, includePublicBoards bool) ([]*model.Board, error) {
	baseBoards, err := a.store.GetBoardsForUserAndTeam(userID, teamID, includePublicBoards)
	if err != nil {
		return nil, err
	}
	if !includePublicBoards {
		// Guests keep the existing strict, membership-only behavior.
		return baseBoards, nil
	}
	return a.expandBoardsWithACLAndFullVisibility(userID, teamID, baseBoards, "", func(onlyWithACL bool) ([]*model.Board, error) {
		return a.store.GetBoardsInTeam(teamID, onlyWithACL)
	})
}

// expandBoardsWithACLAndFullVisibility adds boards the user cannot see via
// membership/open-board rules but is nonetheless granted access to through
// board ACL entries (department/position/department+position) or a
// full-visibility position ("CEO"). Without this, GetBoardPermissions could
// correctly grant a user access to a board they still have no way to
// discover, since the base list/search queries only consider membership.
//
// The user's org context is resolved once per call (not once per candidate
// board), and fetchCandidates is asked to pre-filter to ACL-carrying boards
// via the has_acl_entries index whenever the user isn't full-visibility, so
// the cost of this expansion scales with the number of ACL-carrying boards
// rather than total boards in the team.
func (a *App) expandBoardsWithACLAndFullVisibility(userID, teamID string, baseBoards []*model.Board, titleFilter string, fetchCandidates func(onlyWithACL bool) ([]*model.Board, error)) ([]*model.Board, error) {
	orgUnits, positions, isCEO := resolveOrgContextForScope(a.permissions, userID, teamID)

	candidates, err := fetchCandidates(!isCEO)
	if err != nil {
		a.logger.Warn("failed to load candidate boards for ACL/full-visibility expansion", mlog.Err(err))
		return baseBoards, nil
	}
	a.logger.Debug("expandBoardsWithACLAndFullVisibility context",
		mlog.String("userID", userID),
		mlog.String("teamID", teamID),
		mlog.Int("baseBoardsCount", len(baseBoards)),
		mlog.Int("candidatesCount", len(candidates)),
		mlog.Bool("isCEO", isCEO),
		mlog.String("orgUnits", strings.Join(orgUnits, ",")),
		mlog.String("positions", strings.Join(positions, ",")),
	)

	if isCEO {
		if titleFilter == "" {
			return candidates, nil
		}
		return filterBoardsByTitle(candidates, titleFilter), nil
	}

	seen := make(map[string]bool, len(baseBoards))
	result := make([]*model.Board, 0, len(baseBoards))
	aclParseSkipped := 0
	titleFiltered := 0
	aclPermissionMissed := 0
	for _, board := range baseBoards {
		if !seen[board.ID] {
			seen[board.ID] = true
			result = append(result, board)
		}
	}

	for _, board := range candidates {
		if seen[board.ID] {
			continue
		}
		entries, parseErr := model.ParseBoardACLFromProperties(board.Properties)
		if parseErr != nil || len(entries) == 0 {
			aclParseSkipped++
			continue // DB already filtered by has_acl_entries; this is just a safety net
		}
		if titleFilter != "" && !boardTitleMatches(board, titleFilter) {
			titleFiltered++
			continue
		}
		if permission, _ := model.EvaluateBoardACLEntries(entries, userID, orgUnits, positions); permission == model.EffectiveBoardPermissionNone {
			aclPermissionMissed++
			continue
		}
		seen[board.ID] = true
		result = append(result, board)
	}
	a.logger.Debug("expandBoardsWithACLAndFullVisibility result",
		mlog.String("userID", userID),
		mlog.String("teamID", teamID),
		mlog.Int("resultCount", len(result)),
		mlog.Int("aclParseSkipped", aclParseSkipped),
		mlog.Int("titleFiltered", titleFiltered),
		mlog.Int("aclPermissionMissed", aclPermissionMissed),
	)

	return result, nil
}

func resolveOrgContextForScope(service interface {
	ResolveOrgContext(userID string) (orgUnits []string, positions []string, isCEO bool)
}, userID, teamID string) ([]string, []string, bool) {
	if teamID != "" {
		if resolver, ok := service.(interface {
			ResolveOrgContextForTeam(userID, teamID string) (orgUnits []string, positions []string, isCEO bool)
		}); ok {
			return resolver.ResolveOrgContextForTeam(userID, teamID)
		}
	}
	return service.ResolveOrgContext(userID)
}

func filterBoardsByTitle(boards []*model.Board, term string) []*model.Board {
	filtered := make([]*model.Board, 0, len(boards))
	for _, board := range boards {
		if boardTitleMatches(board, term) {
			filtered = append(filtered, board)
		}
	}
	return filtered
}

func boardTitleMatches(board *model.Board, term string) bool {
	return strings.Contains(strings.ToLower(board.Title), strings.ToLower(term))
}

func (a *App) GetTemplateBoards(teamID, userID string) ([]*model.Board, error) {
	return a.store.GetTemplateBoards(teamID, userID)
}

func (a *App) CreateBoard(board *model.Board, userID string, addMember bool) (*model.Board, error) {
	if board.ID != "" {
		return nil, ErrNewBoardCannotHaveID
	}
	board.ID = utils.NewID(utils.IDTypeBoard)

	var newBoard *model.Board
	var member *model.BoardMember
	var err error
	if addMember {
		newBoard, member, err = a.store.InsertBoardWithAdmin(board, userID)
	} else {
		newBoard, err = a.store.InsertBoard(board, userID)
	}

	if err != nil {
		return nil, err
	}

	a.blockChangeNotifier.Enqueue(func() error {
		a.wsAdapter.BroadcastBoardChange(newBoard.TeamID, newBoard)

		if newBoard.ChannelID != "" {
			members, err := a.GetMembersForBoard(board.ID)
			if err != nil {
				a.logger.Error("Unable to get the board members", mlog.Err(err))
			}
			for _, member := range members {
				a.wsAdapter.BroadcastMemberChange(newBoard.TeamID, member.BoardID, member)
			}
		} else if addMember {
			a.wsAdapter.BroadcastMemberChange(newBoard.TeamID, newBoard.ID, member)
		}
		return nil
	})

	if !board.IsTemplate {
		if err := a.addBoardsToDefaultCategory(userID, newBoard.TeamID, []*model.Board{newBoard}); err != nil {
			return nil, err
		}
	}

	return newBoard, nil
}

func (a *App) addBoardsToDefaultCategory(userID, teamID string, boards []*model.Board) error {
	userCategoryBoards, err := a.GetUserCategoryBoards(userID, teamID)
	if err != nil {
		return err
	}

	defaultCategoryID := ""
	for _, categoryBoard := range userCategoryBoards {
		if categoryBoard.Name == defaultCategoryBoards {
			defaultCategoryID = categoryBoard.ID
			break
		}
	}

	if defaultCategoryID == "" {
		return fmt.Errorf("%w userID: %s", errNoDefaultCategoryFound, userID)
	}

	boardIDs := make([]string, len(boards))
	for i := range boards {
		boardIDs[i] = boards[i].ID
	}

	if err := a.AddUpdateUserCategoryBoard(teamID, userID, defaultCategoryID, boardIDs); err != nil {
		return err
	}

	return nil
}

func (a *App) PatchBoard(patch *model.BoardPatch, boardID, userID string) (*model.Board, error) {
	var oldChannelID string
	var isTemplate bool
	var oldMembers []*model.BoardMember

	if patch.Type != nil || patch.ChannelID != nil {
		testChannel := ""
		if patch.ChannelID != nil && *patch.ChannelID == "" {
			var err error
			oldMembers, err = a.GetMembersForBoard(boardID)
			if err != nil {
				a.logger.Error("Unable to get the board members", mlog.Err(err))
			}
		} else if patch.ChannelID != nil && *patch.ChannelID != "" {
			testChannel = *patch.ChannelID
		}

		board, err := a.store.GetBoard(boardID)
		if model.IsErrNotFound(err) {
			return nil, model.NewErrNotFound("board ID=" + boardID)
		}
		if err != nil {
			return nil, err
		}
		oldChannelID = board.ChannelID
		isTemplate = board.IsTemplate
		if testChannel == "" {
			testChannel = oldChannelID
		}

		if testChannel != "" {
			if !a.permissions.HasPermissionToChannel(userID, testChannel, model.PermissionCreatePost) {
				return nil, model.NewErrPermission("access denied to channel")
			}
		}
	}

	updatedBoard, err := a.store.PatchBoard(boardID, patch, userID)
	if err != nil {
		return nil, err
	}

	// Post message to channel if linked/unlinked
	if patch.ChannelID != nil {
		var username string

		user, err := a.store.GetUserByID(userID)
		if err != nil {
			a.logger.Error("Unable to get the board updater", mlog.Err(err))
			username = "unknown"
		} else {
			username = user.Username
		}

		boardLink := utils.MakeBoardLink(a.config.ServerRoot, updatedBoard.TeamID, updatedBoard.ID)
		title := updatedBoard.Title
		if title == "" {
			title = "Untitled board" // todo: localize this when server has i18n
		}
		if *patch.ChannelID != "" {
			if err := a.postChannelMessage(fmt.Sprintf(linkBoardMessage, username, title, boardLink), updatedBoard.ChannelID); err != nil {
				a.logger.Error("Unable to post board link message to channel", mlog.Err(err))
			}
		} else if *patch.ChannelID == "" {
			if err := a.postChannelMessage(fmt.Sprintf(unlinkBoardMessage, username, title, boardLink), oldChannelID); err != nil {
				a.logger.Error("Unable to post board unlink message to channel", mlog.Err(err))
			}
		}
	}

	// Broadcast Messages to affected users
	a.blockChangeNotifier.Enqueue(func() error {
		a.wsAdapter.BroadcastBoardChange(updatedBoard.TeamID, updatedBoard)

		if patch.ChannelID != nil {
			if *patch.ChannelID != "" {
				members, err := a.GetMembersForBoard(updatedBoard.ID)
				if err != nil {
					a.logger.Error("Unable to get the board members", mlog.Err(err))
				}
				for _, member := range members {
					if member.Synthetic {
						a.wsAdapter.BroadcastMemberChange(updatedBoard.TeamID, member.BoardID, member)
					}
				}
			} else {
				for _, oldMember := range oldMembers {
					if oldMember.Synthetic {
						a.wsAdapter.BroadcastMemberDelete(updatedBoard.TeamID, boardID, oldMember.UserID)
					}
				}
			}
		}

		if patch.Type != nil && isTemplate {
			members, err := a.GetMembersForBoard(updatedBoard.ID)
			if err != nil {
				a.logger.Error("Unable to get the board members", mlog.Err(err))
			}
			a.broadcastTeamUsers(updatedBoard.TeamID, updatedBoard.ID, *patch.Type, members)
		}
		return nil
	})

	return updatedBoard, nil
}

func (a *App) postChannelMessage(message, channelID string) error {
	err := a.store.PostMessage(message, "", channelID)
	if err != nil {
		a.logger.Error("Unable to post the link message to channel", mlog.Err(err))
		return err
	}
	return nil
}

// SendCardNotification triggers subscription-based diff notifications.
// This is used by auto-notify flows (e.g. card close after edits).
func (a *App) SendCardNotification(boardID, userID, cardID string) error {
	board, err := a.GetBoard(boardID)
	if err != nil {
		return err
	}

	if board.ChannelID == "" {
		return errBoardNotLinkedToChannel
	}

	card, err := a.GetCardByID(cardID)
	if err != nil {
		return err
	}
	if card.BoardID != boardID {
		return model.NewErrBadRequest("card does not belong to board")
	}

	if a.subscriptionsBackend == nil {
		return errSubscriptionsUnavailable
	}
	if err := a.subscriptionsBackend.ForceNotifyBlock(cardID, userID, model.TypeCard); err != nil {
		a.logger.Error("Failed to force notify block", mlog.Err(err))
		return fmt.Errorf("failed to send subscription notification: %w", err)
	}

	return nil
}

// SendCardShareNotification posts an explicit channel share message for a card.
// This is used only by user-initiated share actions.
func (a *App) SendCardShareNotification(boardID, userID, cardID string) error {
	board, err := a.GetBoard(boardID)
	if err != nil {
		return err
	}

	if board.ChannelID == "" {
		return errBoardNotLinkedToChannel
	}

	card, err := a.GetCardByID(cardID)
	if err != nil {
		return err
	}
	if card.BoardID != boardID {
		return model.NewErrBadRequest("card does not belong to board")
	}

	user, err := a.store.GetUserByID(userID)
	if err != nil {
		return err
	}

	boardTitle := board.Title
	if boardTitle == "" {
		boardTitle = "제목 없음"
	}
	cardTitle := card.Title
	if cardTitle == "" {
		cardTitle = "제목 없음"
	}

	cardLink := utils.MakeCardLink(a.config.ServerRoot, board.TeamID, board.ID, card.ID)
	boardLink := utils.MakeBoardLink(a.config.ServerRoot, board.TeamID, board.ID)
	message := fmt.Sprintf(shareCardMessage, user.Username, cardTitle, cardLink, boardTitle, boardLink)
	if err = a.postChannelMessage(message, board.ChannelID); err != nil {
		return fmt.Errorf("unable to send card share message: %w", err)
	}

	return nil
}

// broadcastTeamUsers notifies the members of a team when a template changes its type
// from public to private or viceversa.
func (a *App) broadcastTeamUsers(teamID, boardID string, boardType model.BoardType, members []*model.BoardMember) {
	users, err := a.GetTeamUsers(teamID, "")
	if err != nil {
		a.logger.Error("Unable to get the team users", mlog.Err(err))
	}
	for _, user := range users {
		isMember := false
		for _, member := range members {
			if member.UserID == user.ID {
				isMember = true
				break
			}
		}
		if !isMember {
			if boardType == model.BoardTypePrivate {
				a.wsAdapter.BroadcastMemberDelete(teamID, boardID, user.ID)
			} else if boardType == model.BoardTypeOpen {
				a.wsAdapter.BroadcastMemberChange(teamID, boardID, &model.BoardMember{UserID: user.ID, BoardID: boardID, SchemeViewer: true, Synthetic: true})
			}
		}
	}
}

func (a *App) DeleteBoard(boardID, userID string) error {
	board, err := a.store.GetBoard(boardID)
	if model.IsErrNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}

	if err := a.store.DeleteBoard(boardID, userID); err != nil {
		return err
	}

	a.blockChangeNotifier.Enqueue(func() error {
		a.wsAdapter.BroadcastBoardDelete(board.TeamID, boardID)
		return nil
	})

	return nil
}

func (a *App) GetMembersForBoard(boardID string) ([]*model.BoardMember, error) {
	members, err := a.store.GetMembersForBoard(boardID)
	if err != nil {
		return nil, err
	}

	board, err := a.store.GetBoard(boardID)
	if err != nil && !model.IsErrNotFound(err) {
		return nil, err
	}
	if board != nil {
		for i, m := range members {
			if !m.SchemeAdmin {
				if a.permissions.HasPermissionToTeam(m.UserID, board.TeamID, model.PermissionManageTeam) {
					members[i].SchemeAdmin = true
				}
			}
		}
	}
	return members, nil
}

func (a *App) GetMembersForUser(userID string) ([]*model.BoardMember, error) {
	members, err := a.store.GetMembersForUser(userID)
	if err != nil {
		return nil, err
	}

	for i, m := range members {
		if !m.SchemeAdmin {
			board, err := a.store.GetBoard(m.BoardID)
			if err != nil && !model.IsErrNotFound(err) {
				return nil, err
			}
			if board != nil {
				if a.permissions.HasPermissionToTeam(m.UserID, board.TeamID, model.PermissionManageTeam) {
					// if system/team admin
					members[i].SchemeAdmin = true
				}
			}
		}
	}
	return members, nil
}

func (a *App) GetMemberForBoard(boardID string, userID string) (*model.BoardMember, error) {
	return a.store.GetMemberForBoard(boardID, userID)
}

func (a *App) AddMemberToBoard(member *model.BoardMember) (*model.BoardMember, error) {
	board, err := a.store.GetBoard(member.BoardID)
	if model.IsErrNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	existingMembership, err := a.store.GetMemberForBoard(member.BoardID, member.UserID)
	if err != nil && !model.IsErrNotFound(err) {
		return nil, err
	}

	if existingMembership != nil && !existingMembership.Synthetic {
		return existingMembership, nil
	}

	newMember, err := a.store.SaveMember(member)
	if err != nil {
		return nil, err
	}

	if !newMember.SchemeAdmin {
		if board != nil {
			if a.permissions.HasPermissionToTeam(newMember.UserID, board.TeamID, model.PermissionManageTeam) {
				newMember.SchemeAdmin = true
			}
		}
	}

	if !board.IsTemplate {
		if err = a.addBoardsToDefaultCategory(member.UserID, board.TeamID, []*model.Board{board}); err != nil {
			return nil, err
		}
	}

	a.blockChangeNotifier.Enqueue(func() error {
		a.wsAdapter.BroadcastMemberChange(board.TeamID, member.BoardID, member)
		return nil
	})

	return newMember, nil
}

func (a *App) UpdateBoardMember(member *model.BoardMember) (*model.BoardMember, error) {
	board, bErr := a.store.GetBoard(member.BoardID)
	if model.IsErrNotFound(bErr) {
		return nil, nil
	}
	if bErr != nil {
		return nil, bErr
	}

	oldMember, err := a.store.GetMemberForBoard(member.BoardID, member.UserID)
	if model.IsErrNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	// if we're updating an admin, we need to check that there is at
	// least still another admin on the board
	if oldMember.SchemeAdmin && !member.SchemeAdmin {
		isLastAdmin, err2 := a.isLastAdmin(member.UserID, member.BoardID)
		if err2 != nil {
			return nil, err2
		}
		if isLastAdmin {
			return nil, model.ErrBoardMemberIsLastAdmin
		}
	}

	newMember, err := a.store.SaveMember(member)
	if err != nil {
		return nil, err
	}

	a.blockChangeNotifier.Enqueue(func() error {
		a.wsAdapter.BroadcastMemberChange(board.TeamID, member.BoardID, member)
		return nil
	})

	return newMember, nil
}

func (a *App) isLastAdmin(userID, boardID string) (bool, error) {
	members, err := a.store.GetMembersForBoard(boardID)
	if err != nil {
		return false, err
	}

	for _, m := range members {
		if m.SchemeAdmin && m.UserID != userID {
			return false, nil
		}
	}
	return true, nil
}

func (a *App) DeleteBoardMember(boardID, userID string) error {
	board, bErr := a.store.GetBoard(boardID)
	if model.IsErrNotFound(bErr) {
		return nil
	}
	if bErr != nil {
		return bErr
	}

	oldMember, err := a.store.GetMemberForBoard(boardID, userID)
	if model.IsErrNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}

	// if we're removing an admin, we need to check that there is at
	// least still another admin on the board
	if oldMember.SchemeAdmin {
		isLastAdmin, err := a.isLastAdmin(userID, boardID)
		if err != nil {
			return err
		}
		if isLastAdmin {
			return model.ErrBoardMemberIsLastAdmin
		}
	}

	if err := a.store.DeleteMember(boardID, userID); err != nil {
		return err
	}

	a.blockChangeNotifier.Enqueue(func() error {
		if syntheticMember, _ := a.GetMemberForBoard(boardID, userID); syntheticMember != nil {
			a.wsAdapter.BroadcastMemberChange(board.TeamID, boardID, syntheticMember)
		} else {
			a.wsAdapter.BroadcastMemberDelete(board.TeamID, boardID, userID)
		}
		return nil
	})

	return nil
}

func (a *App) SearchBoardsForUser(term string, searchField model.BoardSearchField, userID string, includePublicBoards bool) ([]*model.Board, error) {
	baseBoards, err := a.store.SearchBoardsForUser(term, searchField, userID, includePublicBoards)
	if err != nil {
		return nil, err
	}
	if !includePublicBoards {
		return baseBoards, nil
	}
	return a.expandBoardsWithACLAndFullVisibility(userID, "", baseBoards, term, func(onlyWithACL bool) ([]*model.Board, error) {
		return a.store.GetBoardsInUserTeams(userID, onlyWithACL)
	})
}

func (a *App) SearchBoardsForUserInTeam(teamID, term, userID string) ([]*model.Board, error) {
	baseBoards, err := a.store.SearchBoardsForUserInTeam(teamID, term, userID)
	if err != nil {
		return nil, err
	}
	return a.expandBoardsWithACLAndFullVisibility(userID, teamID, baseBoards, term, func(onlyWithACL bool) ([]*model.Board, error) {
		return a.store.GetBoardsInTeam(teamID, onlyWithACL)
	})
}

func (a *App) UndeleteBoard(boardID string, modifiedBy string) error {
	boards, err := a.store.GetBoardHistory(boardID, model.QueryBoardHistoryOptions{Limit: 1, Descending: true})
	if err != nil {
		return err
	}

	if len(boards) == 0 {
		// undeleting non-existing board not considered an error
		return nil
	}

	err = a.store.UndeleteBoard(boardID, modifiedBy)
	if err != nil {
		return err
	}

	board, err := a.store.GetBoard(boardID)
	if err != nil {
		return err
	}

	if board == nil {
		a.logger.Error("Error loading the board after undelete, not propagating through websockets or notifications")
		return nil
	}

	a.blockChangeNotifier.Enqueue(func() error {
		a.wsAdapter.BroadcastBoardChange(board.TeamID, board)
		return nil
	})

	return nil
}
