// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react'
import {useIntl, IntlShape} from 'react-intl'

import Menu from '../widgets/menu'
import propsRegistry from '../properties'
import {PropertyType} from '../properties/types'
import {Board, PropertyTypeEnum} from '../blocks/board'
import octoClient from '../octoClient'
import {useAppSelector} from '../store/hooks'
import {getCurrentTeamId} from '../store/teams'
import {getCurrentBoard} from '../store/boards'
import SearchIcon from '../widgets/icons/search'
import './propertyMenu.scss'

// required 체크를 하지 않는 속성 타입들
// - 시스템 속성: 자동으로 설정되어 사용자가 입력할 수 없음
// - 체크박스: true/false 둘 중 하나이므로 "비어있음" 상태가 없음
export const NON_REQUIRED_PROPERTY_TYPES: PropertyTypeEnum[] = [
    'createdTime',
    'createdBy',
    'updatedTime',
    'updatedBy',
    'checkbox',
]

type Props = {
    propertyId: string
    propertyName: string
    propertyType: PropertyType
    required?: boolean
    onTypeAndNameChanged: (newType: PropertyType, newName: string) => void
    onRequiredChanged?: (required: boolean) => void
    onDelete: (id: string) => void
    onBoardSelected?: (selectedBoard: Board) => void
}

function typeMenuTitle(intl: IntlShape, type: PropertyType): string {
    return `${intl.formatMessage({id: 'PropertyMenu.typeTitle', defaultMessage: 'Type'})}: ${type.displayName(intl)}`
}

type TypesProps = {
    label: string
    onTypeSelected: (type: PropertyType) => void
}

export const PropertyTypes = (props: TypesProps): React.JSX.Element => {
    const intl = useIntl()
    return (
        <>
            <Menu.Label>
                <b>{props.label}</b>
            </Menu.Label>

            <Menu.Separator/>

            {
                propsRegistry.list().map((p) => (
                    <Menu.Text
                        key={p.type}
                        id={p.type}
                        name={p.displayName(intl)}
                        onClick={() => props.onTypeSelected(p)}
                    />
                ))
            }
        </>
    )
}

