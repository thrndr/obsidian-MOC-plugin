import { ExtractContext, RawBlock } from './types';

/** Extracts Paragraph or Blockquote sections. */
export function extractSections(ctx: ExtractContext, element: 'Paragraph' | 'Blockquote'): RawBlock[] {
    const { fileCache, lines } = ctx;
    const blocks: RawBlock[] = [];
    if (!fileCache.sections || fileCache.sections.length === 0) return blocks;

    const targetType = element.toLowerCase();

    for (const section of fileCache.sections) {
        if (section.type !== targetType) continue;

        const startLine = section.position.start.line;
        const endLine = section.position.end.line;

        const sectionLines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
            if (lines[i] !== undefined) {
                sectionLines.push(lines[i] as string);
            }
        }
        const sectionText = sectionLines.join('\n');

        if (ctx.matches(sectionText)) {
            blocks.push({ element, startLine, endLine, lines: sectionLines, tags: ctx.tagsOf(sectionText) });
        }
    }
    return blocks;
}
