// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// The ladder a board follows when it is used as an OKR board. The rule lives in
// two languages — Go for sub-cards, TypeScript for the cards the browser makes —
// so both sides are held to the same table.
func TestOkrBoardSettingsFromProperties(t *testing.T) {
	t.Run("a board that was never switched on has no settings", func(t *testing.T) {
		settings, err := OkrBoardSettingsFromProperties(map[string]interface{}{})

		require.NoError(t, err)
		require.Nil(t, settings)
	})

	t.Run("reads what a board stored", func(t *testing.T) {
		properties := map[string]interface{}{
			OkrBoardKey: map[string]interface{}{
				"propertyId": "prop-type",
				"levels":     []interface{}{"opt-objective", "opt-key-result", "opt-task"},
			},
		}

		settings, err := OkrBoardSettingsFromProperties(properties)

		require.NoError(t, err)
		require.NotNil(t, settings)
		require.Equal(t, "prop-type", settings.PropertyID)
		require.Equal(t, []string{"opt-objective", "opt-key-result", "opt-task"}, settings.Levels)
	})

	t.Run("leaves keys other features own alone", func(t *testing.T) {
		properties := map[string]interface{}{
			PropertyAccessKey: map[string]interface{}{"enabled": true},
			OkrBoardKey: map[string]interface{}{
				"propertyId": "prop-type",
				"levels":     []interface{}{"opt-objective"},
			},
		}

		settings, err := OkrBoardSettingsFromProperties(properties)

		require.NoError(t, err)
		require.Equal(t, "prop-type", settings.PropertyID)
	})

	t.Run("a stored value that is not a settings object is a bad request", func(t *testing.T) {
		_, err := OkrBoardSettingsFromProperties(map[string]interface{}{OkrBoardKey: "on"})

		require.Error(t, err)
	})
}

func TestOkrBoardSettingsOptionForDepth(t *testing.T) {
	settings := &OkrBoardSettings{
		PropertyID: "prop-type",
		Levels:     []string{"opt-objective", "opt-key-result", "opt-task"},
	}

	t.Run("each depth takes its own level", func(t *testing.T) {
		require.Equal(t, "opt-objective", settings.OptionForDepth(0))
		require.Equal(t, "opt-key-result", settings.OptionForDepth(1))
		require.Equal(t, "opt-task", settings.OptionForDepth(2))
	})

	t.Run("past the end takes the last level", func(t *testing.T) {
		// 3단계 and deeper share one value, so the shape does not have to know
		// how deep cards are allowed to go.
		require.Equal(t, "opt-task", settings.OptionForDepth(3))
		require.Equal(t, "opt-task", settings.OptionForDepth(4))
	})

	t.Run("a negative depth is not a level", func(t *testing.T) {
		require.Equal(t, "", settings.OptionForDepth(-1))
	})

	t.Run("settings with no levels fill nothing", func(t *testing.T) {
		empty := &OkrBoardSettings{PropertyID: "prop-type"}

		require.Equal(t, "", empty.OptionForDepth(0))
	})

	t.Run("no settings fill nothing", func(t *testing.T) {
		var missing *OkrBoardSettings

		require.Equal(t, "", missing.OptionForDepth(0))
	})
}
