// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export {default as blockSuiteApi} from './blockSuiteApi'
export type {BlockSuiteDocInfo} from './blockSuiteApi'

export {
    convertLegacyBlocksToYjsDoc,
    createEmptyYjsDoc,
} from './legacyConverter'
export type {ConvertedBlock, BlockSuiteBlockType, BlockSuiteProps} from './legacyConverter'
