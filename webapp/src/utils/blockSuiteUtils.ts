// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { Doc, DocCollection, Job, Text } from '@blocksuite/store'
import { diffLines } from 'diff'

import octoClient from '../octoClient'
import { Block } from '../blocks/block'
import { Card } from '../blocks/card'

/**
 * 문자열을 BlockSuite Text 객체로 변환
 */
export function stringToText(str: string): Text {
    if (!str) {
        return new Text()
    }
    return new Text(str)
}

/**
 * 이미지 URL 생성 (Mattermost 파일 API 사용)
 * BlockSuite 이미지 블록에서 사용할 URL을 생성합니다.
 */
export function getImageUrl(boardId: string, fileId: string): string {
    // getBaseURL은 private이므로 타입 단언 사용
    const baseUrl = (octoClient as any).getBaseURL() || ''
    // teamId는 octoClient의 public 속성
    const teamId = (octoClient as any).teamId || '0'
    // 파일 URL 패턴: /api/v2/files/teams/{teamId}/{boardId}/{fileId}
    return `${baseUrl}/api/v2/files/teams/${teamId}/${boardId}/${fileId}`
}

/**
 * 문서를 JSON 스냅샷으로 저장
 */
export async function saveSnapshot(doc: Doc): Promise<any> {
    const job = new Job({ collection: doc.collection })
    return await job.docToSnapshot(doc)
}

/**
 * 이미지 파일 업로드 및 BlockSuite 이미지 블록 생성
 */
export async function uploadImageToBlockSuite(
    boardId: string,
    file: File,
    doc: Doc,
    parentId: string
): Promise<string | null> {
    try {
        console.log('[Image] Uploading image using BlobEngine...')
        
        // Doc 또는 Collection의 blobSync 사용
        const blobSync = (doc as any).blobSync || doc.collection.blobSync
        
        if (!blobSync) {
            console.error('[Image] BlobSync not available')
            return null
        }

        // BlobEngine을 통해 업로드 (MattermostBlobEngine.set 호출)
        // 반환값은 fileId (blobId)
        const blobId = await blobSync.set(file)
        console.log('[Image] Image uploaded via BlobEngine, blobId:', blobId)

        if (!blobId) {
            console.error('[Image] Failed to get blobId from BlobEngine')
            return null
        }

        // 이미지 크기 정보 가져오기 (선택사항)
        const imageSize = await getImageSize(file)
        
        // BlockSuite 이미지 블록 생성
        const imageBlockId = doc.addBlock('affine:image' as any, {
            sourceId: blobId,
            filename: file.name,
            width: imageSize.width || 0,
            height: imageSize.height || 0,
        } as any, parentId)

        return imageBlockId
    } catch (error) {
        console.error('Failed to upload image to BlockSuite', error)
        return null
    }
}

/**
 * 이미지 파일 크기 가져오기
 */
function getImageSize(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        
        img.onload = () => {
            URL.revokeObjectURL(url)
            resolve({ width: img.width, height: img.height })
        }
        
        img.onerror = () => {
            URL.revokeObjectURL(url)
            resolve({ width: 0, height: 0 })
        }
        
        img.src = url
    })
}

/**
 * Collection에 데이터를 로드하여 Doc을 반환
 * 에디터 마운트 전에 호출하여 올바른 Y.js 구조 생성
 */
export async function loadDataIntoCollection(card: Card, collection: DocCollection): Promise<Doc> {
    console.log('[BlockSuite] ====== loadDataIntoCollection START ======')
    console.log('[BlockSuite] Card ID:', card.id)
    console.log('[BlockSuite] Board ID:', card.boardId)

    try {
        // 1. 서버에서 BlockSuite 정보 확인
        const info = await octoClient.getBlockSuiteInfo(card.id)
        console.log('[BlockSuite] getBlockSuiteInfo result:', info)

        if (info) {
            // 2. 콘텐츠 로드
            const content = await octoClient.getBlockSuiteContent(card.id)
            console.log('[BlockSuite] Content type:', typeof content)

            if (content) {
                let snapshot: any = content
                if (typeof content === 'string') {
                    snapshot = JSON.parse(content)
                }

                if (snapshot && typeof snapshot === 'object' && snapshot.blocks) {
                    const hasContent = checkSnapshotHasContent(snapshot)
                    console.log('[BlockSuite] Has real content?', hasContent)

                    if (hasContent) {
                        // Job을 사용하여 스냅샷에서 Doc 생성
                        console.log('[BlockSuite] Loading snapshot using Job.snapshotToDoc...')
                        const job = new Job({ collection })
                        const loadedDoc = await job.snapshotToDoc(snapshot)
                        
                        if (loadedDoc) {
                            console.log('[BlockSuite] ✅ Snapshot loaded successfully')
                            return loadedDoc
                        }
                    }
                }
            }
        }

        // 3. 스냅샷이 없거나 빈 경우: 레거시 마이그레이션 시도 또는 빈 문서 생성
        console.log('[BlockSuite] No valid snapshot, attempting migration or creating empty doc...')
        return await createDocWithMigration(card, collection)

    } catch (error) {
        console.error('[BlockSuite] ❌ Error in loadDataIntoCollection:', error)
        // 오류 발생 시 빈 문서 생성
        return createEmptyDoc(card.id, collection)
    }
}

