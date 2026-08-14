// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import "encoding/json"

// OkrBoardKey is the board properties key that marks a board as an OKR board.
// See specs/008-okr-board-mode/data-model.md.
const OkrBoardKey = "okrBoard"

// OkrBoardSettings is what a board remembers once it is used as an OKR board:
// which property carries the rung, and which option means which rung.
//
// Levels holds option IDs rather than names. A user may rename Tasks to 할 일 at
// any time — the values are an ordinary select property once created — and the
// ladder has to survive it.
//
// Depth indexes Levels and anything past the end takes the last entry, so 3단계
// and deeper share one value without this shape having to know how deep cards
// are allowed to go.
type OkrBoardSettings struct {
	PropertyID string   `json:"propertyId"`
	Levels     []string `json:"levels"`
}

// OptionForDepth is the option a card at this depth starts with.
//
// An empty string means "fill nothing" and covers every way this can come up
// nothing: a board that was never switched on, settings whose levels were never
// written, and a depth that is not a rung.
func (s *OkrBoardSettings) OptionForDepth(depth int) string {
	if s == nil || depth < 0 || len(s.Levels) == 0 {
		return ""
	}

	if depth >= len(s.Levels) {
		return s.Levels[len(s.Levels)-1]
	}
	return s.Levels[depth]
}

// OkrBoardSettingsFromProperties reads the OKR settings out of a board's
// properties bag.
//
// Board.Properties is an untyped map that round trips through the database as
// JSON, so the stored value arrives as a generic map. Re-encoding is the
// cheapest way to get a typed value back without hand walking the map — the
// same route PropertyAccessSettingsFromProperties takes.
//
// A board with no settings is not an error: it returns nil, and every caller
// treats that exactly like a switch that was never turned on.
func OkrBoardSettingsFromProperties(properties map[string]interface{}) (*OkrBoardSettings, error) {
	raw, ok := properties[OkrBoardKey]
	if !ok || raw == nil {
		return nil, nil
	}

	if settings, ok := raw.(*OkrBoardSettings); ok {
		return settings, nil
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, NewErrBadRequest("invalid okrBoard: " + err.Error())
	}

	settings := &OkrBoardSettings{}
	if err := json.Unmarshal(encoded, settings); err != nil {
		return nil, NewErrBadRequest("invalid okrBoard: " + err.Error())
	}

	return settings, nil
}
