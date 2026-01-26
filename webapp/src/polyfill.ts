// Polyfill for global which is expected by some libraries (like Yjs/BlockSuite)
// This file must be imported before any other imports in the application entry point.

if (typeof (window as any).global === 'undefined') {
    (window as any).global = window;
}

console.log('[Polyfill] globalThis/window.global initialized');
