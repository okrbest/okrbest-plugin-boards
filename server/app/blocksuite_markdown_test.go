// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"encoding/json"
	"testing"

	"github.com/mattermost/mattermost-plugin-boards/server/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// noteChildren walks the document shell and returns the content blocks that the
// editor renders, failing the test if the shell is not the expected shape.
func noteChildren(t *testing.T, snapshot *DocSnapshot) []BlockSnapshot {
	t.Helper()

	require.Equal(t, "page", snapshot.Type)
	require.Equal(t, "affine:page", snapshot.Blocks.Flavour)
	require.Len(t, snapshot.Blocks.Children, 2, "page holds surface + note")

	surface := snapshot.Blocks.Children[0]
	note := snapshot.Blocks.Children[1]
	require.Equal(t, "affine:surface", surface.Flavour)
	require.Equal(t, "affine:note", note.Flavour)

	return note.Children
}

func paragraphText(t *testing.T, block BlockSnapshot) string {
	t.Helper()

	text, ok := block.Props["text"].(BlockSuiteText)
	require.True(t, ok, "block %s carries text props", block.ID)

	out := ""
	for _, delta := range text.Delta {
		out += delta.Insert
	}
	return out
}

func TestBuildDocSnapshotFromMarkdown(t *testing.T) {
	card := &model.Block{ID: "card-id", Title: "카드 제목", CreateAt: 1234}

	t.Run("빈 본문도 문단 하나를 남긴다", func(t *testing.T) {
		snapshot := buildDocSnapshot(card, parseMultilineMarkdown("", "base"), nil)

		children := noteChildren(t, snapshot)
		require.Len(t, children, 1)
		assert.Equal(t, "affine:paragraph", children[0].Flavour)
		assert.Equal(t, "", paragraphText(t, children[0]))
	})

	t.Run("여러 줄은 줄마다 블록이 된다", func(t *testing.T) {
		snapshot := buildDocSnapshot(card, parseMultilineMarkdown("첫 줄\n둘째 줄\n셋째 줄", "base"), nil)

		children := noteChildren(t, snapshot)
		require.Len(t, children, 3)
		assert.Equal(t, "첫 줄", paragraphText(t, children[0]))
		assert.Equal(t, "둘째 줄", paragraphText(t, children[1]))
		assert.Equal(t, "셋째 줄", paragraphText(t, children[2]))
	})

	t.Run("마크다운 머리글·목록은 해당 블록으로 변환된다", func(t *testing.T) {
		snapshot := buildDocSnapshot(card, parseMultilineMarkdown("# 제목\n본문\n- 항목", "base"), nil)

		children := noteChildren(t, snapshot)
		require.Len(t, children, 3)
		assert.Equal(t, "h1", children[0].Props["type"])
		assert.Equal(t, "affine:paragraph", children[1].Flavour)
		assert.Equal(t, "affine:list", children[2].Flavour)
	})

	t.Run("표식 줄은 본문 마지막 블록으로 남는다", func(t *testing.T) {
		marker := "-- Agent Bot 경유 등록"
		snapshot := buildDocSnapshot(card, parseMultilineMarkdown("본문입니다\n"+marker, "base"), nil)

		children := noteChildren(t, snapshot)
		require.NotEmpty(t, children)
		assert.Equal(t, marker, paragraphText(t, children[len(children)-1]))
	})

	t.Run("메타·페이지 제목은 카드에서 온다", func(t *testing.T) {
		snapshot := buildDocSnapshot(card, parseMultilineMarkdown("본문", "base"), nil)

		assert.Equal(t, "card-id", snapshot.Meta.ID)
		assert.Equal(t, "카드 제목", snapshot.Meta.Title)
		assert.Equal(t, int64(1234), snapshot.Meta.CreateDate)
		assert.Equal(t, "page:card-id", snapshot.Blocks.ID)
	})

	t.Run("블록 ID는 서로 다르다", func(t *testing.T) {
		snapshot := buildDocSnapshot(card, parseMultilineMarkdown("한 줄\n두 줄\n세 줄", "base"), nil)

		seen := map[string]bool{}
		for _, child := range noteChildren(t, snapshot) {
			assert.False(t, seen[child.ID], "중복 블록 ID: %s", child.ID)
			seen[child.ID] = true
		}
	})
}

func TestConvertMarkdownToDocSnapshot(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	card := &model.Block{ID: "card-id", Title: "카드 제목", CreateAt: 1234}

	t.Run("카드를 찾으면 DocSnapshot JSON을 돌려준다", func(t *testing.T) {
		th.Store.EXPECT().GetBlock("card-id").Return(card, nil)

		data, err := th.App.ConvertMarkdownToDocSnapshot("card-id", "본문입니다")
		require.NoError(t, err)

		var snapshot DocSnapshot
		require.NoError(t, json.Unmarshal(data, &snapshot))
		assert.Equal(t, "page", snapshot.Type)
		assert.Equal(t, "카드 제목", snapshot.Meta.Title)
	})

	t.Run("카드가 없으면 에러", func(t *testing.T) {
		th.Store.EXPECT().GetBlock("없는-카드").Return(nil, model.NewErrNotFound("없는-카드"))

		_, err := th.App.ConvertMarkdownToDocSnapshot("없는-카드", "본문")
		assert.Error(t, err)
	})
}
