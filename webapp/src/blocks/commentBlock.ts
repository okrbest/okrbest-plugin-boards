// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Block, createBlock} from './block'

type CommentBlock = Block & {
    type: 'comment'
}

function createCommentBlock(block?: Block): CommentBlock {
    return {
        ...createBlock(block),
        type: 'comment',
    }
}

function getScheduledAt(block: Block): number | undefined {
    return block.fields?.scheduledAt as number | undefined
}

function getScheduledStatus(block: Block): string | undefined {
    return block.fields?.scheduledStatus as string | undefined
}

function isPendingScheduledComment(block: Block): boolean {
    return block.type === 'comment' && block.fields?.scheduledStatus === 'pending'
}

export {CommentBlock, createCommentBlock, getScheduledAt, getScheduledStatus, isPendingScheduledComment}
