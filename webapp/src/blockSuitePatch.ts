
// Use dynamic imports to prevent hoisting issues
// This ensures that @blocksuite/blocks and @blocksuite/affine-components/icons
// are ONLY loaded when this function is called, not when the module is imported.

export async function patchSlashMenu() {
    try {
        console.log('[BlockSuitePatch] Starting dynamic patch...');
        
        // Dynamic imports
        const { AffineSlashMenuWidget } = await import('@blocksuite/blocks');
        const { toggleRight } = await import('@blocksuite/affine-components/icons');

        const toggleListItem = {
            name: 'Toggle List',
            icon: toggleRight,
            // @ts-ignore
            action: ({ rootComponent }) => {
                rootComponent.std.command
                    .chain()
                    .updateBlockType({
                        flavour: 'affine:list',
                        props: { type: 'toggle' },
                    })
                    .run();
            }
        };

        // @ts-ignore
        const items = AffineSlashMenuWidget.DEFAULT_CONFIG.items;
        
        // Check if already added to avoid duplicates
        // @ts-ignore
        if (items.some((item: any) => item.name === 'Toggle List')) {
            console.log('[BlockSuitePatch] Toggle List already exists in Slash Menu');
            return;
        }

        // @ts-ignore
        const todoIndex = items.findIndex((item: any) => item.name === 'To-do List');
        
        if (todoIndex !== -1) {
            items.splice(todoIndex + 1, 0, toggleListItem);
        } else {
            items.push(toggleListItem);
        }
        console.log('[BlockSuitePatch] Toggle List added to Slash Menu successfully');
    } catch (e) {
        console.warn('[BlockSuitePatch] Failed to add Toggle List to Slash Menu:', e);
    }
}
