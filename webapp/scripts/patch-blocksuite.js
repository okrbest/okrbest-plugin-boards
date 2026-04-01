const fs = require('fs');
const path = require('path');

const nodeModules = path.join(__dirname, '..', 'node_modules');

function renameSrcFolder(pkgName) {
    const srcPath = path.join(nodeModules, '@blocksuite', pkgName, 'src');
    const destPath = path.join(nodeModules, '@blocksuite', pkgName, '_src');
    
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
        fs.renameSync(srcPath, destPath);
        console.log(`Renamed ${pkgName}/src to ${pkgName}/_src`);
    }
}

function fixTypoInFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('CheckBoxCkeckSolidIcon')) {
        content = content.replace(/CheckBoxCkeckSolidIcon/g, 'CheckBoxCheckSolidIcon');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed typo in ${path.relative(nodeModules, filePath)}`);
        return true;
    }
    return false;
}

function findAndFixTypos(dir) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory() && !file.name.startsWith('_')) {
            findAndFixTypos(fullPath);
        } else if (file.name.endsWith('.js')) {
            fixTypoInFile(fullPath);
        }
    }
}

function fixConstTypeParameter(filePath) {
    if (!fs.existsSync(filePath)) return false;
    
    let content = fs.readFileSync(filePath, 'utf8');
    const pattern = /,\s*const\s+(\w+)\s+extends/g;
    if (pattern.test(content)) {
        content = content.replace(/,\s*const\s+(\w+)\s+extends/g, ', $1 extends');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed const type parameter in ${path.relative(nodeModules, filePath)}`);
        return true;
    }
    return false;
}

console.log('Patching BlockSuite packages...');

['store', 'blocks', 'presets', 'affine-components', 'data-view'].forEach(pkg => {
    renameSrcFolder(pkg);
});

const blocksuiteDir = path.join(nodeModules, '@blocksuite');
if (fs.existsSync(blocksuiteDir)) {
    findAndFixTypos(blocksuiteDir);
}

const containerDts = path.join(nodeModules, '@blocksuite/global/dist/di/container.d.ts');
fixConstTypeParameter(containerDts);

// 붙여넣기 시 마크다운 파싱 우선: text/plain(MarkdownAdapter)을 text/html보다 먼저 시도
function patchClipboardPriorities(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    // text/plain(MixTextAdapter) 우선순위 70 → 92 (text/html 90보다 위)
    if (content.includes("registerAdapter('text/plain', MixTextAdapter, 70)")) {
        content = content.replace(
            "registerAdapter('text/plain', MixTextAdapter, 70)",
            "registerAdapter('text/plain', MixTextAdapter, 92)"
        );
        changed = true;
    }
    // text/html(HtmlAdapter) 우선순위 90 → 75 (text/plain보다 아래)
    if (content.includes("registerAdapter('text/html', HtmlAdapter, 90)")) {
        content = content.replace(
            "registerAdapter('text/html', HtmlAdapter, 90)",
            "registerAdapter('text/html', HtmlAdapter, 75)"
        );
        changed = true;
    }
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched clipboard priorities for markdown paste');
        return true;
    }
    return false;
}
const clipboardPath = path.join(nodeModules, '@blocksuite/blocks/dist/root-block/clipboard/index.js');
patchClipboardPriorities(clipboardPath);

