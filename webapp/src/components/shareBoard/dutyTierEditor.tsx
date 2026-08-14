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
import {canEditDutyTiers, getDutyTiers, saveDutyTiers} from '../../store/dutyTiers'

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
                    <div className='DutyTierEditor__name'>{tier.name}</div>
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
