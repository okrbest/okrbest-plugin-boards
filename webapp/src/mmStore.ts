// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Store, Action} from 'redux'
import {GlobalState} from '@mattermost/types/store'

// Mattermost의 Redux store를 저장
let mmStore: Store<GlobalState, Action<Record<string, unknown>>> | null = null

export function setMattermostStore(store: Store<GlobalState, Action<Record<string, unknown>>>) {
    mmStore = store
}

export function getMattermostStore(): Store<GlobalState, Action<Record<string, unknown>>> | null {
    return mmStore
}