// 복사 시 체크박스(todo) 마크다운 문법 포함: MixTextAdapter가 - [ ] / - [x] 출력
function patchMixTextCheckbox(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    const oldListCase = `case 'affine:list': {
                    buffer += text.delta.map(delta => delta.insert).join('');
                    buffer += '\\n';
                    break;
                }`;
    const newListCase = `case 'affine:list': {
                    const listText = text.delta.map(delta => delta.insert).join('');
                    const listType = o.node.props.type;
                    if (listType === 'todo') {
                        buffer += (o.node.props.checked ? '- [x] ' : '- [ ] ') + listText + '\\n';
                    } else if (listType === 'numbered') {
                        buffer += '1. ' + listText + '\\n';
                    } else {
                        buffer += '- ' + listText + '\\n';
                    }
                    break;
                }`;
    if (content.includes("case 'affine:list':")) {
        // 정확한 패턴으로 교체 (들여쓰기 유지)
        const listRegex = /case 'affine:list':\s*\{\s*buffer \+= text\.delta\.map\(delta => delta\.insert\)\.join\(''\);\s*buffer \+= '\\n';\s*break;\s*\}/s;
        if (listRegex.test(content)) {
            content = content.replace(listRegex, newListCase);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Patched MixTextAdapter for checkbox copy (markdown syntax)');
            return true;
        }
    }
    return false;
}
const mixTextPath = path.join(nodeModules, '@blocksuite/blocks/dist/_common/adapters/mix-text.js');
patchMixTextCheckbox(mixTextPath);

// 붙여넣기 시 [ ] / [x] 만 있는 줄을 - [ ] / - [x] 로 변환 (GFM 태스크 리스트 문법)
function patchMixTextPasteCheckbox(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    const oldCode = `payload.file = payload.file.replaceAll('\\r', '');
        const sliceSnapshot = await this._markdownAdapter.toSliceSnapshot({`;
    const newCode = `payload.file = payload.file.replaceAll('\\r', '');
        payload.file = payload.file.replace(/^( *)\\[ \\] /gm, '$1- [ ] ').replace(/^( *)\\[[xX]\\] /gm, '$1- [x] ');
        const sliceSnapshot = await this._markdownAdapter.toSliceSnapshot({`;
    if (content.includes(oldCode) && !content.includes("replace(/^( *)\\[ \\] /gm")) {
        content = content.replace(oldCode, newCode);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched MixTextAdapter for checkbox paste ([ ] -> - [ ])');
        return true;
    }
    return false;
}
patchMixTextPasteCheckbox(mixTextPath);

// focalboard:paste-version-defaults: _getSnapshotByPriority에서 pageVersion/workspaceVersion가
// undefined일 때 z.number() 스키마 검증 실패로 MixTextAdapter→HtmlAdapter 폴백 방지
function patchClipboardVersionDefaults(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    if (content.includes('pageVersion: doc.collection.meta.pageVersion,') &&
        !content.includes('pageVersion: doc.collection.meta.pageVersion ??')) {
        content = content.replace(
            'pageVersion: doc.collection.meta.pageVersion,',
            'pageVersion: doc.collection.meta.pageVersion ?? 2,'
        );
        changed = true;
    }
    if (content.includes('workspaceVersion: doc.collection.meta.workspaceVersion,') &&
        !content.includes('workspaceVersion: doc.collection.meta.workspaceVersion ??')) {
        content = content.replace(
            'workspaceVersion: doc.collection.meta.workspaceVersion,',
            'workspaceVersion: doc.collection.meta.workspaceVersion ?? 2,'
        );
        changed = true;
    }
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched clipboard _getSnapshotByPriority version defaults');
        return true;
    }
    return false;
}
const clipboardCorePath = path.join(nodeModules, '@blocksuite/block-std/dist/clipboard/index.js');
patchClipboardVersionDefaults(clipboardCorePath);

// focalboard:snapshotToSlice-safe-parse: SliceSnapshotSchema.parse를 try 블록 안으로 이동
// → 스키마 검증 실패 시 전체 paste가 중단되지 않도록 방어
function patchSnapshotToSliceSafeParse(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    const oldPattern = 'this.snapshotToSlice = async (snapshot, doc, parent, index) => {\n            SliceSnapshotSchema.parse(snapshot);\n            try {';
    const newPattern = 'this.snapshotToSlice = async (snapshot, doc, parent, index) => {\n            try {\n                SliceSnapshotSchema.parse(snapshot);';
    if (content.includes(oldPattern)) {
        content = content.replace(oldPattern, newPattern);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched snapshotToSlice: moved schema parse inside try block');
        return true;
    }
    return false;
}
const jobPath = path.join(nodeModules, '@blocksuite/store/dist/transformer/job.js');
patchSnapshotToSliceSafeParse(jobPath);

