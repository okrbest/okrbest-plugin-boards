// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

//go:build integration
// +build integration

package boards

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func TestServeHTTP(t *testing.T) {
	th, tearDown := SetupTestHelper(t)
	defer tearDown()

	b := &BoardsApp{
		server: th.Server,
		logger: mlog.CreateConsoleTestLogger(t),
	}

	assert := assert.New(t)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/hello", nil)

	b.ServeHTTP(nil, w, r)

	result := w.Result()
	assert.NotNil(result)
	defer result.Body.Close()
	bodyBytes, err := io.ReadAll(result.Body)
	assert.Nil(err)
	bodyString := string(bodyBytes)

	assert.Equal("Hello", bodyString)
}
