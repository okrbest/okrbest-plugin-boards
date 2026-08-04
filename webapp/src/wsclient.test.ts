// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {WSClient, MMWebSocketClient} from './wsclient'

// Boards runs inside Mattermost and borrows its websocket. That socket is
// usually connected long before the Boards bundle loads, so anything that waits
// for a "first connect" event waits forever.
//
// The order that matters on a page load landing straight on a board:
//   1. the board page's effect subscribes to its team   (child effect first)
//   2. WithWebSockets initialises the client and opens  (parent effect second)
// Step 1 therefore runs against an uninitialised client and cannot send. Step 2
// has to flush what step 1 registered, or the subscription is never sent and
// the user stops receiving board updates until they reload.

type FakeConn = {readyState: number}

const fakeMMClient = (readyState: number) => {
    const sent: Array<{action: string, data: unknown}> = []
    const firstConnectListeners: Array<() => void> = []

    const client: MMWebSocketClient & {sent: typeof sent, fireFirstConnect: () => void} = {
        conn: {readyState} as unknown as FakeConn as WebSocket,
        sent,
        sendMessage: (action: string, data: unknown) => {
            sent.push({action, data})
        },
        addFirstConnectListener: (cb: () => void) => {
            firstConnectListeners.push(cb)
        },
        addReconnectListener: () => {},
        addErrorListener: () => {},
        addCloseListener: () => {},
        fireFirstConnect: () => firstConnectListeners.forEach((cb) => cb()),
    } as never

    return client
}

const subscribeActions = (client: {sent: Array<{action: string, data: unknown}>}) =>
    client.sent.filter((m) => m.action.endsWith('SUBSCRIBE_TEAM'))

describe('wsclient plugin mode subscriptions', () => {
    test('flushes subscriptions registered before the client was initialised', () => {
        const ws = new WSClient()

        // The board page subscribes first, while the client is still bare.
        ws.subscribeToTeam('team-1')

        const client = fakeMMClient(WebSocket.OPEN)
        ws.initPlugin('focalboard', '1.0.0', client)
        ws.open()

        expect(subscribeActions(client)).toHaveLength(1)
    })

    test('still subscribes when the socket connects after Boards loads', () => {
        const ws = new WSClient()
        ws.subscribeToTeam('team-1')

        const client = fakeMMClient(WebSocket.CONNECTING)
        ws.initPlugin('focalboard', '1.0.0', client)
        ws.open()

        // Nothing to flush yet — the connect event is still coming.
        expect(subscribeActions(client)).toHaveLength(0)

        client.fireFirstConnect()

        expect(subscribeActions(client)).toHaveLength(1)
    })

    test('subscribes for every team a component asked for', () => {
        const ws = new WSClient()
        ws.subscribeToTeam('team-1')
        ws.subscribeToTeam('team-2')

        const client = fakeMMClient(WebSocket.OPEN)
        ws.initPlugin('focalboard', '1.0.0', client)
        ws.open()

        const teams = subscribeActions(client).map((m) => (m.data as {teamId: string}).teamId)
        expect(teams).toEqual(expect.arrayContaining(['team-1', 'team-2']))
    })
})
