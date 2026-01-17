# BlockSuite 프론트엔드 통합 구현 가이드

## 개요
이 문서는 Mattermost Boards의 기존 에디터를 **BlockSuite (Yjs 기반)** 로 전환하기 위한 프론트엔드 구현 가이드입니다. 
백엔드 API 및 데이터 모델은 이미 구현되어 있으며(`spec-docs/blocksuite-migration.md` 참조), 프론트엔드에서의 연동 및 마이그레이션 로직 구현이 주 목적입니다.

---

## 1. 아키텍처 및 패키지

### 필수 패키지 (이미 설치됨)
*   `@blocksuite/blocks`: 블록 정의 및 로직
*   `@blocksuite/presets`: 에디터 프리셋 및 컨테이너
*   `@blocksuite/store`: 데이터 저장소 (Yjs 래퍼)
*   `yjs`: 데이터 동기화 및 CRDT 구현

### 컴포넌트 구조
*   `BlockSuiteEditor`: 최상위 래퍼 컴포넌트. React와 Web Component(BlockSuite) 간의 브릿지 역할을 합니다.
*   `blockSuiteUtils`: 데이터 로드, 마이그레이션(레거시 -> BlockSuite), 저장 로직을 담당합니다.

---

## 2. 상세 구현 가이드

### 2.1 API 클라이언트 업데이트 (`webapp/src/octoClient.ts`)

기존 `octoClient`에 BlockSuite 전용 API 호출 메서드를 추가해야 합니다.

```typescript
// BlockSuite 관련 메서드 추가
async getBlockSuiteInfo(cardId: string): Promise<any | null> {
    try {
        return await this.doFetch(`${this.url}/cards/${cardId}/blocksuite/info`, { method: 'GET' });
    } catch (e: any) {
        if (e.status === 404) return null;
        throw e;
    }
}

async getBlockSuiteContent(cardId: string): Promise<ArrayBuffer> {
    const response = await fetch(`${this.url}/cards/${cardId}/blocksuite/content`, {
        headers: this.getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch content');
    return await response.arrayBuffer();
}

async saveBlockSuiteContent(cardId: string, content: Uint8Array): Promise<void> {
    await fetch(`${this.url}/cards/${cardId}/blocksuite/content`, {
        method: 'PUT',
        headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/octet-stream'
        },
        body: content
    });
}
```

### 2.2 유틸리티: 데이터 로드 및 마이그레이션 (`webapp/src/utils/blockSuiteUtils.ts`)

`public/blocksuite-editor.html`의 로직을 기반으로, 기존 블록 데이터를 BlockSuite 형식으로 변환하는 로직을 구현합니다.

```typescript
import { Doc } from '@blocksuite/store';
import * as Y from 'yjs';
import octoClient from '../octoClient';

export async function loadData(cardId: string, doc: Doc) {
    try {
        // 1. BlockSuite 문서 존재 확인
        const info = await octoClient.getBlockSuiteInfo(cardId);

        if (info) {
            // 2. 문서가 있으면 스냅샷 로드 및 적용
            const snapshot = await octoClient.getBlockSuiteContent(cardId);
            Y.applyUpdate(doc.spaceDoc, new Uint8Array(snapshot));
        } else {
            // 3. 문서가 없으면 기존 블록 가져와서 변환 (Smart Load & Migration)
            const legacyBlocks = await octoClient.getBlocks(cardId);
            convertAndApplyBlocks(legacyBlocks, doc);
            
            // 4. 변환된 내용 서버에 자동 저장
            const snapshot = Y.encodeStateAsUpdate(doc.spaceDoc);
            await octoClient.saveBlockSuiteContent(cardId, snapshot);
        }
    } catch (e) {
        console.error("Failed to load BlockSuite data", e);
    }
}

function convertAndApplyBlocks(blocks: any[], doc: Doc) {
    // 기본 페이지 구조 생성
    const rootBlockId = doc.addBlock('affine:page', {});
    const surfaceBlockId = doc.addBlock('affine:surface', {}, rootBlockId);
    const noteBlockId = doc.addBlock('affine:note', {}, rootBlockId);

    // 블록 정렬 (contentOrder 필드 참조 필요)
    // ... 정렬 로직 ...

    blocks.forEach(block => {
        // 타입 매핑
        switch (block.type) {
            case 'text':
                doc.addBlock('affine:paragraph', { text: new Y.Text(block.title) }, noteBlockId);
                break;
            case 'image':
                 doc.addBlock('affine:image', { 
                    sourceId: block.fields.fileId, 
                    // ... 기타 속성 
                 }, noteBlockId);
                 break;
            // ... 기타 타입 매핑 (spec-docs/blocksuite-migration.md 참조)
        }
    });
}
```

