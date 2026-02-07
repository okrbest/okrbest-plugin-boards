// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {CommentBlock, createCommentBlock, getScheduledAt, isPendingScheduledComment} from '../../blocks/commentBlock'
import mutator from '../../mutator'
import {useAppSelector} from '../../store/hooks'
import {Utils} from '../../utils'
import Button from '../../widgets/buttons/button'
import CompassIcon from '../../widgets/icons/compassIcon'

import {MarkdownEditor} from '../markdownEditor'

import {IUser} from '../../user'
import {getMe} from '../../store/users'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'
import {Permission} from '../../constants'

import AddCommentTourStep from '../onboardingTour/addComments/addComments'

import Comment from './comment'
import ScheduledCommentPicker from './scheduledCommentPicker'

import './commentsList.scss'

type Props = {
    comments: readonly CommentBlock[]
    boardId: string
    cardId: string
    readonly: boolean
}

const CommentsList = (props: Props) => {
    const [newComment, setNewComment] = useState('')
    const [showSchedulePicker, setShowSchedulePicker] = useState(false)
    const me = useAppSelector<IUser|null>(getMe)
    const canDeleteOthersComments = useHasCurrentBoardPermissions([Permission.DeleteOthersComments])
    const intl = useIntl()

    const {comments, boardId, cardId} = props

    const onSendClicked = () => {
        const commentText = newComment
        if (commentText) {
            Utils.log(`Send comment: ${commentText}`)
            Utils.assertValue(cardId)

            const comment = createCommentBlock()
            comment.parentId = cardId
            comment.boardId = boardId
            comment.title = commentText
            mutator.insertBlock(boardId, comment, 'add comment')
            setNewComment('')
        }
    }

    const onScheduleClicked = async (scheduledAt: number) => {
        const commentText = newComment
        if (commentText) {
            Utils.log(`Schedule comment: ${commentText}`)
            Utils.assertValue(cardId)

            try {
                await mutator.createScheduledComment(boardId, cardId, commentText, scheduledAt)
                setNewComment('')
            } catch (err) {
                Utils.log(`Failed to schedule comment: ${err}`)
            }
            setShowSchedulePicker(false)
        }
    }

    const newCommentComponent = (
        <div className='CommentsList__new'>
            <img
                className='comment-avatar'
                src={Utils.getProfilePicture(me?.id)}
            />
            <MarkdownEditor
                className='newcomment'
                text={newComment}
                placeholderText={intl.formatMessage({id: 'CardDetail.new-comment-placeholder', defaultMessage: 'Add a comment...'})}
                onChange={(value: string) => {
                    if (newComment !== value) {
                        setNewComment(value)
                    }
                }}
            />

            {newComment && (
                <div className='CommentsList__actions'>
                    <Button
                        onClick={() => setShowSchedulePicker(true)}
                        title={intl.formatMessage({id: 'CommentsList.schedule', defaultMessage: 'Schedule'})}
                    >
                        <CompassIcon icon='clock-outline'/>
                    </Button>
                    <Button
                        filled={true}
                        onClick={onSendClicked}
                    >
                        <FormattedMessage
                            id='CommentsList.send'
                            defaultMessage='Send'
                        />
                    </Button>
                </div>
            )}

            {showSchedulePicker && (
                <ScheduledCommentPicker
                    onSchedule={onScheduleClicked}
                    onCancel={() => setShowSchedulePicker(false)}
                />
            )}

            <AddCommentTourStep/>
        </div>
    )

    return (
        <div className='CommentsList'>
            {/* New comment */}
            {!props.readonly && newCommentComponent}

            {comments.slice(0).reverse().map((comment) => {
                const isScheduled = isPendingScheduledComment(comment)
                if (isScheduled && comment.createdBy !== me?.id) {
                    return null
                }
                const canDeleteComment: boolean = canDeleteOthersComments || me?.id === comment.modifiedBy
                return (
                    <Comment
                        key={comment.id}
                        comment={comment}
                        userImageUrl={Utils.getProfilePicture(comment.modifiedBy)}
                        userId={comment.modifiedBy}
                        readonly={props.readonly || !canDeleteComment}
                        scheduledAt={isScheduled ? getScheduledAt(comment) : undefined}
                    />
                )
            })}

            {/* horizontal divider below comments */}
            {!(comments.length === 0 && props.readonly) && <hr className='CommentsList__divider'/>}
        </div>
    )
}

export default React.memo(CommentsList)
