// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

declare module '*.scss?inline' {
    const content: string
    export default content
}

declare module '*.css?inline' {
    const content: string
    export default content
}

// BlockSuite effects 모듈 타입 선언
declare module '@blocksuite/blocks/effects' {
    export function effects(): void
}

declare module '@blocksuite/presets/effects' {
    export function effects(): void
}
