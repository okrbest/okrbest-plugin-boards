// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

//go:generate mockgen -destination=mocks/propValueResolverMock.go -package mocks . PropValueResolver

package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/mattermost/mattermost-plugin-boards/server/utils"
)

var ErrInvalidBoardBlock = errors.New("invalid board block")
var ErrInvalidPropSchema = errors.New("invalid property schema")
var ErrInvalidProperty = errors.New("invalid property")
var ErrInvalidPropertyValue = errors.New("invalid property value")
var ErrInvalidPropertyValueType = errors.New("invalid property value type")
var ErrInvalidDate = errors.New("invalid date property")
var ErrRequiredPropertyMissing = errors.New("required property is missing")

// PropValueResolver allows PropDef.GetValue to further decode property values, such as
// looking up usernames from ids.
type PropValueResolver interface {
	GetUserByID(userID string) (*User, error)
}

// BlockProperties is a map of Prop's keyed by property id.
type BlockProperties map[string]BlockProp

// BlockProp represent a property attached to a block (typically a card).
type BlockProp struct {
	ID    string `json:"id"`
	Index int    `json:"index"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

// PropSchema is a map of PropDef's keyed by property id.
type PropSchema map[string]PropDef

// PropDefOption represents an option within a property definition.
type PropDefOption struct {
	ID    string `json:"id"`
	Index int    `json:"index"`
	Color string `json:"color"`
	Value string `json:"value"`
}

// PropDef represents a property definition as defined in a board's Fields member.
type PropDef struct {
	ID       string                   `json:"id"`
	Index    int                      `json:"index"`
	Name     string                   `json:"name"`
	Type     string                   `json:"type"`
	Options  map[string]PropDefOption `json:"options"`
	Required bool                     `json:"required"`
}

// GetValue resolves the value of a property if the passed value is an ID for an option,
// otherwise returns the original value.
func (pd PropDef) GetValue(v interface{}, resolver PropValueResolver) (string, error) {
	switch pd.Type {
	case "select":
		// v is the id of an option
		id, ok := v.(string)
		if !ok {
			return "", ErrInvalidPropertyValueType
		}
		opt, ok := pd.Options[id]
		if !ok {
			return "", ErrInvalidPropertyValue
		}
		return strings.ToUpper(opt.Value), nil

	case "date":
		// v is a JSON string
		date, ok := v.(string)
		if !ok {
			return "", ErrInvalidPropertyValueType
		}
		return pd.ParseDate(date)

	case "person":
		// v is a userid, or a JSON-encoded value
		var userID string
		switch typed := v.(type) {
		case string:
			if typed == "" {
				return "", nil
			}
			trimmed := strings.TrimSpace(typed)
			switch {
			case strings.HasPrefix(trimmed, "["):
				var ids []string
				if err := json.Unmarshal([]byte(trimmed), &ids); err != nil {
					return "", ErrInvalidPropertyValueType
				}
				if len(ids) > 0 {
					userID = ids[0]
				}
			case strings.HasPrefix(trimmed, "{"):
				var obj map[string]interface{}
				if err := json.Unmarshal([]byte(trimmed), &obj); err != nil {
					return "", ErrInvalidPropertyValueType
				}
				if id, ok := obj["id"].(string); ok {
					userID = id
				} else if id, ok := obj["userId"].(string); ok {
					userID = id
				}
			default:
				userID = typed
			}
		case []interface{}:
			if len(typed) > 0 {
				id, ok := typed[0].(string)
				if !ok {
					return "", ErrInvalidPropertyValueType
				}
				userID = id
			}
		case []string:
			if len(typed) > 0 {
				userID = typed[0]
			}
		case map[string]interface{}:
			if id, ok := typed["id"].(string); ok {
				userID = id
			} else if id, ok := typed["userId"].(string); ok {
				userID = id
			}
		default:
			return "", ErrInvalidPropertyValueType
		}

		if userID == "" {
			return "", nil
		}

		if resolver != nil {
			user, err := resolver.GetUserByID(userID)
			if err != nil {
				return "", err
			}
			if user == nil {
				return userID, nil
			}
			// Add @ prefix for Mattermost mention linking
			return "@" + user.Username, nil
		}
		return userID, nil

	case "multiPerson":
		// v is a slice of user IDs or a JSON-encoded string
		var userIDs []string
		switch typed := v.(type) {
		case []interface{}:
			userIDs = make([]string, 0, len(typed))
			for _, item := range typed {
				id, ok := item.(string)
				if !ok {
					return "", fmt.Errorf("multiPerson property type: %w", ErrInvalidPropertyValueType)
				}
				userIDs = append(userIDs, id)
			}
		case []string:
			userIDs = typed
		case string:
			if typed == "" {
				return "", nil
			}
			if err := json.Unmarshal([]byte(typed), &userIDs); err != nil {
				return "", fmt.Errorf("multiPerson property type: %w", ErrInvalidPropertyValueType)
			}
		default:
			return "", fmt.Errorf("multiPerson property type: %w", ErrInvalidPropertyValueType)
		}

		if resolver == nil {
			return strings.Join(userIDs, ", "), nil
		}

		usernames := make([]string, len(userIDs))
		for i, userID := range userIDs {
			user, err := resolver.GetUserByID(userID)
			if err != nil {
				return "", err
			}
			if user == nil {
				usernames[i] = userID
			} else {
				// Add @ prefix for Mattermost mention linking
				usernames[i] = "@" + user.Username
			}
		}

		return strings.Join(usernames, ", "), nil

	case "multiSelect":
		// v is a slice of strings containing option ids
		ms, ok := v.([]interface{})
		if !ok {
			return "", ErrInvalidPropertyValueType
		}
		var sb strings.Builder
		prefix := ""
		for _, optid := range ms {
			id, ok := optid.(string)
			if !ok {
				return "", ErrInvalidPropertyValueType
			}
			opt, ok := pd.Options[id]
			if !ok {
				return "", ErrInvalidPropertyValue
			}
			sb.WriteString(prefix)
			prefix = ", "
			sb.WriteString(strings.ToUpper(opt.Value))
		}
		return sb.String(), nil

	case "card":
		// v is a JSON string: {"boardId":"...","cards":[{"id":"...","title":"..."}]}
		// or legacy format "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..."
		// or old format "boardId:cardId:cardTitle"
		s, ok := v.(string)
		if !ok {
			return "", ErrInvalidPropertyValueType
		}
		if s == "" {
			return "", nil
		}
		// JSON format
		if strings.HasPrefix(s, "{") {
			type cardRef struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}
			type cardValue struct {
				BoardID string    `json:"boardId"`
				Cards   []cardRef `json:"cards"`
			}
			var parsed cardValue
			if err := json.Unmarshal([]byte(s), &parsed); err == nil {
				if len(parsed.Cards) == 0 {
					return "", nil
				}
				titles := make([]string, 0, len(parsed.Cards))
				for _, c := range parsed.Cards {
					title := c.Title
					if title == "" {
						title = "Untitled"
					}
					titles = append(titles, title)
				}
				return strings.Join(titles, ", "), nil
			}
		}
		// legacy format: "boardId|cardId1:cardTitle1,cardId2:cardTitle2,..."
		if strings.Contains(s, "|") {
			parts := strings.SplitN(s, "|", 2)
			if len(parts) < 2 || parts[1] == "" {
				return "", nil
			}
			cardsStr := parts[1]
			cardParts := strings.Split(cardsStr, ",")
			var titles []string
			for _, cardStr := range cardParts {
				colonIndex := strings.Index(cardStr, ":")
				if colonIndex == -1 {
					titles = append(titles, "Untitled")
				} else {
					title := cardStr[colonIndex+1:]
					if title == "" {
						title = "Untitled"
					}
					titles = append(titles, title)
				}
			}
			return strings.Join(titles, ", "), nil
		}
		// 이전 형식 호환: "boardId:cardId:cardTitle"
		parts := strings.Split(s, ":")
		if len(parts) >= 3 {
			return strings.Join(parts[2:], ":"), nil
		}
		return "", nil
	}
	return fmt.Sprintf("%v", v), nil
}

func (pd PropDef) ParseDate(s string) (string, error) {
	// s is a JSON snippet of the form:
	// {"from":1642161600000, "to":1642161600000, "includeTime":true} in milliseconds UTC
	type dateValue struct {
		From        *int64 `json:"from"`
		To          *int64 `json:"to"`
		IncludeTime bool   `json:"includeTime"`
	}

	var value dateValue
	if err := json.Unmarshal([]byte(s), &value); err != nil {
		return s, err
	}
	if value.From == nil {
		return s, ErrInvalidDate
	}

	layout := "January 02, 2006"
	if value.IncludeTime {
		layout = "January 02, 2006 15:04"
	}

	date := utils.GetTimeForMillis(*value.From).Format(layout)
	if value.To != nil {
		date += " -> " + utils.GetTimeForMillis(*value.To).Format(layout)
	}
	return date, nil
}

// ParsePropertySchema parses a board block's `Fields` to extract the properties
// schema for all cards within the board.
// The result is provided as a map for quick lookup, and the original order is
// preserved via the `Index` field.
func ParsePropertySchema(board *Board) (PropSchema, error) {
	schema := make(map[string]PropDef)

	for i, prop := range board.CardProperties {
		pd := PropDef{
			ID:       getMapString("id", prop),
			Index:    i,
			Name:     getMapString("name", prop),
			Type:     getMapString("type", prop),
			Options:  make(map[string]PropDefOption),
			Required: getMapBool("required", prop),
		}
		optsIface, ok := prop["options"]
		if ok {
			opts, ok := optsIface.([]interface{})
			if !ok {
				return nil, ErrInvalidPropSchema
			}
			for j, propOptIface := range opts {
				propOpt, ok := propOptIface.(map[string]interface{})
				if !ok {
					return nil, ErrInvalidPropSchema
				}
				po := PropDefOption{
					ID:    getMapString("id", propOpt),
					Index: j,
					Value: getMapString("value", propOpt),
					Color: getMapString("color", propOpt),
				}
				pd.Options[po.ID] = po
			}
		}
		schema[pd.ID] = pd
	}
	return schema, nil
}

func getMapString(key string, m map[string]interface{}) string {
	iface, ok := m[key]
	if !ok {
		return ""
	}

	s, ok := iface.(string)
	if !ok {
		return ""
	}
	return s
}

func getMapBool(key string, m map[string]interface{}) bool {
	iface, ok := m[key]
	if !ok {
		return false
	}

	b, ok := iface.(bool)
	if !ok {
		return false
	}
	return b
}

// IsPropertyValueEmpty checks if a property value is considered empty.
func IsPropertyValueEmpty(value interface{}) bool {
	if value == nil {
		return true
	}

	switch v := value.(type) {
	case string:
		return v == ""
	case []interface{}:
		return len(v) == 0
	case []string:
		return len(v) == 0
	default:
		return false
	}
}

// ValidateRequiredProperties checks if all required properties have values.
// Returns a list of missing required property names.
func ValidateRequiredProperties(block *Block, schema PropSchema) []string {
	var missing []string

	if block == nil {
		return missing
	}

	propsIface, ok := block.Fields["properties"]
	if !ok {
		// No properties at all - check if any required properties exist
		for _, def := range schema {
			if def.Required {
				missing = append(missing, def.Name)
			}
		}
		return missing
	}

	blockProps, ok := propsIface.(map[string]interface{})
	if !ok {
		// Properties field is wrong type - consider all required as missing
		for _, def := range schema {
			if def.Required {
				missing = append(missing, def.Name)
			}
		}
		return missing
	}

	for _, def := range schema {
		if !def.Required {
			continue
		}

		value, exists := blockProps[def.ID]
		if !exists || IsPropertyValueEmpty(value) {
			missing = append(missing, def.Name)
		}
	}

	return missing
}

// ParseProperties parses a block's `Fields` to extract the properties. Properties typically exist on
// card blocks.  A resolver can optionally be provided to fetch usernames for `person` prop type.
func ParseProperties(block *Block, schema PropSchema, resolver PropValueResolver) (BlockProperties, error) {
	props := make(map[string]BlockProp)

	if block == nil {
		return props, nil
	}

	// `properties` contains a map (untyped at this point).
	propsIface, ok := block.Fields["properties"]
	if !ok {
		return props, nil // this is expected for blocks that don't have any properties.
	}

	blockProps, ok := propsIface.(map[string]interface{})
	if !ok {
		return props, fmt.Errorf("`properties` field wrong type: %w", ErrInvalidProperty)
	}

	if len(blockProps) == 0 {
		return props, nil
	}

	for k, v := range blockProps {
		s := fmt.Sprintf("%v", v)

		prop := BlockProp{
			ID:    k,
			Name:  k,
			Value: s,
		}

		def, ok := schema[k]
		if ok {
			val, err := def.GetValue(v, resolver)
			if err != nil {
				return props, fmt.Errorf("could not parse property value (%s): %w", fmt.Sprintf("%v", v), err)
			}
			prop.Name = def.Name
			prop.Value = val
			prop.Index = def.Index
		}
		props[k] = prop
	}
	return props, nil
}
