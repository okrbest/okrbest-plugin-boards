// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useRef, useEffect, useLayoutEffect} from 'react'
import {useIntl} from 'react-intl'
import {useNavigate, useParams, useLocation} from 'react-router-dom'

import {Board, IPropertyTemplate} from '../../blocks/board'
import {BoardView, createBoardView, IViewType} from '../../blocks/boardView'
import {Block} from '../../blocks/block'
import {Constants, Permission} from '../../constants'
import mutator from '../../mutator'
import {IDType, Utils} from '../../utils'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'
import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'
import Editable from '../../widgets/editable'
import BoardIcon from '../../widgets/icons/board'
import TableIcon from '../../widgets/icons/table'
import GalleryIcon from '../../widgets/icons/gallery'
import CalendarIcon from '../../widgets/icons/calendar'
import BoardPermissionGate from '../permissions/boardPermissionGate'
import RootPortal from '../rootPortal'

import ViewTab from './viewTab'
import ViewTabMenu from './viewTabMenu'

import './viewTabs.scss'

type Props = {
    board: Board
    activeView: BoardView
    views: BoardView[]
    readonly: boolean
}

const ViewTabs = (props: Props): React.JSX.Element => {
    const {board, activeView, views, readonly} = props
    const intl = useIntl()
    const navigate = useNavigate()
    const params = useParams()
    const location = useLocation()
    const canEditBoardProperties = useHasCurrentBoardPermissions([Permission.ManageBoardProperties])

    const [menuOpen, setMenuOpen] = useState(false)
    const [addMenuOpen, setAddMenuOpen] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)
    const [viewTitle, setViewTitle] = useState(activeView.title)
    const editableRef = useRef<{focus: (selectAll?: boolean) => void}>(null)
    const addMenuRef = useRef<HTMLDivElement>(null)
    const addMenuPortalRef = useRef<HTMLDivElement>(null)
    const activeTabRef = useRef<HTMLDivElement>(null)

    const [tabMenuPos, setTabMenuPos] = useState<{top: number, left: number} | null>(null)
    const [addMenuPos, setAddMenuPos] = useState<{top: number, left: number} | null>(null)

    const updateTabMenuPos = useCallback(() => {
        if (activeTabRef.current) {
            const rect = activeTabRef.current.getBoundingClientRect()
            setTabMenuPos({top: rect.bottom + 4, left: rect.left})
        }
    }, [])

    const updateAddMenuPos = useCallback(() => {
        if (addMenuRef.current) {
            const rect = addMenuRef.current.getBoundingClientRect()
            setAddMenuPos({top: rect.bottom + 8, left: rect.left})
        }
    }, [])

    useLayoutEffect(() => {
        if (menuOpen) {
            updateTabMenuPos()
        } else {
            setTabMenuPos(null)
        }
    }, [menuOpen, updateTabMenuPos])

    useEffect(() => {
        if (!menuOpen) {
            return undefined
        }
        window.addEventListener('scroll', updateTabMenuPos, true)
        window.addEventListener('resize', updateTabMenuPos)
        return () => {
            window.removeEventListener('scroll', updateTabMenuPos, true)
            window.removeEventListener('resize', updateTabMenuPos)
        }
    }, [menuOpen, updateTabMenuPos])

    useLayoutEffect(() => {
        if (addMenuOpen) {
            updateAddMenuPos()
        } else {
            setAddMenuPos(null)
        }
    }, [addMenuOpen, updateAddMenuPos])

    useEffect(() => {
        if (!addMenuOpen) {
            return undefined
        }
        window.addEventListener('scroll', updateAddMenuPos, true)
        window.addEventListener('resize', updateAddMenuPos)
        return () => {
            window.removeEventListener('scroll', updateAddMenuPos, true)
            window.removeEventListener('resize', updateAddMenuPos)
        }
    }, [addMenuOpen, updateAddMenuPos])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            if (
                addMenuRef.current && !addMenuRef.current.contains(target) &&
                (!addMenuPortalRef.current || !addMenuPortalRef.current.contains(target))
            ) {
                setAddMenuOpen(false)
            }
        }
        if (addMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [addMenuOpen])

    const showView = useCallback((viewId: string) => {
        let newPath = Utils.buildBoardPath(location.pathname, {...params, viewId: viewId || ''})
        if (readonly) {
            newPath += `?r=${Utils.getReadToken()}`
        }
        navigate(newPath)
    }, [params, navigate, location.pathname, readonly])

    const handleTabClick = useCallback((viewId: string) => {
        if (viewId === activeView.id) {
            if (!readonly && canEditBoardProperties) {
                setMenuOpen((prev) => !prev)
            }
        } else {
            setMenuOpen(false)
            showView(viewId)
        }
    }, [activeView.id, readonly, canEditBoardProperties, showView])

    const handleRename = useCallback(() => {
        setViewTitle(activeView.title)
        setIsRenaming(true)
        setMenuOpen(false)
    }, [activeView.title])

    useEffect(() => {
        setIsRenaming(false)
        if (activeTabRef.current) {
            activeTabRef.current.scrollIntoView({behavior: 'smooth', inline: 'center', block: 'nearest'})
        }
    }, [activeView.id])

    useEffect(() => {
        if (isRenaming) {
            const frameId = requestAnimationFrame(() => {
                editableRef.current?.focus(true)
            })
            return () => cancelAnimationFrame(frameId)
        }
    }, [isRenaming])

    const handleRenameSave = useCallback(() => {
        mutator.changeBlockTitle(activeView.boardId, activeView.id, activeView.title, viewTitle)
        setIsRenaming(false)
    }, [activeView, viewTitle])

    const handleRenameCancel = useCallback(() => {
        setViewTitle(activeView.title)
        setIsRenaming(false)
    }, [activeView.title])

    const handleDuplicate = useCallback(() => {
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DuplicateBoardView, {board: board.id, view: activeView.id})
        const currentViewId = activeView.id
        const newView = createBoardView(activeView)
        newView.title = `${activeView.title} copy`
        newView.id = Utils.createGuid(IDType.View)
        mutator.insertBlock(
            newView.boardId,
            newView,
            'duplicate view',
            async (block: Block) => {
                setTimeout(() => showView(block.id), 120)
            },
            async () => {
                showView(currentViewId)
            },
        )
        setMenuOpen(false)
    }, [activeView, board.id, showView])

    const handleDelete = useCallback(() => {
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DeleteBoardView, {board: board.id, view: activeView.id})
        const nextView = views.find((o) => o.id !== activeView.id)
        mutator.deleteBlock(activeView, 'delete view')
        if (nextView) {
            showView(nextView.id)
        }
        setMenuOpen(false)
    }, [activeView, views, board.id, showView])

    const handleAddView = useCallback((viewType: IViewType) => {
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.CreateBoardView, {board: board.id, view: activeView.id})
        const view = createBoardView()
        view.boardId = board.id

        switch (viewType) {
        case 'board':
            view.title = intl.formatMessage({id: 'View.NewBoardTitle', defaultMessage: 'Board view'})
            view.fields.viewType = 'board'
            break
        case 'table':
            view.title = intl.formatMessage({id: 'View.NewTableTitle', defaultMessage: 'Table view'})
            view.fields.viewType = 'table'
            view.fields.visiblePropertyIds = board.cardProperties.map((o: IPropertyTemplate) => o.id)
            view.fields.columnWidths = {[Constants.titleColumnId]: Constants.defaultTitleColumnWidth}
            break
        case 'gallery':
            view.title = intl.formatMessage({id: 'View.NewGalleryTitle', defaultMessage: 'Gallery view'})
            view.fields.viewType = 'gallery'
            view.fields.visiblePropertyIds = [Constants.titleColumnId]
            break
        case 'calendar':
            view.title = intl.formatMessage({id: 'View.NewCalendarTitle', defaultMessage: 'Calendar view'})
            view.fields.viewType = 'calendar'
            view.fields.visiblePropertyIds = [Constants.titleColumnId]
            view.fields.dateDisplayPropertyId = board.cardProperties.find((o: IPropertyTemplate) => o.type === 'date')?.id
            break
        }

        const oldViewId = activeView.id
        mutator.insertBlock(
            view.boardId,
            view,
            'add view',
            async (block: Block) => {
                setTimeout(() => showView(block.id), 120)
            },
            async () => {
                showView(oldViewId)
            },
        )
        setAddMenuOpen(false)
    }, [board, activeView.id, intl, showView])

    return (
        <div className='ViewTabs'>
            {views.map((view) => {
                const isActive = view.id === activeView.id
                if (isActive && isRenaming) {
                    return (
                        <div
                            key={view.id}
                            ref={activeTabRef}
                            className='ViewTab ViewTab--active ViewTab__editable'
                        >
                            <Editable
                                ref={editableRef}
                                value={viewTitle}
                                onChange={setViewTitle}
                                onSave={handleRenameSave}
                                onCancel={handleRenameCancel}
                                saveOnEsc={false}
                            />
                        </div>
                    )
                }
                return (
                    <div
                        key={view.id}
                        ref={isActive ? activeTabRef : undefined}
                    >
                        <ViewTab
                            view={view}
                            isActive={isActive}
                            readonly={readonly}
                            onClick={() => handleTabClick(view.id)}
                        />
                    </div>
                )
            })}

            {menuOpen && tabMenuPos && (
                <RootPortal>
                    <div
                        className='ViewTabs__tabMenuPortal'
                        style={{
                            position: 'fixed',
                            top: tabMenuPos.top,
                            left: tabMenuPos.left,
                            zIndex: 1000,
                        }}
                    >
                        <ViewTabMenu
                            onRename={handleRename}
                            onDuplicate={handleDuplicate}
                            onDelete={handleDelete}
                            onClose={() => setMenuOpen(false)}
                            canDelete={views.length > 1}
                        />
                    </div>
                </RootPortal>
            )}

            {!readonly && (
                <BoardPermissionGate permissions={[Permission.ManageBoardProperties]}>
                    <div
                        className='ViewTabs__addMenu'
                        ref={addMenuRef}
                    >
                        <div
                            className='ViewTabs__addButton'
                            onClick={() => setAddMenuOpen((prev) => !prev)}
                        >
                            {'+'}
                        </div>
                    </div>
                </BoardPermissionGate>
            )}

            {addMenuOpen && addMenuPos && (
                <RootPortal>
                    <div
                        ref={addMenuPortalRef}
                        className='ViewTabs__addViewPortal'
                        style={{
                            position: 'fixed',
                            top: addMenuPos.top,
                            left: addMenuPos.left,
                            zIndex: 1000,
                        }}
                    >
                        <div className='AddViewMenu'>
                            <div className='AddViewMenu__header'>
                                {intl.formatMessage({id: 'View.NewView', defaultMessage: 'Add new view'})}
                            </div>
                            <div
                                className='AddViewMenu__item'
                                onClick={() => handleAddView('table')}
                            >
                                <span className='AddViewMenu__icon'><TableIcon/></span>
                                <span>{intl.formatMessage({id: 'View.Table', defaultMessage: 'Table'})}</span>
                            </div>
                            <div
                                className='AddViewMenu__item'
                                onClick={() => handleAddView('board')}
                            >
                                <span className='AddViewMenu__icon'><BoardIcon/></span>
                                <span>{intl.formatMessage({id: 'View.Board', defaultMessage: 'Board'})}</span>
                            </div>
                            <div
                                className='AddViewMenu__item'
                                onClick={() => handleAddView('gallery')}
                            >
                                <span className='AddViewMenu__icon'><GalleryIcon/></span>
                                <span>{intl.formatMessage({id: 'View.Gallery', defaultMessage: 'Gallery'})}</span>
                            </div>
                            <div
                                className='AddViewMenu__item'
                                onClick={() => handleAddView('calendar')}
                            >
                                <span className='AddViewMenu__icon'><CalendarIcon/></span>
                                <span>{intl.formatMessage({id: 'View.Calendar', defaultMessage: 'Calendar'})}</span>
                            </div>
                        </div>
                    </div>
                </RootPortal>
            )}
        </div>
    )
}

export default React.memo(ViewTabs)