/**
 * 레거시 블록에서 마이그레이션하거나 빈 문서 생성
 */
async function createDocWithMigration(card: Card, collection: DocCollection): Promise<Doc> {
    try {
        // 레거시 블록 확인
        const allBlocks = await octoClient.getAllBlocks(card.boardId)
        const legacyBlocks = allBlocks.filter(block => block.parentId === card.id)
        
        if (legacyBlocks && legacyBlocks.length > 0) {
            console.log('[BlockSuite] Found', legacyBlocks.length, 'legacy blocks, migrating...')
            
            // 빈 문서 생성 후 블록 변환
            const doc = createEmptyDoc(card.id, collection)
            await convertAndApplyBlocks(legacyBlocks, card, doc)
            
            // 저장
            const snapshot = await saveSnapshot(doc)
            await octoClient.saveBlockSuiteContent(card.id, snapshot)
            console.log('[BlockSuite] ✅ Migration completed')
            
            return doc
        }
    } catch (error) {
        console.warn('[BlockSuite] Migration failed:', error)
    }

    // 마이그레이션 실패 또는 레거시 블록 없음 - 빈 문서 생성
    return createEmptyDoc(card.id, collection)
}

/**
 * 빈 문서 생성 (기본 페이지 구조 포함)
 */
function createEmptyDoc(cardId: string, collection: DocCollection): Doc {
    console.log('[BlockSuite] Creating empty doc with ID:', cardId)
    const doc = collection.createDoc({ id: cardId })
    doc.load(() => {
        // 기본 페이지 구조 생성
        const pageBlockId = doc.addBlock('affine:page' as any, {})
        doc.addBlock('affine:surface' as any, {}, pageBlockId)
        const noteId = doc.addBlock('affine:note' as any, {}, pageBlockId)
        doc.addBlock('affine:paragraph' as any, {}, noteId)
    })
    console.log('[BlockSuite] Empty doc created')
    return doc
}

/**
 * DocSnapshot에서 검색용 plain text 추출
 * @param snapshot BlockSuite DocSnapshot
 * @returns 추출된 plain text (줄바꿈으로 구분)
 */
