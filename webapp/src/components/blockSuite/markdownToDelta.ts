// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

interface DeltaAttributes {
    bold?: true
    italic?: true
    strike?: true
    code?: true
    link?: string
}

interface DeltaOp {
    insert: string
    attributes?: DeltaAttributes
}

type TokenType = 'text' | 'bold' | 'italic' | 'strike' | 'code' | 'link'

interface Token {
    type: TokenType
    content: string
    url?: string
}

const PATTERNS = {
    link: /^\[([^\]]+)\]\(([^)]+)\)/,
    bold: /^\*\*(.+?)\*\*/,
    boldAlt: /^__(.+?)__/,
    strike: /^~~(.+?)~~/,
    code: /^`([^`]+)`/,
    italic: /^\*([^*]+)\*/,
    italicAlt: /^_([^_]+)_/,
}

function tokenize(text: string): Token[] {
    const tokens: Token[] = []
    let remaining = text
    let i = 0

    while (i < remaining.length) {
        const slice = remaining.slice(i)

        const linkMatch = slice.match(PATTERNS.link)
        if (linkMatch) {
            if (i > 0) {
                tokens.push({type: 'text', content: remaining.slice(0, i)})
            }
            tokens.push({type: 'link', content: linkMatch[1], url: linkMatch[2]})
            remaining = remaining.slice(i + linkMatch[0].length)
            i = 0
            continue
        }

        const boldMatch = slice.match(PATTERNS.bold) || slice.match(PATTERNS.boldAlt)
        if (boldMatch) {
            if (i > 0) {
                tokens.push({type: 'text', content: remaining.slice(0, i)})
            }
            tokens.push({type: 'bold', content: boldMatch[1]})
            remaining = remaining.slice(i + boldMatch[0].length)
            i = 0
            continue
        }

        const strikeMatch = slice.match(PATTERNS.strike)
        if (strikeMatch) {
            if (i > 0) {
                tokens.push({type: 'text', content: remaining.slice(0, i)})
            }
            tokens.push({type: 'strike', content: strikeMatch[1]})
            remaining = remaining.slice(i + strikeMatch[0].length)
            i = 0
            continue
        }

        const codeMatch = slice.match(PATTERNS.code)
        if (codeMatch) {
            if (i > 0) {
                tokens.push({type: 'text', content: remaining.slice(0, i)})
            }
            tokens.push({type: 'code', content: codeMatch[1]})
            remaining = remaining.slice(i + codeMatch[0].length)
            i = 0
            continue
        }

        const italicMatch = slice.match(PATTERNS.italic) || slice.match(PATTERNS.italicAlt)
        if (italicMatch) {
            const char = remaining[i]
            const nextChar = remaining[i + 1]
            const isNotBoldSyntax = !(char === '*' && nextChar === '*') && !(char === '_' && nextChar === '_')
            if (isNotBoldSyntax) {
                if (i > 0) {
                    tokens.push({type: 'text', content: remaining.slice(0, i)})
                }
                tokens.push({type: 'italic', content: italicMatch[1]})
                remaining = remaining.slice(i + italicMatch[0].length)
                i = 0
                continue
            }
        }

        i++
    }

    if (remaining.length > 0) {
        tokens.push({type: 'text', content: remaining})
    }

    return tokens
}

function tokensToDelta(tokens: Token[]): DeltaOp[] {
    const delta: DeltaOp[] = []

    for (const token of tokens) {
        if (token.content.length === 0) {
            continue
        }

        switch (token.type) {
        case 'text':
            delta.push({insert: token.content})
            break
        case 'bold':
            delta.push({insert: token.content, attributes: {bold: true}})
            break
        case 'italic':
            delta.push({insert: token.content, attributes: {italic: true}})
            break
        case 'strike':
            delta.push({insert: token.content, attributes: {strike: true}})
            break
        case 'code':
            delta.push({insert: token.content, attributes: {code: true}})
            break
        case 'link':
            delta.push({insert: token.content, attributes: {link: token.url}})
            break
        }
    }

    return delta
}

export function parseMarkdownToDelta(text: string): DeltaOp[] {
    if (!text || text.length === 0) {
        return []
    }

    const tokens = tokenize(text)
    return tokensToDelta(tokens)
}

export function hasMarkdownSyntax(text: string): boolean {
    if (!text) {
        return false
    }

    return /\*\*.+?\*\*/.test(text) ||
           /__.+?__/.test(text) ||
           /\*[^*]+\*/.test(text) ||
           /_[^_]+_/.test(text) ||
           /~~.+?~~/.test(text) ||
           /`.+?`/.test(text) ||
           /\[.+?\]\(.+?\)/.test(text)
}

export type {DeltaOp, DeltaAttributes}
