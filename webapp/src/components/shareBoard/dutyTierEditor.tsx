// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {useIntl} from 'react-intl'

import MenuWrapper from '../../widgets/menuWrapper'
import Menu from '../../widgets/menu'
import CompassIcon from '../../widgets/icons/compassIcon'

import {DutyTier} from '../../blocks/board'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {getDuties} from '../../store/orgMaster'
import {canEditDutyTiers, getDutyTiers, getTierBoardCounts, saveDutyTiers} from '../../store/dutyTiers'
import {Utils} from '../../utils'

type Props = {
    teamId: string
}

// The team's duty tiers — "C-Level" standing for CSO, COO, CFO and CGO.
//
// Two things about this block are deliberate.
//
// It is shown to everyone who can open the rule list, not only to those who may
// change it. Writing a rule that points at "C-Level" is impossible without
// knowing who that is, so hiding the block from a board admin would leave them
// guessing (FR-011c).
//
// It says out loud that a change reaches every board in the team. The value is
// stored once and read everywhere, which is the point — and also the risk.
const DutyTierEditor = (props: Props): React.JSX.Element => {
    const intl = useIntl()
    const dispatch = useAppDispatch()

    const tiers = useAppSelector(getDutyTiers(props.teamId))
    const canEdit = useAppSelector(canEditDutyTiers(props.teamId))
    const duties = useAppSelector(getDuties(props.teamId))
    const boardCounts = useAppSelector(getTierBoardCounts(props.teamId))
    const [newName, setNewName] = React.useState('')

    const dutyName = (dutyId: string): string => duties.find((duty) => duty.id === dutyId)?.name || dutyId

    // A duty in no tier matches no rule, so that person sees nothing and never
    // learns why. Naming them here is cheaper than finding out afterwards.
    const assigned = new Set(tiers.flatMap((tier) => tier.dutyIds))
    const unassigned = duties.filter((duty) => !assigned.has(duty.id))

    const save = (next: DutyTier[]) => {
        dispatch(saveDutyTiers({teamId: props.teamId, tiers: next}))
    }

    const addDuty = (tierId: string, dutyId: string) => {
        save(tiers.map((tier) => (tier.id === tierId ?
            {...tier, dutyIds: [...tier.dutyIds, dutyId]} :
            tier)))
    }

    const removeDuty = (tierId: string, dutyId: string) => {
        save(tiers.map((tier) => (tier.id === tierId ?
            {...tier, dutyIds: tier.dutyIds.filter((id) => id !== dutyId)} :
            tier)))
    }

    const addTier = () => {
        const name = newName.trim()
        if (!name) {
            return
        }
        setNewName('')
        save([...tiers, {id: Utils.createGuid(Utils.blockTypeToIDType('block')), name, dutyIds: []}])
    }

    // Deleting is the one edit here that cannot be undone by re-typing. Every
    // rule pointing at the group stops matching, on every board in the team at
    // once, so the count goes in the confirmation rather than after it.
    const removeTier = (tier: DutyTier) => {
        const used = boardCounts[tier.id] || 0
        const message = used > 0 ?
            intl.formatMessage(
                {id: 'DutyTier.confirmDeleteUsed', defaultMessage: '"{name}" is used by {count} boards. Their rules will stop matching anyone. Delete it?'},
                {name: tier.name, count: used},
            ) :
            intl.formatMessage({id: 'DutyTier.confirmDelete', defaultMessage: 'Delete "{name}"?'}, {name: tier.name})

        // eslint-disable-next-line no-alert
        if (!window.confirm(message)) {
            return
        }
        save(tiers.filter((other) => other.id !== tier.id))
    }

    const className = `DutyTierEditor${canEdit ? '' : ' DutyTierEditor--readonly'}`

    return (
        <div className={className}>
            <div className='DutyTierEditor__header'>
                <div className='DutyTierEditor__title'>
                    {intl.formatMessage({id: 'DutyTier.title', defaultMessage: 'Duty groups'})}
                </div>
                <div className='DutyTierEditor__scope'>
                    {intl.formatMessage({
                        id: 'DutyTier.appliesToAllBoards',
                        defaultMessage: 'Applies to all boards in this team',
                    })}
                </div>
            </div>

            {tiers.map((tier) => (
                <div
                    key={tier.id}
                    className='DutyTierEditor__tier'
                >
                    <div className='DutyTierEditor__name'>
                        {tier.name}
                        {canEdit && (
                            <button
                                className='DutyTierEditor__removeTier'
                                onClick={() => removeTier(tier)}
                                title={intl.formatMessage({id: 'DutyTier.removeTier', defaultMessage: 'Delete group'})}
                            >
                                <CompassIcon icon='trash-can-outline'/>
                            </button>
                        )}
                    </div>
                    <div className='DutyTierEditor__duties'>
                        {tier.dutyIds.map((dutyId) => (
                            <span
                                key={dutyId}
                                className='DutyTierEditor__duty'
                            >
                                {dutyName(dutyId)}
                                {canEdit && (
                                    <button
                                        className='DutyTierEditor__remove'
                                        onClick={() => removeDuty(tier.id, dutyId)}
                                        title={intl.formatMessage({id: 'DutyTier.remove', defaultMessage: 'Remove'})}
                                    >
                                        <CompassIcon icon='close'/>
                                    </button>
                                )}
                            </span>
                        ))}

                        {canEdit && (
                            <MenuWrapper
                                usePortal={true}
                                menuPosition='bottom'
                            >
                                <button className='DutyTierEditor__add'>
                                    {intl.formatMessage({id: 'DutyTier.addDuty', defaultMessage: '+ Add duty'})}
                                </button>
                                <Menu position='bottom'>
                                    {duties
                                        .filter((duty) => !tier.dutyIds.includes(duty.id))
                                        .map((duty) => (
                                            <Menu.Text
                                                key={duty.id}
                                                id={duty.id}
                                                name={duty.name}
                                                onClick={() => addDuty(tier.id, duty.id)}
                                            />
                                        ))}
                                </Menu>
                            </MenuWrapper>
                        )}
                    </div>
                </div>
            ))}

            {canEdit && (
                <div className='DutyTierEditor__new'>
                    <input
                        className='DutyTierEditor__newName'
                        value={newName}
                        placeholder={intl.formatMessage({id: 'DutyTier.newName', defaultMessage: 'New group name'})}
                        onChange={(event) => setNewName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                addTier()
                            }
                        }}
                    />
                    <button
                        className='DutyTierEditor__addTier'
                        onClick={addTier}
                        disabled={newName.trim() === ''}
                    >
                        {intl.formatMessage({id: 'DutyTier.addTier', defaultMessage: '+ Add group'})}
                    </button>
                </div>
            )}

            {unassigned.length > 0 && (
                <div className='DutyTierEditor__unassigned'>
                    {intl.formatMessage(
                        {id: 'DutyTier.unassigned', defaultMessage: 'In no group: {names}'},
                        {names: unassigned.map((duty) => duty.name).join(', ')},
                    )}
                </div>
            )}
        </div>
    )
}

export default DutyTierEditor
