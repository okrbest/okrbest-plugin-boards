// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// UserOrgProfile mirrors the team-scoped org context maintained by the
// main server and used for board ACL/CEO permission evaluation.
type UserOrgProfile struct {
	TeamID            string
	UserID            string
	PrimaryOrgUnitID  string
	PrimaryPositionID string
	ExtraPositions    []string
}