export function extractTextFromSnapshot(snapshot: any): string {
    const texts: string[] = []

    function extractFromBlock(block: any): void {
        // affine:paragraph, affine:list 등의 텍스트 추출
        if (block.props?.text) {
            const textProp = block.props.text
            if (textProp.delta && Array.isArray(textProp.delta)) {
                const blockTexts: string[] = []
                for (const op of textProp.delta) {
                    let text = op.insert || ''
                    if (typeof text !== 'string') {
                        continue
                    }

                    if (op.attributes) {
                        if (op.attributes.bold) text = `*${text}*`
                        if (op.attributes.italic) text = `_${text}_`
                        if (op.attributes.strike) text = `~${text}~`
                        if (op.attributes.code) text = `\`${text}\``
                        if (op.attributes.link) text = `[${text}](${op.attributes.link})`
                    }
                    blockTexts.push(text)
                }
                const fullText = blockTexts.join('')
                if (fullText.trim()) {
                    texts.push(fullText)
                }
            }
        }

        // children 재귀 처리
        // 1. blocks.children 배열 (Job-style snapshot)
        if (block.blocks && block.blocks.children && Array.isArray(block.blocks.children)) {
            for (const child of block.blocks.children) {
                extractFromBlock(child)
            }
        }
        // 2. 직접 children 배열 (BlockSnapshot)
        else if (block.children && Array.isArray(block.children)) {
            for (const child of block.children) {
                extractFromBlock(child)
            }
        }
        // 3. blocks 배열 (루트)
        else if (block.blocks && Array.isArray(block.blocks)) {
            for (const child of block.blocks) {
                extractFromBlock(child)
            }
        }

        // 이미지 블록 처리
        if (block.flavour === 'affine:image') {
            const filename = block.props?.filename || block.props?.name || ''
            texts.push(filename ? `[이미지: ${filename}]` : '[이미지]')
        }
        // 첨부파일 블록 처리
        else if (block.flavour === 'affine:attachment') {
            const filename = block.props?.name || block.props?.filename || ''
            texts.push(filename ? `[파일: ${filename}]` : '[파일]')
        }
        // 링크/유튜브/북마크 처리
        else if (block.flavour === 'affine:embed' || block.flavour === 'affine:bookmark') {
            const url = block.props?.url || ''
            const title = block.props?.title || ''
            const type = block.props?.type || 'link' // video, link, etc.
            
            // title이 객체(Y.Text)인 경우 처리
            let titleStr = ''
            if (typeof title === 'string') {
                titleStr = title
            } else if (title && typeof title === 'object') {
                // Y.Text 객체인 경우 toString() 사용
                // 또는 BlockSuite Text 객체라면 .toString()이 텍스트 반환
                titleStr = title.toString()
            }

            if (type === 'video' || url.includes('youtube') || url.includes('youtu.be')) {
                texts.push(`[동영상: ${titleStr || url}]`)
            } else {
                texts.push(`[링크: ${titleStr || url}]`)
            }
        }
        // 테이블/칸반 등 데이터베이스 뷰
        else if (block.flavour === 'affine:database' || block.flavour === 'affine:kanban') {
            const title = block.props?.title
            let titleStr = '데이터베이스'
            
            if (typeof title === 'string' && title) {
                titleStr = title
            } else if (title && typeof title === 'object') {
                // Y.Text 객체 처리
                titleStr = title.toString() || '데이터베이스'
            }
            
            if (titleStr === '[object Object]') {
                titleStr = '데이터베이스'
            }

            texts.push(`[${titleStr}]`)
        }
        // 단순 테이블
        else if (block.flavour === 'affine:table') {
            texts.push('[표]')
        }
    }

    if (snapshot) {
        extractFromBlock(snapshot)
    }

    return texts.join('\n')
}

/**
 * 두 텍스트 간의 변경 사항을 요약하여 반환
 * @param oldText 변경 전 텍스트
 * @param newText 변경 후 텍스트
 * @param maxLength 최대 길이 (기본값 300)
 * @returns 변경 요약 문자열 (변경 없으면 빈 문자열)
 */
export function formatDiffSummary(oldText: string, newText: string, maxLength = 300): string {
    if (oldText === newText) {
        return ''
    }

    const changes = diffLines(oldText, newText)
    const parts: string[] = []

    for (const change of changes) {
        // 공백만 있는 변경은 무시할 수도 있지만, 일단은 포함
        const lines = change.value.trim()
        if (!lines) {
            continue
        }

        if (change.added) {
            parts.push(`[추가] ${lines}`)
        } else if (change.removed) {
            parts.push(`[삭제] ${lines}`)
        }
    }

    if (parts.length === 0) {
        return ''
    }

    const summary = parts.join('\n')
    if (summary.length > maxLength) {
        return summary.substring(0, maxLength) + '...'
    }
    return summary
}

