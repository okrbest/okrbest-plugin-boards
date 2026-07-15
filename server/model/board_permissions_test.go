// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEffectivePermissionRank(t *testing.T) {
	require.Equal(t, 0, EffectivePermissionRank(EffectiveBoardPermissionNone))
	require.Equal(t, 1, EffectivePermissionRank(EffectiveBoardPermissionView))
	require.Equal(t, 2, EffectivePermissionRank(EffectiveBoardPermissionCommenter))
	require.Equal(t, 3, EffectivePermissionRank(EffectiveBoardPermissionEdit))
	require.Equal(t, 4, EffectivePermissionRank(EffectiveBoardPermissionManage))
	require.Equal(t, 4, EffectivePermissionRank(EffectiveBoardPermissionDelete))
}

func TestBuildCapabilities(t *testing.T) {
	tests := []struct {
		name       string
		permission EffectiveBoardPermission
		isOwner    bool
		expected   BoardPermissionCapabilities
	}{
		{
			name:       "none",
			permission: EffectiveBoardPermissionNone,
			isOwner:    false,
			expected: BoardPermissionCapabilities{
				CanView:        false,
				CanCommentCard: false,
				CanCreateCard:  false,
				CanEditCard:    false,
				CanDeleteCard:  false,
				CanManageBoard: false,
				CanDeleteBoard: false,
			},
		},
		{
			name:       "commenter",
			permission: EffectiveBoardPermissionCommenter,
			isOwner:    false,
			expected: BoardPermissionCapabilities{
				CanView:        true,
				CanCommentCard: true,
				CanCreateCard:  false,
				CanEditCard:    false,
				CanDeleteCard:  false,
				CanManageBoard: false,
				CanDeleteBoard: false,
			},
		},
		{
			name:       "edit",
			permission: EffectiveBoardPermissionEdit,
			isOwner:    false,
			expected: BoardPermissionCapabilities{
				CanView:        true,
				CanCommentCard: true,
				CanCreateCard:  true,
				CanEditCard:    true,
				CanDeleteCard:  true,
				CanManageBoard: false,
				CanDeleteBoard: false,
			},
		},
		{
			name:       "manage",
			permission: EffectiveBoardPermissionManage,
			isOwner:    false,
			expected: BoardPermissionCapabilities{
				CanView:        true,
				CanCommentCard: true,
				CanCreateCard:  true,
				CanEditCard:    true,
				CanDeleteCard:  true,
				CanManageBoard: true,
				CanDeleteBoard: false,
			},
		},
		{
			name:       "owner manage",
			permission: EffectiveBoardPermissionManage,
			isOwner:    true,
			expected: BoardPermissionCapabilities{
				CanView:        true,
				CanCommentCard: true,
				CanCreateCard:  true,
				CanEditCard:    true,
				CanDeleteCard:  true,
				CanManageBoard: true,
				CanDeleteBoard: true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.expected, BuildCapabilities(tt.permission, tt.isOwner))
		})
	}
}

func TestParseBoardACLFromProperties(t *testing.T) {
	props := map[string]interface{}{
		BoardACLPropertyKey: []map[string]interface{}{
			{
				"id":          "entry-1",
				"subjectType": "user",
				"subjectId":   "user-1",
				"permission":  "manage",
			},
		},
	}

	entries, err := ParseBoardACLFromProperties(props)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.Equal(t, "entry-1", entries[0].ID)
	require.Equal(t, BoardACLSubjectUser, entries[0].SubjectType)
	require.Equal(t, "user-1", entries[0].SubjectID)
	require.Equal(t, EffectiveBoardPermissionManage, entries[0].Permission)
}
