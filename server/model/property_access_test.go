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

func TestPropertyAccessPermissionLadder(t *testing.T) {
	require.Equal(t, EffectiveBoardPermissionView, PropertyAccessViewer.AsEffectivePermission())
	require.Equal(t, EffectiveBoardPermissionCommenter, PropertyAccessCommenter.AsEffectivePermission())
	require.Equal(t, EffectiveBoardPermissionEdit, PropertyAccessEditor.AsEffectivePermission())
	require.Equal(t, EffectiveBoardPermissionNone, PropertyAccessPermission("manage").AsEffectivePermission(),
		"rules can never grant manage")
}