// 이전 loadData 함수는 하위 호환성을 위해 유지 (deprecated)
export async function loadData(card: Card, doc: Doc): Promise<Doc> {
    console.log('[BlockSuite Migration] ====== loadData START ======')
    console.log('[BlockSuite Migration] Card ID:', card.id)
    console.log('[BlockSuite Migration] Board ID:', card.boardId)
    console.log('[BlockSuite Migration] Card title:', card.title)

    try {
        console.log('[BlockSuite Migration] Step 1: Calling getBlockSuiteInfo...')
        const info = await octoClient.getBlockSuiteInfo(card.id)
        console.log('[BlockSuite Migration] getBlockSuiteInfo result:', info)

        if (info) {
            console.log('[BlockSuite Migration] Step 2: BlockSuite info exists, fetching content...')
            const content = await octoClient.getBlockSuiteContent(card.id)
            console.log('[BlockSuite Migration] Content type:', typeof content, 'Instance:', content instanceof ArrayBuffer)
            console.log('[BlockSuite Migration] Content value:', content)

            // content가 null이거나 빈 값이면 마이그레이션 시도
            if (!content) {
                console.log('[BlockSuite Migration] ⚠️ Content is null/empty despite info existing - attempting migration')
                return await attemptMigration(card, doc)
            }

            if (content) {
                try {
                    // JSON 스냅샷으로 복원 시도
                    let snapshot: any = content

                    // content가 이미 객체인 경우 (서버가 JSON으로 응답)
                    if (typeof content === 'object' && !(content instanceof ArrayBuffer)) {
                        console.log('[BlockSuite Migration] Content is already an object (JSON response)')
                        snapshot = content
                    } else if (typeof content === 'string') {
                        console.log('[BlockSuite Migration] Parsing string content...')
                        snapshot = JSON.parse(content)
                    } else if (content instanceof ArrayBuffer) {
                        console.log('[BlockSuite Migration] Decoding ArrayBuffer...')
                        // ArrayBuffer를 텍스트로 변환 시도 (만약 JSON이 바이너리로 왔다면)
                        const decoder = new TextDecoder()
                        const jsonStr = decoder.decode(content)
                        console.log('[BlockSuite Migration] Decoded string length:', jsonStr.length)
                        console.log('[BlockSuite Migration] First 200 chars:', jsonStr.substring(0, 200))
                        try {
                            snapshot = JSON.parse(jsonStr)
                        } catch (e) {
                            console.warn('[BlockSuite Migration] Failed to parse ArrayBuffer as JSON, ignoring content', e)
                            snapshot = null
                        }
                    }

                    if (snapshot && typeof snapshot === 'object') {
                        console.log('[BlockSuite Migration] Snapshot parsed successfully, checking content...')
                        console.log('[BlockSuite Migration] Snapshot keys:', Object.keys(snapshot))
                        console.log('[BlockSuite Migration] Snapshot blocks count:', snapshot.blocks?.length || 0)

                        // 스냅샷에 실제 콘텐츠가 있는지 확인
                        // 기본 구조만 있는 경우(빈 paragraph만 있는 경우) 마이그레이션 시도
                        const hasRealContent = checkSnapshotHasContent(snapshot)
                        console.log('[BlockSuite Migration] Has real content?', hasRealContent)

                        if (hasRealContent) {
                            console.log('[BlockSuite Migration] Loading existing snapshot into current doc...')

                            try {
                                // 기존 doc의 블록을 모두 제거하고 스냅샷에서 로드
                                await loadSnapshotIntoDoc(doc, snapshot)
                                console.log('[BlockSuite Migration] Snapshot loaded successfully into existing doc')
                                return doc
                            } catch (error) {
                                console.error('[BlockSuite Migration] Failed to load from snapshot, falling back to migration', error)
                                // 스냅샷 로드 실패 시 마이그레이션으로 fallback
                                return await attemptMigration(card, doc)
                            }
                        } else {
                            console.log('[BlockSuite Migration] ⚠️ BlockSuite snapshot is empty, attempting migration from legacy blocks')
                            // 기존 블록에서 마이그레이션 시도
                            return await attemptMigration(card, doc)
                        }
                    } else {
                        console.log('[BlockSuite Migration] ⚠️ Snapshot is null or not an object, initializing empty page')
                    }
                } catch (error) {
                    console.error('[BlockSuite Migration] ❌ Failed to load snapshot:', error)
                    await initEmptyPage(doc)
                }
            } else {
                console.log('[BlockSuite Migration] ⚠️ No content returned, initializing empty page')
                await initEmptyPage(doc)
            }
        } else {
            console.log('[BlockSuite Migration] Step 2: No BlockSuite info found - attempting migration from legacy blocks')
            // 마이그레이션: 기존 블록 가져오기
            return await attemptMigration(card, doc)
        }
    } catch (e) {
        console.error('[BlockSuite Migration] ❌ CRITICAL ERROR in loadData:', e)
        if (e instanceof Error) {
            console.error('[BlockSuite Migration] Error stack:', e.stack)
        }
    }
    console.log('[BlockSuite Migration] ====== loadData END (returning doc) ======')
    return doc
}

/**
 * 스냅샷을 기존 doc에 로드 (doc 교체 없이)
 * 기존 블록을 모두 제거하고 스냅샷의 블록들을 추가
 */
async function loadSnapshotIntoDoc(doc: Doc, snapshot: any): Promise<void> {
    console.log('[LoadSnapshot] Loading snapshot into existing doc...')

    // Job-style 스냅샷 구조: { type: 'page', meta: {...}, blocks: { children: [...] } }
    const rootBlock = snapshot.blocks
    if (!rootBlock || !rootBlock.children) {
        console.warn('[LoadSnapshot] Invalid snapshot structure, initializing empty page')
        await initEmptyPage(doc)
        return
    }

    // 기존 블록 모두 제거
    try {
        const existingBlocks = doc.getBlocks()
        console.log('[LoadSnapshot] Removing', existingBlocks.length, 'existing blocks')
        for (const block of existingBlocks) {
            if (block.flavour === 'affine:page') {
                try {
                    doc.deleteBlock(block)
                } catch (e) {
                    // 이미 삭제되었거나 삭제 불가한 경우 무시
                }
            }
        }
    } catch (e) {
        console.warn('[LoadSnapshot] Failed to clear existing blocks:', e)
    }

    // 스냅샷에서 블록 구조 복원
    const pageBlock = rootBlock
    console.log('[LoadSnapshot] Page block flavour:', pageBlock.flavour)

    // 1. page 블록 생성
    const pageId = doc.addBlock('affine:page' as any, pageBlock.props || {})
    console.log('[LoadSnapshot] Created page:', pageId)

    // 2. children (surface, note 등) 추가
    if (pageBlock.children && Array.isArray(pageBlock.children)) {
        for (const child of pageBlock.children) {
            await addBlockFromSnapshot(doc, child, pageId)
        }
    }

    console.log('[LoadSnapshot] Snapshot loaded successfully')
}

