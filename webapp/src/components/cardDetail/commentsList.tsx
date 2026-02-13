// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {CommentBlock, createCommentBlock, getScheduledAt, isPendingScheduledComment} from '../../blocks/commentBlock'
import mutator from '../../mutator'
import {useAppSelector} from '../../store/hooks'
import {Utils} from '../../utils'
import Button from '../../widgets/buttons/button'
import CompassIcon from '../../widgets/icons/compassIcon'

import {MarkdownEditor} from '../markdownEditor'
import type {MentionMapping} from '../lexicalEditor/LexicalEditorInput'

import {IUser} from '../../user'
import {getMe} from '../../store/users'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'
import {Permission} from '../../constants'

import AddCommentTourStep from '../onboardingTour/addComments/addComments'

import Comment from './comment'
import ScheduledCommentPicker from './scheduledCommentPicker'

import './commentsList.scss'

/**
 * 메시지 내의 @displayname을 @username으로 변환합니다.
 * mentionMappings에 저장된 매핑 정보를 사용합니다.
 */
function convertDisplayNamesToUsernames(message: string, mentionMappings?: Record<string, MentionMapping>): string {
    if (!mentionMappings || Object.keys(mentionMappings).length === 0) {
        return message
    }

    // 메시지 끝에 있는 멘션을 처리하기 위해 임시 공백 추가
    let convertedMessage = message + ' '

    // displayname이 긴 것부터 먼저 변환 (부분 매칭 방지)
    const sortedMappings = Object.entries(mentionMappings).sort(
        ([a], [b]) => b.length - a.length,
    )

    for (const [displayName, mapping] of sortedMappings) {
        // @displayname 패턴을 찾아서 @username으로 변환
        // - (^|\\s): @ 앞에 문자열 시작 또는 공백이 있어야 함 (이메일 주소 등에서 잘못 변환되는 것 방지)
        // - (?=\\s|...): @ 뒤에 공백이나 구두점이 있어야 함
        const escapedDisplayName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(`(^|\\s)@${escapedDisplayName}(?=\\s|[.,!?;:'"\\)\\]}>])`, 'gm')

        // 콜백 함수를 사용하여 특수 대체 패턴 문자($&, $' 등)가 username에 있어도 안전하게 처리
        convertedMessage = convertedMessage.replace(pattern, (_match, prefix) => `${prefix}@${mapping.username}`)
    }

    // 임시로 추가한 공백 제거
    return convertedMessage.slice(0, -1)
}

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

    // 멘션 매핑: displayname -> username 변환을 위한 ref
    // ref를 사용하여 연속 멘션 선택 시 최신 상태를 유지
    const mentionMappingsRef = useRef<Record<string, MentionMapping>>({})

    const handleMentionMappingsChange = useCallback((mappings: Record<string, MentionMapping>) => {
        mentionMappingsRef.current = mappings
    }, [])

    const onSendClicked = () => {
        const commentText = newComment
        if (commentText) {
            Utils.log(`Send comment: ${commentText}`)
            Utils.assertValue(cardId)

            // @displayname을 @username으로 변환
            const convertedText = convertDisplayNamesToUsernames(commentText, mentionMappingsRef.current)

            const comment = createCommentBlock()
            comment.parentId = cardId
            comment.boardId = boardId
            comment.title = convertedText
            mutator.insertBlock(boardId, comment, 'add comment')
            setNewComment('')
            // 멘션 매핑 초기화
            mentionMappingsRef.current = {}
        }
    }

    const onScheduleClicked = async (scheduledAt: number) => {
        const commentText = newComment
        if (commentText) {
            Utils.log(`Schedule comment: ${commentText}`)
            Utils.assertValue(cardId)

            // @displayname을 @username으로 변환
            const convertedText = convertDisplayNamesToUsernames(commentText, mentionMappingsRef.current)

            try {
                await mutator.createScheduledComment(boardId, cardId, convertedText, scheduledAt)
                setNewComment('')
                // 멘션 매핑 초기화
                mentionMappingsRef.current = {}
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
                onMentionMappingsChange={handleMentionMappingsChange}
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
