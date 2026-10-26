import { ExtractContext, RawBlock } from './types';

/** Extracts List or Task items (with their children). Lists include tasks. */
export function extractListItems(ctx: ExtractContext, element: 'List' | 'Task'): RawBlock[] {
    const { fileCache, lines } = ctx;
    const blocks: RawBlock[] = [];
    const listItems = fileCache.listItems;
    if (!listItems || listItems.length === 0) return blocks;

    let skipUntilLine = -1;

    for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        if (!item) continue;

        if (element === 'Task' && item.task === undefined) continue;

        if (item.position.start.line <= skipUntilLine) continue;

        const lineContent = lines[item.position.start.line];
        if (!lineContent) continue;

        if (!ctx.matches(lineContent, item.task !== undefined ? item.task !== ' ' : undefined)) continue;

        let lastChildLine = item.position.start.line;
        let j = i + 1;
        while (j < listItems.length) {
            const nextItem = listItems[j];
            if (!nextItem) { j++; continue; }

            if (nextItem.parent === item.position.start.line || (nextItem.parent !== undefined && nextItem.parent > item.position.start.line)) {
                lastChildLine = nextItem.position.start.line;
                j++;
            } else {
                break;
            }
        }

        skipUntilLine = lastChildLine;

        const startLine = item.position.start.line;
        const lastItemMatched = listItems[j - 1];
        const endLine = lastItemMatched ? lastItemMatched.position.end.line : startLine;

        const baseIndentMatch = lines[startLine]?.match(/^(\s*)/);
        const baseIndent = baseIndentMatch ? baseIndentMatch[1] : '';

        const blockLines: string[] = [];
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            let currentLine = lines[lineNum];
            if (currentLine === undefined) continue;

            if (baseIndent && currentLine.startsWith(baseIndent)) {
                currentLine = currentLine.substring(baseIndent.length);
            }
            blockLines.push(currentLine);
        }
        blocks.push({ element, startLine, endLine, lines: blockLines, tags: ctx.tagsOf(blockLines.join('\n')) });
    }
    return blocks;
}