/**
 * 스냅샷의 블록을 재귀적으로 추가
 */
async function addBlockFromSnapshot(doc: Doc, blockData: any, parentId: string): Promise<void> {
    const { flavour, props, children } = blockData

    // props에서 text 처리 (delta 형식을 Text 객체로 변환)
    const processedProps = { ...props }
    if (props?.text && props.text.delta) {
        const textContent = props.text.delta
            .map((op: any) => op.insert || '')
            .join('')
        processedProps.text = new Text(textContent)

        // delta에 스타일 정보가 있으면 적용
        let offset = 0
        for (const op of props.text.delta) {
            if (op.attributes && op.insert) {
                const length = op.insert.length
                // Text 객체에 스타일 적용 (가능한 경우)
                // BlockSuite Text API에 따라 format 메서드 사용
                try {
                    if (op.attributes.bold) {
                        processedProps.text.format(offset, length, { bold: true })
                    }
                    if (op.attributes.italic) {
                        processedProps.text.format(offset, length, { italic: true })
                    }
                    if (op.attributes.underline) {
                        processedProps.text.format(offset, length, { underline: true })
                    }
                    if (op.attributes.strike) {
                        processedProps.text.format(offset, length, { strike: true })
                    }
                    if (op.attributes.code) {
                        processedProps.text.format(offset, length, { code: true })
                    }
                    if (op.attributes.link) {
                        processedProps.text.format(offset, length, { link: op.attributes.link })
                    }
                } catch (e) {
                    // format 실패 시 무시 (텍스트는 유지)
                }
                offset += length
            } else if (op.insert) {
                offset += op.insert.length
            }
        }
    }

    // 블록 추가
    try {
        const blockId = doc.addBlock(flavour as any, processedProps as any, parentId)

        // children 재귀 추가
        if (children && Array.isArray(children)) {
            for (const child of children) {
                await addBlockFromSnapshot(doc, child, blockId)
            }
        }
    } catch (e) {
        console.warn(`[LoadSnapshot] Failed to add block ${flavour}:`, e)
    }
}

/**
 * 스냅샷에 실제 콘텐츠가 있는지 확인
 * 기본 구조(빈 paragraph)만 있으면 false 반환
 */
