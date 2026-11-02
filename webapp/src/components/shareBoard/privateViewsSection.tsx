// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react'
import {useIntl} from 'react-intl'

import {Board} from '../../blocks/board'
import {Permission} from '../../constants'
import octoClient from '../../octoClient'
import {getClientConfig} from '../../store/clientConfig'
import {useAppSelector} from '../../store/hooks'
import {getMe} from '../../store/users'
import {IUser} from '../../user'
import {Utils} from '../../utils'
import {PrivateViewSummary} from '../../viewAccess'
import Button from '../../widgets/buttons/button'
import ConfirmationDialogBox from '../confirmationDialogBox'
import BoardPermissionGate from '../permissions/boardPermissionGate'

type Props = {
    board: Board
}

// The board admin's list of private views: who made which one and when, with a
// delete for the ones left behind by people who are gone (022 US6).
//
// A private view is its creator's alone, so admins never see one in the tabs;
// this list is the one place they learn it exists. It shows a title, a name and
// a date — never the configuration — and offers delete only. Making another
// person's private view public is deliberately not here.
const PrivateViewsList = (props: Props): React.JSX.Element => {
    const {board} = props
    const intl = useIntl()
    const me = useAppSelector(getMe)
    const clientConfig = useAppSelector(getClientConfig)

    const [views, setViews] = useState<PrivateViewSummary[] | null>(null)
    const [creators, setCreators] = useState<Record<string, IUser>>({})
    const [pendingDelete, setPendingDelete] = useState<PrivateViewSummary | null>(null)

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            const fetched = await octoClient.getPrivateViews(board.id)
            if (cancelled) {
                return
            }
            // The client answers an empty list on failure; anything else that
            // is not a list (a stubbed client in tests) is read the same way.
            const list = Array.isArray(fetched) ? fetched : []
            setViews(list)

            const creatorIds = Array.from(new Set(list.map((view) => view.createdBy).filter(Boolean)))
            if (creatorIds.length === 0) {
                return
            }
            const users = await octoClient.getUsersList(creatorIds)
            if (cancelled) {
                return
            }
            const byId: Record<string, IUser> = {}
            for (const user of users) {
                byId[user.id] = user
            }
            setCreators(byId)
        }
        load()
        return () => {
            cancelled = true
        }
    }, [board.id])

    // Someone who left may no longer resolve to a user; the ID is still
    // better than nothing for telling two orphaned views apart.
    const creatorName = useCallback((userId: string): string => {
        const user = creators[userId]
        if (!user) {
            return userId
        }
        return Utils.getUserDisplayName(user, me?.props?.teammateNameDisplay || clientConfig.teammateNameDisplay)
    }, [creators, me, clientConfig.teammateNameDisplay])

    const confirmDelete = useCallback(async () => {
        if (!pendingDelete) {
            return
        }
        const target = pendingDelete
        setPendingDelete(null)
        const response = await octoClient.deletePrivateView(board.id, target.id)
        if (response.status === 200) {
            setViews((current) => (current ? current.filter((view) => view.id !== target.id) : current))
        }
    }, [board.id, pendingDelete])

    const deleteLabel = intl.formatMessage({id: 'PrivateViews.delete', defaultMessage: 'Delete'})

    return (
        <div className='tabs-content'>
            <div className='d-flex flex-column'>
                <div className='text-heading2'>
                    {intl.formatMessage({id: 'PrivateViews.title', defaultMessage: 'Private views'})}
                </div>
                <div className='text-light'>
                    {intl.formatMessage({id: 'PrivateViews.description', defaultMessage: 'Views only their creator can see. Delete the ones left behind by people who are gone.'})}
                </div>
            </div>

            {views && views.length === 0 &&
                <div className='text-light mt-2'>
                    {intl.formatMessage({id: 'PrivateViews.empty', defaultMessage: 'No private views on this board.'})}
                </div>
            }

            {views && views.length > 0 &&
                <div className='user-items'>
                    {views.map((view) => (
                        <div
                            key={view.id}
                            className='user-item'
                        >
                            <div className='user-item__content'>
                                <div className='user-item__title'>{view.title}</div>
                                <div className='text-light'>
                                    {intl.formatMessage(
                                        {id: 'PrivateViews.createdBy', defaultMessage: 'Created by {name} on {date}'},
                                        {name: creatorName(view.createdBy), date: Utils.displayDate(new Date(view.createAt), intl)},
                                    )}
                                </div>
                            </div>
                            <Button
                                danger={true}
                                onClick={() => setPendingDelete(view)}
                            >
                                {deleteLabel}
                            </Button>
                        </div>
                    ))}
                </div>
            }

            {pendingDelete &&
                <ConfirmationDialogBox
                    dialogBox={{
                        heading: deleteLabel,
                        subText: intl.formatMessage(
                            {id: 'PrivateViews.confirm-delete', defaultMessage: 'Delete the private view "{title}"? Its creator will lose it.'},
                            {title: pendingDelete.title},
                        ),
                        confirmButtonText: deleteLabel,
                        destructive: true,
                        onConfirm: confirmDelete,
                        onClose: () => setPendingDelete(null),
                    }}
                />
            }
        </div>
    )
}

// The gate sits outside the list so nothing is fetched for someone who may not
// see it.
const PrivateViewsSection = (props: Props): React.JSX.Element => (
    <BoardPermissionGate permissions={[Permission.ManageBoardRoles]}>
        <PrivateViewsList board={props.board}/>
    </BoardPermissionGate>
)

export default PrivateViewsSection
