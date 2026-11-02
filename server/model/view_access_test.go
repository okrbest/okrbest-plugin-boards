// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func viewWithAccess(stored interface{}, createdBy string) *Block {
	fields := map[string]interface{}{}
	if stored != nil {
		fields[ViewAccessModeKey] = stored
	}
	return &Block{ID: "view-1", BoardID: "board-1", Type: TypeView, CreatedBy: createdBy, Fields: fields}
}

func TestViewAccessModeOf(t *testing.T) {
	t.Run("정한 적 없는 뷰는 공용이다", func(t *testing.T) {
		require.Equal(t, ViewAccessEveryone, ViewAccessModeOf(&Block{Type: TypeView}))
		require.Equal(t, ViewAccessEveryone, ViewAccessModeOf(&Block{Type: TypeView, Fields: map[string]interface{}{}}))
		require.Equal(t, ViewAccessEveryone, ViewAccessModeOf(nil))
	})

	t.Run("세 값은 그대로 읽힌다", func(t *testing.T) {
		require.Equal(t, ViewAccessEveryone, ViewAccessModeOf(viewWithAccess("everyone", "")))
		require.Equal(t, ViewAccessAdmin, ViewAccessModeOf(viewWithAccess("admin", "")))
		require.Equal(t, ViewAccessPrivate, ViewAccessModeOf(viewWithAccess("private", "")))
	})

	t.Run("세 값이 아닌 것은 공용으로 읽는다", func(t *testing.T) {
		// 반쯤 이해한 값을 잠금이나 숨김으로 읽으면 아무도 잠그지 않은 뷰가 잠긴다.
		for _, stored := range []interface{}{"locked", "ADMIN", "", 1, true, map[string]interface{}{}, []interface{}{"admin"}} {
			require.Equal(t, ViewAccessEveryone, ViewAccessModeOf(viewWithAccess(stored, "")), "저장값 %#v", stored)
		}
	})
}

func TestViewHiddenFrom(t *testing.T) {
	t.Run("뷰가 아니면 숨기지 않는다", func(t *testing.T) {
		card := &Block{Type: TypeCard, CreatedBy: "alice", Fields: map[string]interface{}{ViewAccessModeKey: "private"}}
		require.False(t, ViewHiddenFrom(card, "bob"))
		require.False(t, ViewHiddenFrom(nil, "bob"))
	})

	t.Run("개인 뷰는 만든 사람에게만 보인다", func(t *testing.T) {
		private := viewWithAccess("private", "alice")
		require.False(t, ViewHiddenFrom(private, "alice"))
		require.True(t, ViewHiddenFrom(private, "bob"))
		require.True(t, ViewHiddenFrom(private, ""))
	})

	t.Run("공용과 관리자 뷰는 누구에게도 숨기지 않는다", func(t *testing.T) {
		require.False(t, ViewHiddenFrom(viewWithAccess("admin", "alice"), "bob"))
		require.False(t, ViewHiddenFrom(viewWithAccess(nil, "alice"), "bob"))
	})
}

func TestIsCardOrderOnlyPatch(t *testing.T) {
	order := []interface{}{"card-1", "card-2"}

	t.Run("cardOrder 하나만 바꾸면 참이다", func(t *testing.T) {
		require.True(t, IsCardOrderOnlyPatch(&BlockPatch{UpdatedFields: map[string]interface{}{"cardOrder": order}}))
	})

	t.Run("다른 필드가 섞이면 거짓이다", func(t *testing.T) {
		require.False(t, IsCardOrderOnlyPatch(&BlockPatch{UpdatedFields: map[string]interface{}{"cardOrder": order, "sortOptions": []interface{}{}}}))
		require.False(t, IsCardOrderOnlyPatch(&BlockPatch{UpdatedFields: map[string]interface{}{"filter": map[string]interface{}{}}}))
	})

	t.Run("제목이나 삭제 필드가 동반되면 거짓이다", func(t *testing.T) {
		title := "renamed"
		require.False(t, IsCardOrderOnlyPatch(&BlockPatch{Title: &title, UpdatedFields: map[string]interface{}{"cardOrder": order}}))
		require.False(t, IsCardOrderOnlyPatch(&BlockPatch{UpdatedFields: map[string]interface{}{"cardOrder": order}, DeletedFields: []string{"filter"}}))
	})

	t.Run("빈 patch는 거짓이다", func(t *testing.T) {
		require.False(t, IsCardOrderOnlyPatch(&BlockPatch{}))
		require.False(t, IsCardOrderOnlyPatch(nil))
	})
}