### 2.3 에디터 컴포넌트 (`webapp/src/components/blockSuite/BlockSuiteEditor.tsx`)

```typescript
import React, { useEffect, useRef, useState } from 'react';
import { DocCollection } from '@blocksuite/store';
import { EditorContainer } from '@blocksuite/presets';
import { AffineSchemas } from '@blocksuite/blocks';
import * as Y from 'yjs';
import { loadData } from '../../utils/blockSuiteUtils';
import octoClient from '../../octoClient';

// 스타일 (필요시 경로 조정)
import '@blocksuite/presets/themes/affine.css';

interface Props {
    cardId: string;
    boardId: string;
    readOnly?: boolean;
}

export const BlockSuiteEditor: React.FC<Props> = ({ cardId, boardId, readOnly }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [doc, setDoc] = useState<any>(null);

    // 1. 초기화 및 에디터 마운트
    useEffect(() => {
        if (!containerRef.current) return;

        const collection = new DocCollection({ schema: AffineSchemas });
        const doc = collection.createDoc({ id: cardId });
        setDoc(doc);

        const editor = new EditorContainer();
        editor.doc = doc;
        containerRef.current.appendChild(editor);

        return () => {
            containerRef.current?.removeChild(editor);
        };
    }, [cardId]);

    // 2. 데이터 로드
    useEffect(() => {
        if (!doc) return;
        loadData(cardId, doc);
    }, [doc, cardId]);

    // 3. 자동 저장 (Debounce 권장)
    useEffect(() => {
        if (!doc || readOnly) return;
        
        let timeout: NodeJS.Timeout;
        const handleUpdate = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const snapshot = Y.encodeStateAsUpdate(doc.spaceDoc);
                octoClient.saveBlockSuiteContent(cardId, snapshot);
            }, 2000); // 2초 Debounce
        };

        doc.spaceDoc.on('update', handleUpdate);
        return () => {
            doc.spaceDoc.off('update', handleUpdate);
            clearTimeout(timeout);
        };
    }, [doc, cardId, readOnly]);

    return <div ref={containerRef} className="blocksuite-editor-wrapper" />;
};
```

---

## 3. 스타일링 및 테마

BlockSuite는 Shadow DOM을 사용할 수 있어 전역 스타일이 적용되지 않을 수 있습니다.
`BlockSuiteEditor.scss`를 생성하여 필요한 스타일을 주입하거나 CSS 변수를 재정의해야 합니다.

```css
/* BlockSuiteEditor.scss */
.blocksuite-editor-wrapper {
    height: 100%;
    width: 100%;
    overflow-y: auto;
    
    /* Mattermost 테마 변수 연결 예시 */
    --affine-font-family: var(--font-family-base, 'Open Sans', sans-serif);
    --affine-background-primary-color: var(--center-channel-bg);
    --affine-text-primary-color: var(--center-channel-color);
}
```

## 4. 진행 단계

1.  **API 클라이언트 구현**: `octoClient.ts` 업데이트.
2.  **데이터 변환 로직 구현**: `blockSuiteUtils.ts` 작성 (가장 중요).
3.  **에디터 컴포넌트 구현**: `BlockSuiteEditor.tsx` 작성.
4.  **UI 통합**: 기존 `CardDetail` 컴포넌트에서 플래그나 조건에 따라 새 에디터를 렌더링하도록 수정.
5.  **테스트**: 다양한 기존 카드 타입을 열어 변환이 정확한지 확인.

---

## 5. TDD(Test-Driven Development) 가이드

새로운 기능을 안정적으로 구현하기 위해 **TDD 방식**으로 개발하는 것을 권장합니다. 아래는 주요 모듈에 대한 테스트 작성 가이드입니다.

### 5.1 데이터 변환 유틸리티 테스트 (`webapp/src/utils/blockSuiteUtils.test.ts`)

