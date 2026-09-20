import { ExtractContext, RawBlock } from './types';

/** Extracts heading sections (heading line up to the next heading of the same or higher level). */
export function extractHeadings(ctx: ExtractContext): RawBlock[] {
    const { fileCache, lines } = ctx;
    const blocks: RawBlock[] = [];
    const headings = fileCache.headings;
    if (!headings || headings.length === 0) return blocks;

    let skipUntilLine = -1;

    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i];
        if (!heading) continue;
        if (heading.position.start.line <= skipUntilLine) continue;

        const lineContent = lines[heading.position.start.line];
        if (!lineContent) continue;

        if (!ctx.matches(heading.heading)) continue;

        const startLine = heading.position.start.line;
        let endLine = lines.length - 1;

        for (let j = i + 1; j < headings.length; j++) {
            const nextHeading = headings[j];
            if (nextHeading && nextHeading.level <= heading.level) {
                endLine = nextHeading.position.start.line - 1;
                break;
            }
        }

        skipUntilLine = endLine;

        const blockLines: string[] = [];
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            if (lines[lineNum] !== undefined) {
                blockLines.push(lines[lineNum] as string);
            }
        }
        blocks.push({ element: 'Heading', startLine, endLine, lines: blockLines, tags: ctx.tagsOf(blockLines.join('\n')) });
    }
    return blocks;
}