export function checkSnapshotHasContent(snapshot: any): boolean {
    console.log('[Content Check] Checking snapshot for real content...')
    console.log('[Content Check] Snapshot structure:', snapshot)
    try {
        // BlockSuite Job의 스냅샷 구조:
        // { type: 'page', meta: {...}, blocks: { children: [...] } }
        // 실제 블록들은 blocks.children 배열에 있음
        let blocks: any[] = []

        if (Array.isArray(snapshot?.blocks)) {
            blocks = snapshot.blocks
        } else if (snapshot?.blocks?.children && Array.isArray(snapshot.blocks.children)) {
            // Job 형식: blocks는 루트 블록 객체이고, 실제 블록들은 children에 있음
            console.log('[Content Check] Found Job-style snapshot with blocks.children')
            blocks = snapshot.blocks.children

            // affine:note의 children에 실제 콘텐츠가 있음
            const noteBlock = blocks.find((b: any) => b.flavour === 'affine:note')
            if (noteBlock?.children && Array.isArray(noteBlock.children)) {
                console.log('[Content Check] Found note block with children:', noteBlock.children.length)
                blocks = noteBlock.children
            }
        } else if (snapshot?.blocks && typeof snapshot.blocks === 'object') {
            // blocks가 객체 형태로 저장된 경우
            console.log('[Content Check] Blocks is an object, converting to array...')
            blocks = Object.values(snapshot.blocks)
        }

        console.log('[Content Check] Total blocks in snapshot:', blocks.length)

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i]
            console.log(`[Content Check] Block ${i}: flavour=${block.flavour}, id=${block.id}`)

            // paragraph 블록에 실제 텍스트가 있는지 확인
            if (block.flavour === 'affine:paragraph' || block.flavour === 'affine:list') {
                const text = block.props?.text
                if (text && typeof text === 'object') {
                    // Y.Text 형식의 텍스트 확인
                    const delta = text.delta || []
                    console.log(`[Content Check]   Text delta length: ${delta.length}`)
                    if (delta.length > 0) {
                        console.log(`[Content Check]   First delta:`, delta[0])
                    }
                    const hasText = delta.some((op: any) => op.insert && op.insert.trim() !== '')
                    if (hasText) {
                        console.log('[Content Check] ✅ Found real text content')
                        return true
                    }
                } else {
                    console.log(`[Content Check]   No text or text is not an object (type: ${typeof text})`)
                }
            }

            // 다른 콘텐츠 블록들 (이미지, 첨부파일 등)
            if (block.flavour === 'affine:image' ||
                block.flavour === 'affine:attachment' ||
                block.flavour === 'affine:divider') {
                console.log('[Content Check] ✅ Found content block:', block.flavour)
                return true
            }

            // 중첩된 블록 확인 (재귀)
            if (block.children && block.children.length > 0) {
                console.log(`[Content Check]   Block has ${block.children.length} children, checking recursively...`)
                const childSnapshot = { blocks: block.children }
                if (checkSnapshotHasContent(childSnapshot)) {
                    console.log('[Content Check] ✅ Found content in children')
                    return true
                }
            }
        }

        console.log('[Content Check] ❌ No real content found in snapshot')
        return false
    } catch (e) {
        console.warn('[Content Check] ⚠️ Failed to check snapshot content', e)
        return true // 확인 실패 시 콘텐츠가 있다고 가정
    }
}

/**
 * 기존 블록에서 BlockSuite로 마이그레이션 시도
 */
async function attemptMigration(card: Card, doc: Doc): Promise<Doc> {
    console.log('[Migration] ====== attemptMigration START ======')
    console.log('[Migration] Card ID:', card.id)
    console.log('[Migration] Board ID:', card.boardId)

    try {
        // boardId로 모든 블록을 조회한 후 parentId가 cardId인 블록만 필터링
        console.log('[Migration] Step 1: Calling getAllBlocks for board:', card.boardId)
        const allBlocks = await octoClient.getAllBlocks(card.boardId)
        console.log('[Migration] getAllBlocks returned:', allBlocks?.length || 0, 'blocks')

        if (allBlocks && allBlocks.length > 0) {
            console.log('[Migration] Sample block types:', allBlocks.slice(0, 5).map(b => ({ id: b.id, type: b.type, parentId: b.parentId })))
        }

        const legacyBlocks = allBlocks.filter(block => block.parentId === card.id)
        console.log('[Migration] Filtered legacy blocks:', legacyBlocks.length, 'blocks with parentId =', card.id)

        if (legacyBlocks && legacyBlocks.length > 0) {
            console.log('[Migration] Legacy blocks details:')
            legacyBlocks.forEach((block, idx) => {
                console.log(`[Migration]   [${idx}] ID: ${block.id}, Type: ${block.type}, Title: ${block.title?.substring(0, 50) || '(no title)'}`)
            })

            console.log('[Migration] Step 2: Converting and applying blocks...')
            await convertAndApplyBlocks(legacyBlocks, card, doc)
            console.log('[Migration] Blocks converted successfully')
        } else {
            console.log('[Migration] ⚠️ No legacy blocks found, initializing empty page')
            // 블록이 없는 경우에도 기본 페이지 구조는 생성해야 함
            await initEmptyPage(doc)
        }

        // 자동 저장
        console.log('[Migration] Step 3: Saving snapshot to server...')
        const snapshot = await saveSnapshot(doc)
        console.log('[Migration] Snapshot size:', JSON.stringify(snapshot).length, 'bytes')
        await octoClient.saveBlockSuiteContent(card.id, snapshot)
        console.log('[Migration] ✅ Migration completed and saved successfully')

        return doc
    } catch (error) {
        console.error('[Migration] ❌ CRITICAL ERROR in attemptMigration:', error)
        if (error instanceof Error) {
            console.error('[Migration] Error stack:', error.stack)
        }
        // 에러 발생 시에도 기본 페이지는 생성
        await initEmptyPage(doc)
        throw error
    } finally {
        console.log('[Migration] ====== attemptMigration END ======')
    }
}

