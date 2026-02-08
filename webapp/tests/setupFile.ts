// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import crypto from 'crypto'
import {TextEncoder, TextDecoder} from 'util'
import 'isomorphic-fetch'

import React from 'react'
import { jest } from '@jest/globals'
import {useSyncExternalStore} from 'use-sync-external-store/shim'

if (typeof global.TextEncoder === 'undefined') {
    (global as any).TextEncoder = TextEncoder
}
if (typeof global.TextDecoder === 'undefined') {
    (global as any).TextDecoder = TextDecoder
}

// Polyfill useSyncExternalStore for React 17
if (!React.useSyncExternalStore) {
    (React as Record<string, unknown>).useSyncExternalStore = useSyncExternalStore
}

// Polyfill useId for React 17 (required by @hello-pangea/dnd)
let useIdCounter = 0
if (!React.useId) {
    (React as Record<string, unknown>).useId = () => {
        const [id] = React.useState(() => `:r${useIdCounter++}:`)
        return id
    }
}

Object.defineProperty(global, 'crypto', {
    value: {
        getRandomValues: (arr: any) => crypto.randomFillSync(arr),
    },
})

// DOMRect polyfill for BlockSuite tests
if (typeof DOMRect === 'undefined') {
    (global as any).DOMRect = class DOMRect {
        x: number
        y: number
        width: number
        height: number
        top: number
        right: number
        bottom: number
        left: number

        constructor(x = 0, y = 0, width = 0, height = 0) {
            this.x = x
            this.y = y
            this.width = width
            this.height = height
            this.top = y
            this.right = x + width
            this.bottom = y + height
            this.left = x
        }

        static fromRect(rect?: DOMRectInit): DOMRect {
            return new DOMRect(rect?.x, rect?.y, rect?.width, rect?.height)
        }

        toJSON() {
            return {
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
                top: this.top,
                right: this.right,
                bottom: this.bottom,
                left: this.left,
            }
        }
    }
}

// ResizeObserver polyfill for BlockSuite tests
if (typeof ResizeObserver === 'undefined') {
    (global as any).ResizeObserver = class ResizeObserver {
        callback: ResizeObserverCallback

        constructor(callback: ResizeObserverCallback) {
            this.callback = callback
        }

        observe() {
            // no-op
        }

        unobserve() {
            // no-op
        }

        disconnect() {
            // no-op
        }
    }
}

Element.prototype.scrollIntoView = jest.fn()

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
})

jest.mock('../src/webapp_globals', () =>
    Object.assign({}, jest.requireActual('../src/webapp_globals'), {
        messageHtmlToComponent: jest.fn(() =>
            React.createElement('div', { className: 'mocked-message-html' }, 'Test Comment')
        ),
    })
)
