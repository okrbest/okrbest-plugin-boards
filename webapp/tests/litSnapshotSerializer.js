// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const {DOMElement, DOMCollection} = require('pretty-format').plugins

/**
 * Custom snapshot serializer to normalize dynamic values in BlockSuite/lit-html output.
 * 
 * Normalizes:
 * - lit-html template markers (e.g., lit$269375176$ -> lit$HASH$)
 * - BlockSuite block IDs (e.g., data-block-id="Qs-8M7iGQA" -> data-block-id="BLOCK_ID")
 * 
 * This prevents snapshot tests from failing due to non-deterministic values.
 */

function normalizeBlockSuiteOutput(str) {
    return str
        // Normalize lit-html template markers
        .replace(/lit\$\d+\$/g, 'lit$HASH$')
        // Normalize BlockSuite block IDs
        .replace(/data-block-id="[^"]+"/g, 'data-block-id="BLOCK_ID"')
}

module.exports = {
    test(val) {
        // Match any DOM element (we'll normalize dynamic values in the output)
        return DOMElement.test(val) || DOMCollection.test(val)
    },
    serialize(val, config, indentation, depth, refs, printer) {
        // Use the default DOM serializer
        let result
        if (DOMElement.test(val)) {
            result = DOMElement.serialize(val, config, indentation, depth, refs, printer)
        } else {
            result = DOMCollection.serialize(val, config, indentation, depth, refs, printer)
        }
        // Normalize dynamic values in the output
        return normalizeBlockSuiteOutput(result)
    },
}