const PropertyMenu = (props: Props) => {
    const intl = useIntl()
    const teamId = useAppSelector(getCurrentTeamId)
    const currentBoard = useAppSelector(getCurrentBoard)
    const [boards, setBoards] = useState<Board[]>([])
    const [loadingBoards, setLoadingBoards] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const searchInputRef = useRef<HTMLInputElement>(null)
    let currentPropertyName = props.propertyName

    const isCardType = props.propertyType.type === 'card'
    
    // 현재 보드에서 propertyTemplate 찾기
    const propertyTemplate = currentBoard?.cardProperties?.find((p) => p.id === props.propertyId)

    const fetchBoards = useCallback(async () => {
        if (!teamId || !isCardType) {
            return
        }
        setLoadingBoards(true)
        try {
            // getBoards를 사용하여 사용자가 접근 가능한 모든 보드 가져오기
            const items = await octoClient.getBoards()
            // 템플릿만 제외하고 이름순 정렬
            const accessibleBoards = items.filter((b) => !b.isTemplate).sort((a, b) => {
                const titleA = a.title || ''
                const titleB = b.title || ''
                return titleA.localeCompare(titleB)
            })
            setBoards(accessibleBoards)
        } catch (error) {
            console.error('Failed to fetch boards:', error)
        } finally {
            setLoadingBoards(false)
        }
    }, [teamId, isCardType])

    useEffect(() => {
        if (isCardType) {
            fetchBoards()
        }
    }, [isCardType, fetchBoards])



    const deleteText = intl.formatMessage({
        id: 'PropertyMenu.Delete',
        defaultMessage: 'Delete',
    })
    const requiredText = intl.formatMessage({
        id: 'PropertyMenu.Required',
        defaultMessage: 'Required',
    })
    // 선택된 보드 확인 (propertyTemplate.options[0].id에 보드 ID 저장)
    const selectedBoardId = propertyTemplate?.options?.[0]?.id
    const selectedBoard = selectedBoardId ? boards.find((b) => b.id === selectedBoardId) : null
    
    const selectBoardText = selectedBoard
        ? selectedBoard.icon ? `${selectedBoard.icon} ${selectedBoard.title}` : selectedBoard.title
        : intl.formatMessage({
            id: 'PropertyMenu.SelectBoard',
            defaultMessage: 'Select board',
        })

    // 검색 필터링된 보드 목록
    const filteredBoards = useMemo(() => {
        if (!searchQuery.trim()) {
            return boards
        }
        const query = searchQuery.toLowerCase().trim()
        return boards.filter((b) => {
            const title = b.title || ''
            const icon = b.icon || ''
            return title.toLowerCase().includes(query) || icon.toLowerCase().includes(query)
        })
    }, [boards, searchQuery])

    return (
        <Menu>
            <Menu.TextInput
                initialValue={props.propertyName}
                onConfirmValue={(n: string) => {
                    props.onTypeAndNameChanged(props.propertyType, n)
                    currentPropertyName = n
                }}
                onValueChanged={(n: string) => {
                    currentPropertyName = n
                }}
            />
            <Menu.SubMenu
                id='type'
                name={typeMenuTitle(intl, props.propertyType)}
            >
                <PropertyTypes
                    label={intl.formatMessage({id: 'PropertyMenu.changeType', defaultMessage: 'Change property type'})}
                    onTypeSelected={(type: PropertyType) => props.onTypeAndNameChanged(type, currentPropertyName)}
                />
            </Menu.SubMenu>
            {isCardType && props.onBoardSelected && (
                <Menu.SubMenu
                    id='select-board'
                    name={selectBoardText}
                >
                    {loadingBoards ? (
                        <Menu.Label>
                            <span style={{color: 'rgba(var(--center-channel-color-rgb), 0.56)'}}>
                                {intl.formatMessage({id: 'PropertyMenu.Loading', defaultMessage: 'Loading...'})}
                            </span>
                        </Menu.Label>
                    ) : boards.length === 0 ? (
                        <Menu.Label>
                            <span style={{color: 'rgba(var(--center-channel-color-rgb), 0.56)'}}>
                                {intl.formatMessage({id: 'PropertyMenu.NoBoards', defaultMessage: 'No boards available'})}
                            </span>
                        </Menu.Label>
                    ) : (
                        <>
                            <div
                                className='MenuOption LabelOption menu-option'
                                style={{pointerEvents: 'auto', padding: '8px'}}
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className='noicon'/>
                                <div className='menu-name' style={{display: 'flex', alignItems: 'center', gap: '8px', width: '100%'}}>
                                    <SearchIcon/>
                                    <input
                                        ref={searchInputRef}
                                        type='text'
                                        style={{
                                            flex: 1,
                                            border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
                                            borderRadius: '4px',
                                            padding: '4px 8px',
                                            fontSize: '14px',
                                            background: 'rgb(var(--center-channel-bg-rgb))',
                                            color: 'rgb(var(--center-channel-color-rgb))',
                                        }}
                                        placeholder={intl.formatMessage({id: 'PropertyMenu.searchBoards', defaultMessage: 'Search boards...'})}
                                        value={searchQuery}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDownCapture={(e) => e.stopPropagation()}
                                        onKeyUpCapture={(e) => e.stopPropagation()}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className='noicon'/>
                            </div>
                            {filteredBoards.length === 0 ? (
                                <Menu.Label>
                                    <span style={{color: 'rgba(var(--center-channel-color-rgb), 0.56)'}}>
                                        {intl.formatMessage({id: 'PropertyMenu.noBoardsFound', defaultMessage: 'No boards found'})}
                                    </span>
                                </Menu.Label>
                            ) : (
                                filteredBoards.map((b) => (
                                    <Menu.Text
                                        key={`select-board-${b.id}`}
                                        id={`select-board-${b.id}`}
                                        name={b.icon ? `${b.icon} ${b.title}` : b.title}
                                        onClick={() => {
                                            props.onBoardSelected?.(b)
                                            setSearchQuery('')
                                        }}
                                    />
                                ))
                            )}
                        </>
                    )}
                </Menu.SubMenu>
            )}
            {props.onRequiredChanged && !NON_REQUIRED_PROPERTY_TYPES.includes(props.propertyType.type) && (
                <Menu.Switch
                    id='required'
                    name={requiredText}
                    isOn={props.required || false}
                    onClick={() => props.onRequiredChanged?.(!props.required)}
                />
            )}
            <Menu.Separator/>
            <Menu.Text
                id='delete'
                name={deleteText}
                onClick={() => props.onDelete(props.propertyId)}
            />
        </Menu>
    )
}

export default React.memo(PropertyMenu)