async function initEmptyPage(doc: Doc): Promise<void> {
    // createEmptyDoc()으로 생성된 doc은 이미 기본 구조가 있음
    // getBlocks()를 안전하게 호출하여 확인
    try {
        const blocks = doc.getBlocks()
        if (blocks && blocks.length > 0) {
            return // 이미 블록이 있음
        }
    } catch (error) {
        // getBlocks() 실패 - Yjs 문서가 아직 준비되지 않음
        // createEmptyDoc().init()을 사용하면 이 경우가 발생하지 않아야 함
        console.warn('getBlocks() failed, doc may not be fully initialized:', error)
    }

    // 블록이 없거나 확인 실패 시 기본 구조 생성 시도
    try {
        const pageId = doc.addBlock('affine:page' as any, {})
        doc.addBlock('affine:surface' as any, {}, pageId)
        const noteId = doc.addBlock('affine:note' as any, {}, pageId)
        doc.addBlock('affine:paragraph' as any, {}, noteId)
    } catch (error) {
        console.error('Failed to init empty page:', error)
        // createEmptyDoc()으로 생성된 doc이면 이미 기본 구조가 있으므로 무시
    }
}

async function convertAndApplyBlocks(blocks: Block[], card: Card, doc: Doc) {
    console.log('[Convert] ====== convertAndApplyBlocks START ======')
    if (!blocks || blocks.length === 0) {
        console.warn('[Convert] ⚠️ No blocks to convert')
        await initEmptyPage(doc)
        return
    }

    try {
        // 1. 기본 구조 생성
        console.log('[Convert] Step 1: Creating page structure...')
        const pageId = doc.addBlock('affine:page' as any, {})
        console.log('[Convert] Created page:', pageId)
        doc.addBlock('affine:surface' as any, {}, pageId)
        const noteId = doc.addBlock('affine:note' as any, {}, pageId)
        console.log('[Convert] Created note:', noteId)

        // 2. 정렬 (contentOrder가 있다면 그것을 따라야 함)
        const contentOrder = card.fields?.contentOrder || []
        console.log('[Convert] Step 2: Sorting blocks by contentOrder...')
        console.log('[Convert] Original contentOrder:', contentOrder)

        // contentOrder가 중첩 배열(string | string[])일 수 있으므로 flat하게 만듦
        // 실제로는 중첩 구조를 지원해야 할 수도 있지만, 1차적으로는 평탄화하여 순서대로 넣음
        const flatContentOrder: string[] = []
        contentOrder.forEach(item => {
            if (Array.isArray(item)) {
                flatContentOrder.push(...item)
            } else if (typeof item === 'string') {
                flatContentOrder.push(item)
            }
        })
        console.log('[Convert] Flattened contentOrder:', flatContentOrder)

        // contentOrder에 없는 블록도 포함하여 정렬
        const sortedBlocks = [...blocks].sort((a, b) => {
            const aIndex = flatContentOrder.indexOf(a.id)
            const bIndex = flatContentOrder.indexOf(b.id)
            if (aIndex === -1 && bIndex === -1) return 0
            if (aIndex === -1) return 1 // contentOrder에 없는 블록은 뒤로
            if (bIndex === -1) return -1
            return aIndex - bIndex
        })
        console.log('[Convert] Sorted block IDs:', sortedBlocks.map(b => b.id))

        // 3. 변환 및 추가 (에러 처리 포함)
        console.log('[Convert] Step 3: Converting blocks...')
        const convertedCount = { success: 0, failed: 0 }

        // 블록을 순차적으로 변환 (이미지 다운로드를 위해 비동기 처리)
        for (let idx = 0; idx < sortedBlocks.length; idx++) {
            const block = sortedBlocks[idx]
            console.log(`[Convert] Converting block ${idx + 1}/${sortedBlocks.length}: ${block.id} (${block.type})`)
            try {
                await convertBlock(block, card.boardId, noteId, doc)
                convertedCount.success++
                console.log(`[Convert]   ✅ Block ${block.id} converted successfully`)
            } catch (error) {
                console.error(`[Convert]   ❌ Failed to convert block ${block.id} (type: ${block.type})`, error)
                convertedCount.failed++
                // 실패한 블록은 텍스트로 fallback
                try {
                    const fallbackText = new Text(block.title || `[Block conversion failed: ${block.type}]`)
                    doc.addBlock('affine:paragraph' as any, { text: fallbackText } as any, noteId)
                    console.log(`[Convert]   ⚠️ Added fallback text for ${block.id}`)
                } catch (fallbackError) {
                    console.error(`[Convert]   ❌ Failed to add fallback block for ${block.id}`, fallbackError)
                }
            }
        }

        // 변환 결과 로깅
        console.log('[Convert] ====== Conversion Results ======')
        console.log(`[Convert] Success: ${convertedCount.success}`)
        console.log(`[Convert] Failed: ${convertedCount.failed}`)
        if (convertedCount.failed > 0) {
            console.warn(`[Convert] ⚠️ Block conversion completed with errors: ${convertedCount.success} success, ${convertedCount.failed} failed`)
        } else {
            console.log(`[Convert] ✅ Block conversion completed: ${convertedCount.success} blocks converted successfully`)
        }
    } catch (error) {
        console.error('[Convert] ❌ CRITICAL ERROR in convertAndApplyBlocks:', error)
        // 에러 발생 시 기본 페이지라도 생성
        await initEmptyPage(doc)
        throw error
    } finally {
        console.log('[Convert] ====== convertAndApplyBlocks END ======')
    }
}

