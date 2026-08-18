// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCardPropertiesAdminOnly(t *testing.T) {
	t.Run("정한 적 없는 보드는 잠기지 않는다", func(t *testing.T) {
		require.False(t, CardPropertiesAdminOnly(nil))
		require.False(t, CardPropertiesAdminOnly(map[string]interface{}{}))
	})

	t.Run("스위치는 양쪽으로 읽힌다", func(t *testing.T) {
		require.True(t, CardPropertiesAdminOnly(map[string]interface{}{AdminOnlyCardPropertiesKey: true}))
		require.False(t, CardPropertiesAdminOnly(map[string]interface{}{AdminOnlyCardPropertiesKey: false}))
	})

	t.Run("스위치가 아닌 값은 꺼짐으로 읽는다", func(t *testing.T) {
		// board.properties는 다른 기능도 함께 쓰는 자유 형식이다. 반쯤 이해한 값을
		// "잠김"으로 읽으면 아무도 잠그지 않은 보드에서 속성 편집이 사라진다.
		for _, stored := range []interface{}{"true", "false", 1, 0, nil, map[string]interface{}{}, []interface{}{true}} {
			require.False(t, CardPropertiesAdminOnly(map[string]interface{}{AdminOnlyCardPropertiesKey: stored}),
				"저장값 %#v", stored)
		}
	})
}