// focalboard:toSlice-diag: BaseAdapter.toSlice 에러 발생 시 진단 로그 추가
function patchToSliceDiagnostics(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    const oldCatch = "console.error('Cannot convert slice snapshot to slice');\n            console.error(error);";
    const newCatch = "console.error('[focalboard:toSlice]', this.constructor?.name, 'failed. payload size:', typeof payload?.file === 'string' ? payload.file.length : '?');\n            console.error(error);";
    if (content.includes(oldCatch) && !content.includes('[focalboard:toSlice]')) {
        content = content.replace(oldCatch, newCatch);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched BaseAdapter.toSlice diagnostics');
        return true;
    }
    return false;
}
const basePath = path.join(nodeModules, '@blocksuite/store/dist/adapter/base.js');
patchToSliceDiagnostics(basePath);

// focalboard:paste-debug: MixTextAdapter 붙여넣기 파이프라인 상세 디버깅 로그
function patchMixTextPasteDebug(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // 1) toSliceSnapshot 진입 시 로그
    const entryOld = "if (payload.file.trim().length === 0) {\n            return null;\n        }\n        payload.file = payload.file.replaceAll('\\r', '');";
    const entryNew = "if (payload.file.trim().length === 0) {\n            return null;\n        }\n        console.log('[focalboard:paste] MixText.toSliceSnapshot len:', payload.file.length, 'pv:', payload.pageVersion, 'wv:', payload.workspaceVersion);\n        console.log('[focalboard:paste] Input:', payload.file.substring(0, 250));\n        payload.file = payload.file.replaceAll('\\r', '');";
    if (content.includes(entryOld) && !content.includes('[focalboard:paste] MixText.toSliceSnapshot')) {
        content = content.replace(entryOld, entryNew);
        changed = true;
    }

    // 2) table 전처리 후 → MarkdownAdapter 호출 전 로그
    const preMarkdownOld = "const sliceSnapshot = await this._markdownAdapter.toSliceSnapshot({";
    const preMarkdownNew = "console.log('[focalboard:paste] After preprocess:', payload.file.substring(0, 250));\n        const sliceSnapshot = await this._markdownAdapter.toSliceSnapshot({";
    if (content.includes(preMarkdownOld) && !content.includes('[focalboard:paste] After preprocess:')) {
        content = content.replace(preMarkdownOld, preMarkdownNew);
        changed = true;
    }

    // 3) MarkdownAdapter 결과 로그
    const postMarkdownOld = "if (!sliceSnapshot) {\n            return null;\n        }\n        for (const contentSlice of sliceSnapshot.content)";
    const postMarkdownNew = "if (sliceSnapshot) {\n            var _dbg = sliceSnapshot.content?.map(function(c){return c.children?.map(function(ch){return ch.flavour}).join(',')}).join('; ');\n            console.log('[focalboard:paste] MarkdownAdapter OK:', _dbg, 'pv:', sliceSnapshot.pageVersion, 'wv:', sliceSnapshot.workspaceVersion);\n        } else {\n            console.warn('[focalboard:paste] MarkdownAdapter returned NULL');\n        }\n        if (!sliceSnapshot) {\n            return null;\n        }\n        for (const contentSlice of sliceSnapshot.content)";
    if (content.includes(postMarkdownOld) && !content.includes('[focalboard:paste] MarkdownAdapter OK:')) {
        content = content.replace(postMarkdownOld, postMarkdownNew);
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched MixTextAdapter paste debug logging');
        return true;
    }
    return false;
}
patchMixTextPasteDebug(mixTextPath);

