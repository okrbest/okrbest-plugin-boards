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
		expected   BoardPermissionCapabilities
	}{
		{
			name:       "none",
			permission: EffectiveBoardPermissionNone,
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
			require.Equal(t, tt.expected, BuildCapabilities(tt.permission))
		})
	}
}
