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

console.log('BlockSuite patching complete.');
