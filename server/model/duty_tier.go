// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"encoding/json"
	"fmt"
)

// DutyTiersKey is the team settings key that holds the duty tiers.
// See specs/009-card-access-role-matrix/data-model.md §1.
const DutyTiersKey = "dutyTiers"

// DutyTier is a named set of 직책 — "C-Level" standing for CSO, COO, CFO and CGO.
//
// It lives on the team rather than on a board. Which duties count as C-Level is
// a fact about the company, not about one board, and storing it per board lets
// two boards disagree about the same person without anyone noticing (009 R5).
//
// It is not a rank. There is no order between tiers, a tier holding one duty is
// treated exactly like one holding four, and a duty may sit in several tiers —
// somebody who is both an officer and a team lead has to be expressible.
type DutyTier struct {
	// ID is what a rule points at.
	ID string `json:"id"`

	// Name is what a person reads. It becomes a column heading in the matrix.
	Name string `json:"name"`

	// DutyIDs are PositionDefinitions.id values from the organization master.
	DutyIDs []string `json:"dutyIds"`
}

// DutyTiersFromSettings reads the tiers out of a team's settings bag.
//
// Team.Settings is an untyped map that round trips through the database as JSON,
// so the stored value arrives as a generic map. Re-encoding is the cheapest way
// to get typed values back without hand walking the map — the same approach
// PropertyAccessSettingsFromProperties takes.
//
// A team that never had tiers is not an error: it returns an empty list, which
// every caller treats as "nothing is mapped yet".
func DutyTiersFromSettings(settings map[string]interface{}) ([]DutyTier, error) {
	raw, ok := settings[DutyTiersKey]
	if !ok || raw == nil {
		return nil, nil
	}

	if tiers, ok := raw.([]DutyTier); ok {
		return tiers, nil
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, NewErrBadRequest("invalid dutyTiers: " + err.Error())
	}

	tiers := []DutyTier{}
	if err := json.Unmarshal(encoded, &tiers); err != nil {
		// A half read tier set would put people in the wrong column, which is
		// worse than putting them in none.
		return nil, NewErrBadRequest("invalid dutyTiers: " + err.Error())
	}

	return tiers, nil
}

// DutyTiersIntoSettings renders the tiers back into the generic shape
// Team.Settings holds, leaving every other key alone.
//
// Other features share this bag, so writing the whole map would silently drop
// whatever they put there.
func DutyTiersIntoSettings(settings map[string]interface{}, tiers []DutyTier) (map[string]interface{}, error) {
	if tiers == nil {
		tiers = []DutyTier{}
	}

	encoded, err := json.Marshal(tiers)
	if err != nil {
		return nil, err
	}

	var value []interface{}
	if err := json.Unmarshal(encoded, &value); err != nil {
		return nil, err
	}

	updated := map[string]interface{}{}
	for key, existing := range settings {
		updated[key] = existing
	}
	updated[DutyTiersKey] = value

	return updated, nil
}

// ValidateDutyTiers rejects a tier set the screen should never have produced.
//
// Duty IDs are deliberately not checked for existence: the master belongs to the
// main server and a duty may be retired after a tier referencing it was written.
// Such an entry simply stops matching anyone, and the screen marks it.
func ValidateDutyTiers(tiers []DutyTier) error {
	for i, tier := range tiers {
		switch {
		case tier.ID == "":
			return NewErrBadRequest(fmt.Sprintf("dutyTier %d: id is required", i))
		case tier.Name == "":
			// The name is the matrix column heading. An empty one leaves a
			// column nobody can tell apart from its neighbor.
			return NewErrBadRequest(fmt.Sprintf("dutyTier %d: name is required", i))
		}
	}

	return nil
}

// DutyIDsFor resolves tier IDs into the duties they stand for.
//
// Several tiers combine into their union, which is what lets one rule row say
// "팀장 또는 팀원". A tier ID the team no longer has contributes nothing rather
// than failing: tiers live on the team and rules live on boards, so a board can
// outlive a tier it points at (009 R5).
func DutyIDsFor(tiers []DutyTier, tierIDs []string) []string {
	if len(tierIDs) == 0 {
		return nil
	}

	byID := make(map[string]DutyTier, len(tiers))
	for _, tier := range tiers {
		byID[tier.ID] = tier
	}

	var (
		duties []string
		seen   = map[string]bool{}
	)
	for _, tierID := range tierIDs {
		for _, dutyID := range byID[tierID].DutyIDs {
			if dutyID == "" || seen[dutyID] {
				continue
			}
			seen[dutyID] = true
			duties = append(duties, dutyID)
		}
	}

	return duties
}
