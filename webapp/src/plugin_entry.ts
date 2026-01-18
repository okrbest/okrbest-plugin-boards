// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import compassIcons from '@mattermost/compass-icons/css/compass-icons.css?inline'

import mainStyle from './styles/main.scss?inline'
import pluginStyle from './plugin.scss?inline'

const injectStyle = (css: string) => {
    if (!css) return
    const style = document.createElement('style')
    style.textContent = css
    document.head.prepend(style)
}

injectStyle(compassIcons)
injectStyle(mainStyle)
injectStyle(pluginStyle)

import manifest from './manifest'

import Plugin from './index'

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void
    }
}

window.registerPlugin(manifest.id, new Plugin())
