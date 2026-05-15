// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {BlockTypes} from '../../blocks/block'
import Button from '../../widgets/buttons/button'
import Menu from '../../widgets/menu'
import MenuWrapper from '../../widgets/menuWrapper'

import {contentRegistry} from '../content/contentRegistry'

import {useCardDetailContext} from './cardDetailContext'

type AddContentMenuItemProps = {
    type: BlockTypes
}

const AddContentMenuItem = ({type}: AddContentMenuItemProps): React.JSX.Element | null => {
    const intl = useIntl()
    const cardDetail = useCardDetailContext()
    const handler = contentRegistry.getHandler(type)

    const addElement = useCallback(async () => {
        const {card} = cardDetail
        const index = card.fields.contentOrder?.length ?? 0
        cardDetail.addBlock(handler!, index, false)
    }, [cardDetail, handler])

    if (!handler) {
        return null
    }

    return (
        <Menu.Text
            key={type}
            id={type}
            name={handler.getDisplayText(intl)}
            icon={handler.getIcon()}
            onClick={addElement}
        />
    )
}

const CardDetailContentsMenu = () => {
    return (
        <div className='CardDetailContentsMenu content add-content'>
            <MenuWrapper>
                <Button>
                    <FormattedMessage
                        id='CardDetail.add-content'
                        defaultMessage='Add content'
                    />
                </Button>
                <Menu position='top'>
                    {contentRegistry.contentTypes.map((type) => (
                        <AddContentMenuItem
                            key={type}
                            type={type}
                        />
                    ))}
                </Menu>
            </MenuWrapper>
        </div>
    )
}

export default React.memo(CardDetailContentsMenu)
