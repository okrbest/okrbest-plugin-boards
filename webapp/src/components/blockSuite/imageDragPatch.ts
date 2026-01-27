// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {PageEditor} from '@blocksuite/presets'

type DragStartProps = {
    state: {raw: {target: EventTarget | null}};
    startDragging: (blocks: unknown[], state: unknown) => void;
    anchorBlockId: string;
    editorHost: {
        std: {
            view: {getBlock: (id: string) => unknown};
            selection: {
                setGroup: (g: string, s: unknown[]) => void;
                create: (t: string, d: {blockId: string}) => unknown;
            };
        };
    };
}

type DragHandleOption = {
    flavour: string | RegExp;
    onDragStart?: (props: DragStartProps) => boolean;
}

type DragHandleWidget = HTMLElement & {
    optionRunner?: {
        options: DragHandleOption[];
    };
}

function handleImageDragStart(props: DragStartProps): boolean {
    const {state, startDragging, anchorBlockId, editorHost} = props

    if (!anchorBlockId) return false

    const target = state.raw.target as HTMLElement | null
    if (!target) return false

    const imageBlock = target.closest('affine-image')
    if (!imageBlock) return false

    if (target.closest('.resize')) return false

    const blockView = editorHost.std.view.getBlock(anchorBlockId)
    if (!blockView) return false

    editorHost.std.selection.setGroup('note', [
        editorHost.std.selection.create('block', {blockId: anchorBlockId}),
    ])

    startDragging([blockView], state)
    return true
}

export function patchImageDragOption(editor: PageEditor): void {
    const dragWidget = editor.host?.querySelector('affine-drag-handle-widget') as DragHandleWidget | null

    if (!dragWidget?.optionRunner?.options) return

    const imageOption = dragWidget.optionRunner.options.find(
        (opt) => opt.flavour === 'affine:image' ||
                (opt.flavour instanceof RegExp && opt.flavour.test('affine:image'))
    )

    if (imageOption && !imageOption.onDragStart) {
        imageOption.onDragStart = handleImageDragStart
    }
}

export function setupImageDraggable(container: HTMLElement): void {
    const images = container.querySelectorAll('affine-image')
    images.forEach((img) => {
        img.setAttribute('draggable', 'true')
    })
}

export function createImageDraggableObserver(container: HTMLElement): MutationObserver {
    setupImageDraggable(container)

    const observer = new MutationObserver(() => {
        setupImageDraggable(container)
    })
    observer.observe(container, {childList: true, subtree: true})

    return observer
}
