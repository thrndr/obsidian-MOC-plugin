import assert from 'node:assert';
import { test, describe } from 'node:test';
import { App, TFile, CachedMetadata } from 'obsidian';
import { configWantsQuery, expandQuery, generateMocMarkdown } from '../moc';
import type { MOCPluginSettings } from '../settings';

const DEFAULT_SETTINGS: MOCPluginSettings = { rules: [], templateFolder: '' };

void describe('configWantsQuery', () => {
    void test('detects the {query} placeholder in filter', () => {
        assert.strictEqual(configWantsQuery({ filter: 'contains("{query}")' }), true);
        assert.strictEqual(configWantsQuery({ filter: 'contains("moc")' }), false);
        assert.strictEqual(configWantsQuery({}), false);
        assert.strictEqual(configWantsQuery({ filter: undefined }), false);
    });
});

void describe('expandQuery', () => {
    void test('replaces every occurrence with the live value', () => {
        assert.strictEqual(expandQuery('contains("{query}")', 'launch'), 'contains("launch")');
        assert.strictEqual(expandQuery('{query} AND {query}', 'x'), 'x AND x');
    });

    void test('substitutes an empty string when nothing has been typed yet', () => {
        assert.strictEqual(expandQuery('contains("{query}")', ''), 'contains("")');
    });

    void test('is a no-op when the placeholder is absent', () => {
        assert.strictEqual(expandQuery('contains("moc")', 'launch'), 'contains("moc")');
    });
});

function fakeApp(lines: string[]): App {
    const cache = {
        listItems: [
            { parent: -1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } },
            { parent: -1, position: { start: { line: 1, col: 0, offset: 0 }, end: { line: 1, col: 0, offset: 0 } } },
        ],
        sections: [],
        headings: [],
    } as unknown as CachedMetadata;

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

void describe('generateMocMarkdown with a live query', () => {
    const lines = ['- alpha item', '- beta item'];
    const base = { folder: 'Notes', element: 'List', filter: 'contains("{query}")' };

    void test('an empty query matches everything', async () => {
        const result = await generateMocMarkdown(base, fakeApp(lines), 'x.md', DEFAULT_SETTINGS);
        assert.ok(result.markdownText?.includes('alpha item'));
        assert.ok(result.markdownText?.includes('beta item'));
    });

    void test('typing narrows the results without editing the block', async () => {
        const result = await generateMocMarkdown(base, fakeApp(lines), 'x.md', DEFAULT_SETTINGS, 'alpha');
        assert.ok(result.markdownText?.includes('alpha item'));
        assert.ok(!result.markdownText?.includes('beta item'));
    });

    void test('a filter without {query} ignores the runtime query argument', async () => {
        const result = await generateMocMarkdown(
            { folder: 'Notes', element: 'List', filter: 'contains("item")' },
            fakeApp(lines), 'x.md', DEFAULT_SETTINGS, 'alpha'
        );
        assert.ok(result.markdownText?.includes('alpha item'));
        assert.ok(result.markdownText?.includes('beta item'));
    });
});
