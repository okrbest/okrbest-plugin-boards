// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func sampleSettings() *PropertyAccessSettings {
	return &PropertyAccessSettings{
		Enabled:   true,
		UpdatedBy: "user-1",
		UpdatedAt: 1767225600000,
		Rules: []PropertyAccessRule{{
			ID:              "r1",
			PropertyID:      "prop-clevel",
			PropertyValueID: "opt-strategy",
			DivisionID:      "div-strategy",
			DutyID:          "duty-head",
			Permission:      PropertyAccessEditor,
		}},
	}
}

func TestPropertyAccessSettingsRoundTrip(t *testing.T) {
	value, err := sampleSettings().AsProperty()
	require.NoError(t, err)

	parsed, err := PropertyAccessSettingsFromProperties(map[string]interface{}{PropertyAccessKey: value})
	require.NoError(t, err)
	require.NotNil(t, parsed)
	require.Equal(t, sampleSettings(), parsed)
}

// FR-012. Duplicating a board or turning it into a template copies the whole
// properties document, so the rules travel with it and need no separate
// handling. What this asserts is the part that could silently break: that the
// stored shape survives the JSON encode and decode a copy goes through.
func TestPropertyAccessSettingsSurviveBoardCopy(t *testing.T) {
	value, err := sampleSettings().AsProperty()
	require.NoError(t, err)

	original := &Board{ID: "board-1", TeamID: "team-1", Properties: map[string]interface{}{
		PropertyAccessKey: value,
		"theme":           "dark",
	}}

	encoded, err := json.Marshal(original)
	require.NoError(t, err)

	copied := &Board{}
	require.NoError(t, json.Unmarshal(encoded, copied))

	parsed, err := PropertyAccessSettingsFromProperties(copied.Properties)
	require.NoError(t, err)
	require.Equal(t, sampleSettings(), parsed)
	require.Equal(t, "dark", copied.Properties["theme"])
}

func TestPropertyAccessSettingsFromPropertiesTolerance(t *testing.T) {
	t.Run("a board that never had rules is not an error", func(t *testing.T) {
		parsed, err := PropertyAccessSettingsFromProperties(map[string]interface{}{})
		require.NoError(t, err)
		require.Nil(t, parsed)
	})

	t.Run("an explicit null is treated the same way", func(t *testing.T) {
		parsed, err := PropertyAccessSettingsFromProperties(map[string]interface{}{PropertyAccessKey: nil})
		require.NoError(t, err)
		require.Nil(t, parsed)
	})

	t.Run("a value of the wrong shape is rejected, not guessed at", func(t *testing.T) {
		_, err := PropertyAccessSettingsFromProperties(map[string]interface{}{PropertyAccessKey: "not an object"})
		require.Error(t, err)
	})
}

func TestPropertyAccessSettingsAsPropertyNormalizesRules(t *testing.T) {
	settings := &PropertyAccessSettings{Enabled: false}

	value, err := settings.AsProperty()
	require.NoError(t, err)

	require.Equal(t, []interface{}{}, value["rules"],
		"a nil slice would store as null and read back differently than an empty one")
}

func TestPropertyAccessRuleHasOrgCondition(t *testing.T) {
	require.True(t, PropertyAccessRule{DivisionID: "d"}.HasOrgCondition())
	require.True(t, PropertyAccessRule{DepartmentID: "d"}.HasOrgCondition())
	require.False(t, PropertyAccessRule{DutyID: "duty"}.HasOrgCondition(),
		"a duty is additive, never a gate (FR-018)")
	require.False(t, PropertyAccessRule{}.HasOrgCondition())
}

// 009 계약 3절 — 새 필드와 기존 필드가 겹치는 자리. 읽는 쪽이 새 필드를 먼저 보고
// 없으면 기존 필드로 떨어진다. 기존 보드는 새 필드가 비어 있어 지금과 똑같이 읽힌다.
func TestPropertyAccessRuleCardValueIDs(t *testing.T) {
	t.Run("3-1 새 필드가 빈 기존 규칙은 한 값짜리를 쓴다", func(t *testing.T) {
		rule := PropertyAccessRule{PropertyValueID: "opt-objective"}

		require.Equal(t, []string{"opt-objective"}, rule.CardValueIDs())
	})

	t.Run("3-4 새 필드가 있으면 그것을 쓴다", func(t *testing.T) {
		rule := PropertyAccessRule{
			PropertyValueID:  "opt-objective",
			PropertyValueIDs: []string{"opt-objective", "opt-key-result"},
		}

		require.Equal(t, []string{"opt-objective", "opt-key-result"}, rule.CardValueIDs(),
			"둘 다 있으면 목록이 이긴다")
	})

	t.Run("둘 다 비면 아무 값도 없다", func(t *testing.T) {
		require.Empty(t, PropertyAccessRule{}.CardValueIDs())
	})
}

func TestPropertyAccessRuleRelationOutranksAbsoluteOrg(t *testing.T) {
	t.Run("3-2 관계가 있으면 절대값을 무시한다", func(t *testing.T) {
		rule := PropertyAccessRule{Relation: RelationSameDivision, DivisionID: "div-strategy"}

		require.True(t, rule.UsesRelation())
		require.True(t, rule.HasOrgCondition(),
			"관계도 조직 조건이다 — 게이트로 세어야 매트릭스의 빈칸이 빈칸으로 남는다")
	})

	t.Run("관계가 비면 절대값으로 읽는다", func(t *testing.T) {
		rule := PropertyAccessRule{DivisionID: "div-strategy"}

		require.False(t, rule.UsesRelation())
		require.True(t, rule.HasOrgCondition())
	})

	t.Run("relation=any도 조직 조건으로 센다", func(t *testing.T) {
		// 매트릭스의 대표 열이 여기 해당한다. 조직을 안 따지지만 관계를 쓴다.
		rule := PropertyAccessRule{Relation: RelationAny}

		require.True(t, rule.UsesRelation())
		require.True(t, rule.HasOrgCondition())
	})
}

func TestPropertyAccessPermissionLadder(t *testing.T) {
	require.Equal(t, EffectiveBoardPermissionView, PropertyAccessViewer.AsEffectivePermission())
	require.Equal(t, EffectiveBoardPermissionCommenter, PropertyAccessCommenter.AsEffectivePermission())
	require.Equal(t, EffectiveBoardPermissionEdit, PropertyAccessEditor.AsEffectivePermission())
	require.Equal(t, EffectiveBoardPermissionNone, PropertyAccessPermission("manage").AsEffectivePermission(),
		"rules can never grant manage")
}