`blockSuiteUtils.ts`를 구현하기 전에, 다양한 블록 타입이 올바르게 변환되는지 검증하는 테스트 코드를 먼저 작성하세요.

```typescript
import { DocCollection } from '@blocksuite/store';
import { AffineSchemas } from '@blocksuite/blocks';
import { loadData } from './blockSuiteUtils';
import octoClient from '../octoClient';

// Mock octoClient
jest.mock('../octoClient');

describe('blockSuiteUtils', () => {
    let collection: DocCollection;
    
    beforeEach(() => {
        collection = new DocCollection({ schema: AffineSchemas });
        jest.clearAllMocks();
    });

    it('should convert text blocks to affine:paragraph', async () => {
        // Given: 기존 텍스트 블록 데이터
        const cardId = 'card-1';
        const doc = collection.createDoc({ id: cardId });
        const legacyBlocks = [
            { id: 'block-1', type: 'text', title: 'Hello World', parentId: cardId }
        ];

        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null); // 문서 없음
        (octoClient.getBlocks as jest.Mock).mockResolvedValue(legacyBlocks);

        // When: 데이터 로드 (마이그레이션 실행)
        await loadData(cardId, doc);

        // Then: BlockSuite 문서에 affine:paragraph 블록이 생성되어야 함
        const blocks = doc.getBlocks();
        const paragraph = blocks.find(b => b.flavour === 'affine:paragraph');
        
        expect(paragraph).toBeDefined();
        expect(paragraph?.model.text?.toString()).toBe('Hello World');
        expect(octoClient.saveBlockSuiteContent).toHaveBeenCalled(); // 자동 저장 확인
    });

    it('should load existing BlockSuite document if present', async () => {
        // Given: 이미 존재하는 BlockSuite 문서
        const cardId = 'card-2';
        const doc = collection.createDoc({ id: cardId });
        
        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue({ exists: true });
        (octoClient.getBlockSuiteContent as jest.Mock).mockResolvedValue(new Uint8Array([])); // Mock Snapshot

        // When: 데이터 로드
        await loadData(cardId, doc);

        // Then: 기존 블록 로드 API는 호출되지 않아야 함
        expect(octoClient.getBlocks).not.toHaveBeenCalled();
    });
});
```

### 5.2 에디터 컴포넌트 테스트 (`webapp/src/components/blockSuite/BlockSuiteEditor.test.tsx`)

`BlockSuiteEditor.tsx` 구현 전에 컴포넌트가 정상적으로 마운트되고 데이터를 로드하는지 확인하는 테스트를 작성합니다.

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BlockSuiteEditor } from './BlockSuiteEditor';
import octoClient from '../../octoClient';

jest.mock('../../octoClient');

describe('BlockSuiteEditor', () => {
    const cardId = 'card-1';
    const boardId = 'board-1';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render editor container', () => {
        render(<BlockSuiteEditor cardId={cardId} boardId={boardId} />);
        const container = document.querySelector('.blocksuite-editor-wrapper');
        expect(container).toBeInTheDocument();
    });

    it('should load data on mount', async () => {
        (octoClient.getBlockSuiteInfo as jest.Mock).mockResolvedValue(null);
        (octoClient.getBlocks as jest.Mock).mockResolvedValue([]);

        render(<BlockSuiteEditor cardId={cardId} boardId={boardId} />);

        await waitFor(() => {
            expect(octoClient.getBlockSuiteInfo).toHaveBeenCalledWith(cardId);
        });
    });
});
```

### 5.3 TDD 워크플로우 제안

1.  **Test Fail**: 위 테스트 코드를 먼저 작성하고 실행하여 실패(Red)하는 것을 확인합니다.
2.  **Implement**: 테스트를 통과하기 위한 최소한의 코드를 `blockSuiteUtils.ts`와 `BlockSuiteEditor.tsx`에 작성합니다.
3.  **Test Pass**: 테스트를 다시 실행하여 통과(Green)하는지 확인합니다.
4.  **Refactor**: 중복 코드를 제거하고 구조를 개선합니다.

이 과정을 반복하며 `image`, `checkbox` 등 다양한 블록 타입에 대한 변환 로직을 점진적으로 추가해 나가세요.