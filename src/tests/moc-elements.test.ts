import assert from 'node:assert';
import { test, describe } from 'node:test';
import { App, TFile } from 'obsidian';
import { CachedMetadata } from 'obsidian';
import { extractElements, mergeBlocks, normalizeElements, ElementType, RawBlock } from '../extractors';
import { generateMocMarkdown, evaluateFilter, extractTags, parseFilter } from '../moc';
import type { MOCPluginSettings } from '../settings';

const DEFAULT_SETTINGS: MOCPluginSettings = { rules: [], templateFolder: '' };

const pos = (start: number, end: number = start) => ({
    start: { line: start, col: 0, offset: 0 },
    end: { line: end, col: 0, offset: 0 },
});

function makeDoc(firstHeading: string) {
    const lines = [
        `# ${firstHeading}`,          // 0
        '',                            // 1
        '- [ ] task launch A',         // 2
        '- item launch B',             // 3
        '',                            // 4
        'Paragraph launch text',       // 5
        '',                            // 6
        '> quote launch',              // 7
        '',                            // 8
        '# Other',                     // 9
        '- unrelated',                 // 10
    ];
    const cache = {
        headings: [
            { heading: firstHeading, level: 1, position: pos(0) },
            { heading: 'Other', level: 1, position: pos(9) },
        ],
        listItems: [
            { task: ' ', parent: -1, position: pos(2) },
            { parent: -1, position: pos(3) },
            { parent: -1, position: pos(10) },
        ],
        sections: [
            { type: 'heading', position: pos(0) },
            { type: 'list', position: pos(2, 3) },
            { type: 'paragraph', position: pos(5) },
            { type: 'blockquote', position: pos(7) },
            { type: 'heading', position: pos(9) },
            { type: 'list', position: pos(10) },
        ],
    } as unknown as CachedMetadata;
    return { lines, cache };
}

function extract(firstHeading: string, filter: string, elements: ElementType[]): RawBlock[] {
    const { lines, cache } = makeDoc(firstHeading);
    const parsed = parseFilter(filter)!;
    return extractElements({
        fileCache: cache,
        lines,
        matches: (text, done) => evaluateFilter(text, parsed, done),
        tagsOf: extractTags,
    }, elements);
}

function fakeApp(firstHeading: string): App {
    const { lines, cache } = makeDoc(firstHeading);
    const file = Object.assign(new TFile(), {
        path: 'Notes/a.md',
        basename: 'a',
        parent: { path: 'Notes', name: 'Notes' },
        stat: { ctime: 0, mtime: 0 },
    });
    return {
        vault: {
            getAbstractFileByPath: () => null,
            getMarkdownFiles: () => [file],
            cachedRead: async () => lines.join('\n'),
        },
        metadataCache: { getFileCache: () => cache },
    } as unknown as App;
}

void describe('normalizeElements', () => {
    void test('accepts a single string', () => {
        assert.deepStrictEqual(normalizeElements('List').elements, ['List']);
    });

    void test('accepts arrays and comma strings, dedupes and trims', () => {
        assert.deepStrictEqual(normalizeElements(['Task', 'Heading', 'Task']).elements, ['Task', 'Heading']);
        assert.deepStrictEqual(normalizeElements('Task, Paragraph').elements, ['Task', 'Paragraph']);
    });

    void test('rejects invalid input', () => {
        for (const bad of ['list', 'Nope', [], ['List', 'Nope'], undefined, 5, '']) {
            const result = normalizeElements(bad);
            assert.strictEqual(result.elements, undefined, String(bad));
            assert.ok(result.error);
        }
    });
});

void describe('mergeBlocks', () => {
    const block = (element: ElementType, startLine: number, endLine: number): RawBlock =>
        ({ element, startLine, endLine, lines: [], tags: [] });

    void test('sorts in document order', () => {
        const merged = mergeBlocks([block('Paragraph', 5, 5), block('List', 2, 3)]);
        assert.deepStrictEqual(merged.map(b => b.startLine), [2, 5]);
    });

    void test('drops blocks contained in an earlier block, outer wins', () => {
        const merged = mergeBlocks([block('List', 2, 2), block('Heading', 0, 8), block('Task', 2, 2)]);
        assert.deepStrictEqual(merged.map(b => b.element), ['Heading']);
    });

    void test('identical ranges keep the first requested type', () => {
        const merged = mergeBlocks([block('Task', 2, 2), block('List', 2, 2)]);
        assert.deepStrictEqual(merged.map(b => b.element), ['Task']);
    });
});

void describe('extractElements', () => {
    void test('single element keeps existing behaviour', () => {
        const blocks = extract('Intro', 'contains("launch")', ['List']);
        assert.deepStrictEqual(blocks.map(b => b.startLine), [2, 3]);
        const tasks = extract('Intro', 'contains("launch")', ['Task']);
        assert.deepStrictEqual(tasks.map(b => b.startLine), [2]);
    });

    void test('combines types in document order without duplicates', () => {
        const blocks = extract('Intro', 'contains("launch")', ['Blockquote', 'Paragraph', 'Task', 'List']);
        assert.deepStrictEqual(blocks.map(b => [b.element, b.startLine]), [
            ['Task', 2], ['List', 3], ['Paragraph', 5], ['Blockquote', 7],
        ]);
    });

    void test('a matching heading section swallows the elements inside it', () => {
        const blocks = extract('Plan launch', 'contains("launch")', ['Heading', 'Task', 'Paragraph']);
        assert.deepStrictEqual(blocks.map(b => [b.element, b.startLine, b.endLine]), [['Heading', 0, 8]]);
    });

    void test('is_completed only matches tasks when combined with other types', () => {
        const blocks = extract('Intro', 'is_incomplete()', ['Task', 'Paragraph']);
        assert.deepStrictEqual(blocks.map(b => b.element), ['Task']);
    });
});

void describe('generateMocMarkdown with multiple elements', () => {
    const base = { folder: 'Notes', filter: 'contains("launch")' };

    void test('rejects an invalid element in a list', async () => {
        const result = await generateMocMarkdown({ ...base, element: ['List', 'Nope'] }, fakeApp('Intro'), 'x.md', DEFAULT_SETTINGS);
        assert.ok(result.error?.includes('element must be one of'));
    });

    void test('single-element output is unchanged: adjacent list blocks stay tight', async () => {
        const result = await generateMocMarkdown({ ...base, element: 'List' }, fakeApp('Intro'), 'x.md', DEFAULT_SETTINGS);
        assert.ok(result.markdownText?.includes('- [ ] task launch A\n- item launch B\n'));
    });

    void test('blank line is forced between blocks of different types', async () => {
        const result = await generateMocMarkdown({ ...base, element: ['List', 'Paragraph'] }, fakeApp('Intro'), 'x.md', DEFAULT_SETTINGS);
        assert.ok(result.markdownText?.includes('- item launch B\n\nParagraph launch text'));
    });

    void test('showCount counts every combined block once', async () => {
        const result = await generateMocMarkdown({ ...base, element: ['Task', 'List', 'Paragraph'], showCount: true }, fakeApp('Intro'), 'x.md', DEFAULT_SETTINGS);
        assert.ok(result.markdownText?.includes('3 results in 1 file'));
    });
});
