// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export {default as blockSuiteApi} from './blockSuiteApi'
export type {BlockSuiteDocInfo} from './blockSuiteApi'

export {
    convertLegacyBlocksToDocSnapshot,
    createEmptyDocSnapshot,
} from './legacyConverter'
export type {BlockSuiteFlavour} from './legacyConverter'
