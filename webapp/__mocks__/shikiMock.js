// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Mock for shiki syntax highlighter used by BlockSuite
module.exports = {
    createHighlighterCore: async () => ({
        codeToHtml: () => '<pre><code></code></pre>',
        codeToTokens: () => ({ tokens: [] }),
        getLoadedLanguages: () => [],
        getLoadedThemes: () => [],
        dispose: () => {},
    }),
    createOnigurumaEngine: async () => ({}),
    bundledLanguages: {},
    bundledThemes: {},
};
