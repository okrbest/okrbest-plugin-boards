// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// BlockSuiteMigrationStatus represents the migration status of content blocks to BlockSuite.
type BlockSuiteMigrationStatus struct {
	// TotalCards is the total number of active cards in the system.
	TotalCards int64 `json:"totalCards"`

	// MigratedCards is the number of cards that have BlockSuite documents.
	MigratedCards int64 `json:"migratedCards"`

	// CardsWithContentBlocks is the number of cards that have legacy content blocks.
	CardsWithContentBlocks int64 `json:"cardsWithContentBlocks"`

	// CardsWithContentBlocksNotMigrated is the number of cards that have content blocks
	// but no BlockSuite document (these need migration).
	CardsWithContentBlocksNotMigrated int64 `json:"cardsWithContentBlocksNotMigrated"`

	// LegacyContentBlockCount is the total number of legacy content blocks.
	LegacyContentBlockCount int64 `json:"legacyContentBlockCount"`

	// MigrationPercentage is the percentage of cards migrated (0-100).
	MigrationPercentage float64 `json:"migrationPercentage"`

	// IsMigrationComplete is true if all cards with content blocks have been migrated.
	IsMigrationComplete bool `json:"isMigrationComplete"`
}

// ContentBlockTypes defines the block types that are considered "content blocks"
// and will be removed after BlockSuite migration is complete.
var ContentBlockTypes = []string{
	"text",
	"image",
	"checkbox",
	"divider",
	"h1",
	"h2",
	"h3",
	"attachment",
	"video",
	"quote",
}

// UnmigratedCard represents a card that hasn't been migrated to BlockSuite yet,
// along with its legacy content blocks.
// swagger:model
type UnmigratedCard struct {
	// Card is the card block itself
	Card *Block `json:"card"`

	// ContentBlocks are the legacy content blocks belonging to this card
	ContentBlocks []*Block `json:"contentBlocks"`
}

// UnmigratedCardsResponse is the response for the unmigrated cards API.
// swagger:model
type UnmigratedCardsResponse struct {
	// Cards is the list of unmigrated cards with their content blocks
	Cards []*UnmigratedCard `json:"cards"`

	// TotalCount is the total number of unmigrated cards (may be more than returned due to pagination)
	TotalCount int64 `json:"totalCount"`

	// HasMore indicates if there are more cards to fetch
	HasMore bool `json:"hasMore"`
}
