// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import { Doc, Job, Text, DocCollection } from '@blocksuite/store'

import octoClient from '../octoClient'
import { Block } from '../blocks/block'
import { Card } from '../blocks/card'

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
 * 이미지를 다운로드하여 Blob으로 변환
 */
async function downloadImageAsBlob(boardId: string, fileId: string): Promise<Blob | null> {
    try {
        const imageUrl = getImageUrl(boardId, fileId)
        console.log('[Image] Downloading image from:', imageUrl)

        const response = await fetch(imageUrl)
        if (!response.ok) {
            console.error('[Image] Failed to download image:', response.status)
            return null
        }

        const blob = await response.blob()
        console.log('[Image] Downloaded blob, size:', blob.size, 'type:', blob.type)
        return blob
    } catch (error) {
        console.error('[Image] Error downloading image:', error)
        return null
    }
}

/**
 * Blob을 DocCollection에 저장하고 sourceId 반환
 */
async function storeBlobInCollection(collection: DocCollection, blob: Blob, filename: string): Promise<string | null> {
    try {
        console.log('[Image] Storing blob in collection:', filename)

        // DocCollection의 blob storage에 저장
        const blobManager = collection.blobSync
        if (!blobManager) {
            console.error('[Image] BlobSync not available in collection')
            return null
        }

        // Blob을 storage에 저장
        const blobId = await blobManager.set(blob)
        console.log('[Image] Blob stored with ID:', blobId)

        return blobId
    } catch (error) {
        console.error('[Image] Error storing blob:', error)
        return null
    }
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
        // Mattermost 파일 API로 업로드
        const fileId = await octoClient.uploadFile(boardId, file)
        
        if (!fileId) {
            console.error('Failed to upload file')
            return null
        }

        // 이미지 크기 정보 가져오기 (선택사항)
        const imageSize = await getImageSize(file)
        
        // BlockSuite 이미지 블록 생성
        const imageBlockId = doc.addBlock('affine:image' as any, {
            sourceId: fileId,
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
                            console.log('[BlockSuite Migration] Loading existing snapshot...')
                            const job = new Job({ collection: doc.collection })

                            try {
                                // 기존 doc을 collection에서 제거
                                if (doc.collection.getDoc(doc.id)) {
                                    console.log('[BlockSuite Migration] Removing existing doc from collection')
                                    doc.collection.removeDoc(doc.id)
                                }

                                const newDoc = await job.snapshotToDoc(snapshot)
                                console.log('[BlockSuite Migration] Snapshot loaded successfully')
                                return newDoc
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
 * 스냅샷에 실제 콘텐츠가 있는지 확인
 * 기본 구조(빈 paragraph)만 있으면 false 반환
 */
function checkSnapshotHasContent(snapshot: any): boolean {
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
    const text = block.title ? new Text(block.title) : new Text()

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
        // 이미지를 다운로드하여 Blob storage에 저장
        const fileId = block.fields?.fileId
        if (fileId) {
            console.log(`[Convert] Processing image block: ${fileId}`)

            // 이미지 다운로드
            const blob = await downloadImageAsBlob(boardId, fileId)

            if (blob && doc.collection) {
                // Blob storage에 저장
                const blobId = await storeBlobInCollection(doc.collection, blob, block.fields?.filename || 'image')

                if (blobId) {
                    // affine:image 블록 생성
                    doc.addBlock('affine:image' as any, {
                        sourceId: blobId,
                        width: block.fields?.width || 0,
                        height: block.fields?.height || 0,
                        ...commonFields
                    } as any, parentId)
                    console.log(`[Convert] ✅ Image block created with blobId: ${blobId}`)
                    break
                }
            }
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