// focalboard:paste-md-reparse: BLOCKSUITE/SNAPSHOT 안의 paragraph 블록에 원본 마크다운이 남아있으면
// text/plain 경로로 폴백하여 마크다운을 구조화된 블록(heading, database 등)으로 재파싱
// (정상 파싱된 heading은 affine:heading, 테이블은 affine:database이므로 paragraph에 ### 이나 |---| 가 있으면 미파싱)
function patchPasteMdReparse(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');

    const reparseBlock = `if (json['BLOCKSUITE/SNAPSHOT']) {
                    try {
                        var _sp = JSON.parse(json['BLOCKSUITE/SNAPSHOT']);
                        var _ct = (_sp && _sp.snapshot && _sp.snapshot.content) || [];
                        var _hasRawMd = _ct.some(function _chk(b) {
                            if (b.flavour === 'affine:note') return (b.children || []).some(_chk);
                            if (b.flavour !== 'affine:paragraph') return false;
                            var _d = b.props && b.props.text && b.props.text.delta;
                            if (!_d || !_d.length) return false;
                            var _t = _d.map(function(d) { return d.insert || ''; }).join('');
                            return /^#{1,6}\\s/.test(_t) || /^\\|[-:|\\s]+\\|$/.test(_t);
                        });
                        if (_hasRawMd) {
                            console.log('[focalboard:paste] Raw markdown in BLOCKSUITE/SNAPSHOT paragraphs, re-parsing via text/plain');
                            throw new Error('focalboard:md-reparse');
                        }
                    } catch (e) { if (e.message === 'focalboard:md-reparse') throw e; }
                }`;

    // Case 1: 신규 파일 (패치 안 된 상태)
    const freshPattern = "const json = this.readFromClipboard(data);\n                const slice = await this._getSnapshotByPriority(type => json[type], doc, parent, index);";
    if (content.includes(freshPattern) && !content.includes('focalboard:md-reparse')) {
        content = content.replace(freshPattern, `const json = this.readFromClipboard(data);\n                ${reparseBlock}\n                const slice = await this._getSnapshotByPriority(type => json[type], doc, parent, index);`);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched paste: markdown reparse from BLOCKSUITE/SNAPSHOT (fresh)');
        return true;
    }

    // Case 2: 이전 버전 패치 적용됨 (every → some 업그레이드)
    if (content.includes('_ct.every(function _chk') && content.includes('focalboard:md-reparse')) {
        const oldBlock = /var _pt = data\.getData.*?\n\s+if \(\(\/\^#\{1,6\}.*?catch \(e\) \{ if \(e\.message === 'focalboard:md-reparse'\) throw e; \}\s*\}/s;
        if (oldBlock.test(content)) {
            content = content.replace(oldBlock, reparseBlock);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Patched paste: markdown reparse upgraded (every → some paragraph check)');
            return true;
        }
    }

    return false;
}
patchPasteMdReparse(clipboardCorePath);

// focalboard:clipboard-adapter-debug: 어댑터 선택 로그 (어떤 어댑터가 사용되는지 추적)
function patchClipboardAdapterDebug(filePath) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');

    const oldAdapterTry = "if (item) {\n                    const job = this._getJob();";
    const newAdapterTry = "if (item) {\n                    console.log('[focalboard:paste] Trying adapter:', type);\n                    const job = this._getJob();";
    if (content.includes(oldAdapterTry) && !content.includes('[focalboard:paste] Trying adapter:')) {
        content = content.replace(oldAdapterTry, newAdapterTry);

        const oldReturn = "if (result) {\n                        return result;\n                    }";
        const newReturn = "if (result) {\n                        console.log('[focalboard:paste] Adapter OK:', type);\n                        return result;\n                    } else {\n                        console.log('[focalboard:paste] Adapter returned null:', type);\n                    }";
        if (content.includes(oldReturn) && !content.includes('[focalboard:paste] Adapter OK:')) {
            content = content.replace(oldReturn, newReturn);
        }

        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched clipboard adapter selection debug logging');
        return true;
    }
    return false;
}
patchClipboardAdapterDebug(clipboardCorePath);

console.log('BlockSuite patching complete.');
