import { extractHeadings } from './heading';
import { extractListItems } from './list';
import { extractSections } from './section';
import { ElementType, ExtractContext, RawBlock, VALID_ELEMENTS } from './types';

export { VALID_ELEMENTS } from './types';
export type { ElementType, ExtractContext, RawBlock } from './types';

const ELEMENT_ERROR = `Error: element must be one of: ${VALID_ELEMENTS.join(', ')} (or a list of them).`;

/**
 * Normalizes the `element` config value (string, comma separated string or array)
 * into a deduplicated list of valid element types, or an error message.
 */
export function normalizeElements(raw: unknown): { elements?: ElementType[]; error?: string } {
    let names: unknown[] = [];
    if (Array.isArray(raw)) {
        names = raw;
    } else if (typeof raw === 'string') {
        names = raw.split(',');
    }

    const elements: ElementType[] = [];
    for (const name of names) {
        const trimmed = typeof name === 'string' ? name.trim() : '';
        const valid = VALID_ELEMENTS.find(v => v === trimmed);
        if (!valid) return { error: ELEMENT_ERROR };
        if (!elements.includes(valid)) elements.push(valid);
    }

    if (elements.length === 0) return { error: ELEMENT_ERROR };
    return { elements };
}

/**
 * Merges blocks of several element types in document order and drops any block
 * whose line range is already covered by a kept block (the outer block wins).
 */
export function mergeBlocks(blocks: RawBlock[]): RawBlock[] {
    const sorted = blocks
        .map((block, index) => ({ block, index }))
        .sort((a, b) => a.block.startLine - b.block.startLine || b.block.endLine - a.block.endLine || a.index - b.index);

    const kept: RawBlock[] = [];
    let maxEnd = -1;
    for (const { block } of sorted) {
        if (block.endLine <= maxEnd) continue;
        kept.push(block);
        maxEnd = block.endLine;
    }
    return kept;
}

/** Runs the extractor for each requested element type and combines the results. */
export function extractElements(ctx: ExtractContext, elements: ElementType[]): RawBlock[] {
    const all: RawBlock[] = [];
    for (const element of elements) {
        if (element === 'List' || element === 'Task') {
            all.push(...extractListItems(ctx, element));
        } else if (element === 'Heading') {
            all.push(...extractHeadings(ctx));
        } else {
            all.push(...extractSections(ctx, element));
        }
    }
    return elements.length > 1 ? mergeBlocks(all) : all;
}