/**
 * 단일 블록을 BlockSuite 형식으로 변환
 */
async function convertBlock(block: Block, boardId: string, parentId: string, doc: Doc): Promise<void> {
    const text = block.title ? stringToText(block.title) : new Text()

    // 공통 필드: 원본 타입 보존 (역마이그레이션 가능)
    const commonFields: Record<string, any> = {
        originalType: block.type, // 원본 타입 보존
        originalId: block.id, // 원본 ID 보존 (필요시)
    }

    switch (block.type) {
    case 'text':
        doc.addBlock('affine:paragraph' as any, {
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'image': {
        // 이미지를 BlobEngine을 통해 로드할 수 있도록 sourceId만 설정
        const fileId = block.fields?.fileId
        if (fileId) {
            console.log(`[Convert] Processing image block: ${fileId}`)

            // affine:image 블록 생성 (다운로드 불필요, fileId를 sourceId로 사용)
            doc.addBlock('affine:image' as any, {
                sourceId: fileId,
                width: block.fields?.width || 0,
                height: block.fields?.height || 0,
                ...commonFields
            } as any, parentId)
            console.log(`[Convert] ✅ Image block created with sourceId: ${fileId}`)
            break
        }

        // 실패 시 텍스트 링크로 fallback
        const imageUrl = block.fields?.fileId ? getImageUrl(boardId, block.fields.fileId) : ''
        const imageText = new Text(`[이미지: ${block.fields?.filename || 'image'} - ${imageUrl}]`)
        doc.addBlock('affine:paragraph' as any, {
            text: imageText,
            ...commonFields
        } as any, parentId)
        console.log(`[Convert] ⚠️ Image block converted to text link (fallback): ${imageUrl}`)
        break
    }

    case 'checkbox':
        doc.addBlock('affine:list' as any, { 
            type: 'todo', 
            text,
            checked: !!block.fields?.value,
            ...commonFields
        } as any, parentId)
        break

    case 'h1':
        doc.addBlock('affine:paragraph' as any, { 
            type: 'h1', 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'h2':
        doc.addBlock('affine:paragraph' as any, { 
            type: 'h2', 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'h3':
        doc.addBlock('affine:paragraph' as any, { 
            type: 'h3', 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'quote':
        doc.addBlock('affine:paragraph' as any, { 
            type: 'quote', 
            text,
            ...commonFields
        } as any, parentId)
        break

    case 'divider':
        doc.addBlock('affine:divider' as any, {
            ...commonFields
        } as any, parentId)
        break

    case 'list-item': {
        const listType = block.fields?.listType || 'bulleted'
        doc.addBlock('affine:list' as any, { 
            type: listType === 'numbered' ? 'numbered' : 'bulleted', 
            text,
            ...commonFields
        } as any, parentId)
        break
    }

    case 'video': {
        const props: Record<string, any> = {
            type: 'video',
            sourceId: block.fields?.fileId || '',
            ...commonFields
        }
        
        // filename이 있다면 추가
        if (block.fields?.filename) {
            props.filename = block.fields.filename
        }
        
        doc.addBlock('affine:embed' as any, props as any, parentId)
        break
    }

    case 'attachment': {
        const props: Record<string, any> = {
            sourceId: block.fields?.fileId || '', 
            name: block.fields?.filename || block.fields?.name || 'attachment',
            size: block.fields?.size || 0,
            ...commonFields
        }
        
        // URL이 있다면 추가 (기존 파일 API)
        if (block.fields?.url) {
            props.url = block.fields.url
        }
        
        doc.addBlock('affine:attachment' as any, props as any, parentId)
        break
    }

    default:
        // 알 수 없는 타입은 텍스트로 처리 (원본 정보 보존)
        const fallbackText = new Text(block.title || `[Unknown block type: ${block.type}]`)
        doc.addBlock('affine:paragraph' as any, { 
            text: fallbackText,
            ...commonFields
        } as any, parentId)
        break
    }
}
