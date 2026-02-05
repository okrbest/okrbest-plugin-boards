// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useRef, useEffect, useMemo} from 'react'
import {useParams, useLocation} from 'react-router-dom'
import {useIntl} from 'react-intl'
import {useHotkeys} from 'react-hotkeys-hook'
import {debounce} from 'lodash'

import CompassIcon from '../../widgets/icons/compassIcon'
import Editable from '../../widgets/editable'

import {useAppSelector, useAppDispatch} from '../../store/hooks'
import {getSearchText, setSearchText} from '../../store/searchText'

const ViewHeaderSearch = (): React.JSX.Element => {
    const searchText = useAppSelector<string>(getSearchText)
    const dispatch = useAppDispatch()
    const intl = useIntl()
    const params = useParams<{viewId?: string}>()
    const location = useLocation()

    const searchFieldRef = useRef<{focus(selectAll?: boolean): void}>(null)
    const [searchValue, setSearchValue] = useState(searchText)
    const [currentView, setCurrentView] = useState(params.viewId)

    const dispatchSearchText = (value: string) => {
        dispatch(setSearchText(value))
    }

    const debouncedDispatchSearchText = useMemo(
        () => debounce(dispatchSearchText, 200), [])

    useEffect(() => {
        const viewId = params.viewId
        if (viewId !== currentView) {
            setCurrentView(viewId)
            setSearchValue('')

            debouncedDispatchSearchText.cancel()
            dispatchSearchText('')
        }
    }, [location.pathname, params.viewId])

    useEffect(() => {
        return () => {
            debouncedDispatchSearchText.cancel()
        }
    }, [])

    useHotkeys('ctrl+shift+f,cmd+shift+f', () => {
        searchFieldRef.current?.focus(true)
    })

    return (
        <div className='board-search-field'>
            <CompassIcon
                icon='magnify'
                className='board-search-icon'
            />
            <Editable
                ref={searchFieldRef}
                value={searchValue}
                placeholderText={intl.formatMessage({id: 'ViewHeader.search-text', defaultMessage: 'Search cards'})}
                onChange={(value) => {
                    setSearchValue(value)
                    debouncedDispatchSearchText(value)
                }}
                onCancel={() => {
                    setSearchValue('')
                    debouncedDispatchSearchText('')
                }}
                onSave={() => {
                    debouncedDispatchSearchText(searchValue)
                }}
            />
        </div>
    )
}

export default ViewHeaderSearch
