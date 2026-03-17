// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {createContext, ReactElement, ReactNode, useCallback, useContext, useMemo} from 'react'

import {Constants} from '../../constants'

export type ColumnResizeContextType = {
    updateRef: (cardId: string, columnId: string, element: HTMLDivElement | null) => void
    cellRef: (columnId: string) => HTMLDivElement | undefined
    width: (columnId: string) => number
    updateOffset: (columnId: string, offset: number) => void
    updateWidth: (columnId: string, width: number) => void
}

const ColumnResizeContext = createContext<ColumnResizeContextType | null>(null)

export function useColumnResize(): ColumnResizeContextType {
    const context = useContext(ColumnResizeContext)
    if (!context) {
        throw new Error('ColumnResizeContext is not available!')
    }
    return context
}

export type ColumnResizeProviderProps = {
    children: ReactNode
    columnWidths: Record<string, number>
    /** 열별 최소 너비 (미지정 시 minColumnWidth) */
    columnMinWidths?: Record<string, number>
    onResizeColumn: (columnId: string, width: number) => void
}

const getMinWidth = (columnId: string, columnMinWidths?: Record<string, number>): number =>
    columnMinWidths?.[columnId] ?? Constants.minColumnWidth

const columnWidth = (
    columnId: string,
    columnWidths: Record<string, number>,
    offset: number,
    columnMinWidths?: Record<string, number>
): string => {
    const minW = getMinWidth(columnId, columnMinWidths)
    return `${Math.max(minW, (columnWidths[columnId] || 0) + offset)}px`
}

export const ColumnResizeProvider = (props: ColumnResizeProviderProps): ReactElement => {
    const {children, columnWidths, columnMinWidths, onResizeColumn} = props

    type ElementsMap = Map<string, HTMLDivElement>
    const columns = useMemo(() => new Map<string, ElementsMap>(), [])

    const updateWidth = useCallback((columnId: string, elements: ElementsMap, offset: number) => {
        const width = columnWidth(columnId, columnWidths, offset, columnMinWidths)
        for (const element of elements.values()) {
            element.style.width = width
        }
    }, [columnWidths, columnMinWidths])

    const contextValue = useMemo((): ColumnResizeContextType => ({
        updateRef: (cardId, columnId, element) => {
            let elements = columns.get(columnId)
            if (element) {
                if (!elements) {
                    elements = new Map()
                    columns.set(columnId, elements)
                }
                elements.set(cardId, element)
            } else if (elements) {
                elements.delete(cardId)
            }
        },
        cellRef: (columnId): HTMLDivElement | undefined => {
            const iter = columns.get(columnId)?.values()
            if (iter) {
                const {value, done} = iter.next()
                return done ? value : iter.next().value
            }
            return undefined
        },
        width: (columnId) => {
            const minW = getMinWidth(columnId, columnMinWidths)
            return Math.max(minW, (columnWidths[columnId] || 0))
        },
        updateOffset: (columnId, offset) => {
            const elements = columns.get(columnId)
            if (elements) {
                updateWidth(columnId, elements, offset)
            }
        },
        updateWidth: (columnId, width) => {
            onResizeColumn(columnId, width)
        },
    }), [columnWidths, columnMinWidths, onResizeColumn])

    return (
        <ColumnResizeContext.Provider value={contextValue}>
            {children}
        </ColumnResizeContext.Provider>
    )
}
