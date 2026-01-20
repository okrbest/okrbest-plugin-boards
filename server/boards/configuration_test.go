// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package boards

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestConfigurationNullConfiguration(t *testing.T) {
	boardsApp := &BoardsApp{}
	assert.NotNil(t, boardsApp.getConfiguration())
}
