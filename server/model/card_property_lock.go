// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// AdminOnlyCardPropertiesKey is the board properties key that says only a board
// admin may change what the board records — a property's name, type, required
// flag, or the options a select offers.
//
// It sits beside propertyAccess, okrBoard and orgColors under board.properties,
// and like them it is absent on every board that never turned it on.
const AdminOnlyCardPropertiesKey = "adminOnlyCardProperties"

// CardPropertiesAdminOnly reports whether this board locked its property editor.
//
// Off is the answer for everything that is not the switch turned on: a board
// that never set it, and a stored value that is not a boolean. board.properties
// is free form JSON that other features write to as well, and reading a half
// understood value as "locked" would take the property editor away from a board
// nobody meant to lock. okrBoardSettings reads a broken value the same way.
func CardPropertiesAdminOnly(properties map[string]interface{}) bool {
	locked, ok := properties[AdminOnlyCardPropertiesKey].(bool)
	return ok && locked
}
