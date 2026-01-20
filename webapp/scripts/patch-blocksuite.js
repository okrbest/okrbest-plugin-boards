#!/usr/bin/env node
// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * BlockSuite canary 버전 패치 스크립트
 * 
 * 이 스크립트는 npm install 후 자동으로 실행되어 BlockSuite 패키지의 버그를 수정합니다.
 * 
 * 패치 내용:
 * 1. @blocksuite/icons/lit: CheckBoxCkeckSolidIcon 오타 수정 (CheckBoxCheckSolidIcon alias 추가)
 * 2. @blocksuite/blocks: exports 필드에 require 조건 추가 (webpack 호환성)
 */

const fs = require('fs');
const path = require('path');

const nodeModulesPath = path.join(__dirname, '..', 'node_modules');

console.log('[patch-blocksuite] Starting BlockSuite patches...');

// 1. @blocksuite/icons/lit 패치 - CheckBoxCkeckSolidIcon 오타 수정
function patchIconsLit() {
    const litMjsPath = path.join(nodeModulesPath, '@blocksuite', 'icons', 'dist', 'lit.mjs');
    const litJsPath = path.join(nodeModulesPath, '@blocksuite', 'icons', 'dist', 'lit.js');
    
    const aliasLine = 'CheckBoxCheckSolid as CheckBoxCkeckSolidIcon';
    
    // lit.mjs 패치
    if (fs.existsSync(litMjsPath)) {
        let content = fs.readFileSync(litMjsPath, 'utf8');
        if (!content.includes('CheckBoxCkeckSolidIcon')) {
            // export 블록의 마지막 항목 뒤에 alias 추가
            content = content.replace(
                /ZoomUp as ZoomUpIcon\s*\n\};/,
                `ZoomUp as ZoomUpIcon,\n  ${aliasLine}\n};`
            );
            fs.writeFileSync(litMjsPath, content);
            console.log('[patch-blocksuite] Patched lit.mjs - added CheckBoxCkeckSolidIcon alias');
        } else {
            console.log('[patch-blocksuite] lit.mjs already patched');
        }
    }
    
    // lit.js 패치 (CommonJS)
    if (fs.existsSync(litJsPath)) {
        let content = fs.readFileSync(litJsPath, 'utf8');
        const exportLine = 'exports.CheckBoxCkeckSolidIcon = CheckBoxCheckSolid;';
        if (!content.includes('CheckBoxCkeckSolidIcon')) {
            content += `\n// Alias for typo in BlockSuite canary version\n${exportLine}\n`;
            fs.writeFileSync(litJsPath, content);
            console.log('[patch-blocksuite] Patched lit.js - added CheckBoxCkeckSolidIcon export');
        } else {
            console.log('[patch-blocksuite] lit.js already patched');
        }
    }
}

// 2. @blocksuite/blocks 및 @blocksuite/presets package.json 패치 - exports에 require 조건 추가
function patchPackageJsonExports(packageName) {
    const packageJsonPath = path.join(nodeModulesPath, '@blocksuite', packageName, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // exports 필드가 있고, require 조건이 없는 경우 패치
        if (pkg.exports && pkg.exports['.'] && !pkg.exports['.'].require) {
            // 각 export entry에 require 조건 추가
            for (const key of Object.keys(pkg.exports)) {
                const entry = pkg.exports[key];
                if (typeof entry === 'object') {
                    const importPath = entry.import || entry.module;
                    if (importPath && !entry.require) {
                        entry.require = importPath;
                        entry.default = importPath;
                    }
                }
            }
            
            fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));
            console.log(`[patch-blocksuite] Patched @blocksuite/${packageName}/package.json - added require conditions`);
        } else {
            console.log(`[patch-blocksuite] @blocksuite/${packageName}/package.json already patched or not needed`);
        }
    }
}

function patchBlocksPackageJson() {
    patchPackageJsonExports('blocks');
    patchPackageJsonExports('presets');
}

// 패치 실행
try {
    patchIconsLit();
    patchBlocksPackageJson();
    console.log('[patch-blocksuite] All patches applied successfully!');
} catch (error) {
    console.error('[patch-blocksuite] Error applying patches:', error);
    process.exit(1);
}
