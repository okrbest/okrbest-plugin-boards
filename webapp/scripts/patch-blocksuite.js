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

console.log('BlockSuite patching complete.');
