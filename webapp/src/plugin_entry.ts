// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// CSS imports - vite-plugin-css-injected-by-js가 자동으로 JS 번들에 인라인 주입
import '@mattermost/compass-icons/css/compass-icons.css'
import './styles/main.scss'
import './plugin.scss'

import manifest from './manifest'

import Plugin from './index'

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void
    }
}

window.registerPlugin(manifest.id, new Plugin())
