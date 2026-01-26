// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import crypto from 'crypto'
import 'isomorphic-fetch'

import React from 'react'
import { jest } from '@jest/globals'

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

jest.mock('../src/webapp_globals', () =>
    Object.assign({}, jest.requireActual('../src/webapp_globals'), {
        messageHtmlToComponent: jest.fn(() =>
            React.createElement('div', { className: 'mocked-message-html' }, 'Test Comment')
        ),
    })
)
