// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	"database/sql"
	"os"
	"testing"

	"github.com/mattermost/mattermost-plugin-boards/server/services/store"
	mmModel "github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/pluginapi/cluster"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/stretchr/testify/require"
)

type noOpMutexAPIAdapter struct{}

func (m *noOpMutexAPIAdapter) KVSetWithOptions(key string, value []byte, options mmModel.PluginKVSetOptions) (bool, *mmModel.AppError) {
	return true, nil
}

func (m *noOpMutexAPIAdapter) LogError(msg string, keyValuePairs ...interface{}) {
}

func SetupTests(t *testing.T) (store.Store, func()) {
	origUnitTesting := os.Getenv("FOCALBOARD_UNIT_TESTING")
	os.Setenv("FOCALBOARD_UNIT_TESTING", "1")

	dbType, connectionString, err := PrepareNewTestDatabase()
	require.NoError(t, err)

	logger, _ := mlog.NewLogger()

	sqlDB, err := sql.Open(dbType, connectionString)
	require.NoError(t, err)
	err = sqlDB.Ping()
	require.NoError(t, err)

	if dbType == "sqlite3" {
		var result string
		jsonErr := sqlDB.QueryRow("SELECT json_set('{}', '$.a', 1)").Scan(&result)
		if jsonErr != nil {
			t.Skip("Skipping SQLite test: json1 extension not enabled (missing -tags 'json1'?)")
			return nil, nil
		}
	}

	storeParams := Params{
		DBType:           dbType,
		ConnectionString: connectionString,
		DBPingAttempts:   5,
		TablePrefix:      "test_",
		Logger:           logger,
		DB:               sqlDB,
		NewMutexFn: func(name string) (*cluster.Mutex, error) {
			return cluster.NewMutex(&noOpMutexAPIAdapter{}, name)
		},
		SkipMigrations: true,
	}
	store, err := New(storeParams)
	require.NoError(t, err)

	// Pre-mark migration as complete for tests to avoid missing table error
	if dbType == "sqlite3" {
		_, err = sqlDB.Exec("CREATE TABLE IF NOT EXISTS test_system_settings (id VARCHAR(100) PRIMARY KEY, value TEXT)")
		require.NoError(t, err)
		_, err = sqlDB.Exec("INSERT INTO test_system_settings (id, value) VALUES ('DeletedMembershipBoardsMigrationComplete', 'true')")
		require.NoError(t, err)
		_, err = sqlDB.Exec("INSERT INTO test_system_settings (id, value) VALUES ('CategoryUuidIdMigrationComplete', 'true')")
		require.NoError(t, err)
	}

	err = store.Migrate()
	require.NoError(t, err)

	tearDown := func() {
		defer func() { _ = logger.Shutdown() }()
		err = store.Shutdown()
		require.Nil(t, err)
		if err = os.Remove(connectionString); err == nil {
			logger.Debug("Removed test database", mlog.String("file", connectionString))
		}
		os.Setenv("FOCALBOARD_UNIT_TESTING", origUnitTesting)
	}

	return store, tearDown
}
