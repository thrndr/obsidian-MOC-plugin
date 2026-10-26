import assert from 'node:assert';
import { test, describe } from 'node:test';
import { App, TFile, TFolder, CachedMetadata } from 'obsidian';
import { applyQuery, configWantsQuery, generateMocMarkdown } from '../moc';
import { findParameterError } from '../parameters';
import type { MOCPluginSettings } from '../settings';

const DEFAULT_SETTINGS: MOCPluginSettings = { rules: [], templateFolder: '', interactiveTasks: true, showJumpToSource: true };

void describe('configWantsQuery', () => {
    void test('detects the {{query}} placeholder in filter', () => {
        assert.strictEqual(configWantsQuery({ filter: 'contains("{{query}}")' }), true);
    });

    void test('detects a blank has_tag("") or matches("")', () => {
        assert.strictEqual(configWantsQuery({ filter: 'has_tag("")' }), true);
        assert.strictEqual(configWantsQuery({ filter: 'matches("")' }), true);
        assert.strictEqual(configWantsQuery({ filter: 'is_incomplete() AND has_tag("")' }), true);
    });

    void test('is false for an ordinary filter', () => {
        assert.strictEqual(configWantsQuery({ filter: 'contains("moc")' }), false);
        assert.strictEqual(configWantsQuery({ filter: 'has_tag("project")' }), false);
        assert.strictEqual(configWantsQuery({}), false);
        assert.strictEqual(configWantsQuery({ filter: undefined }), false);
    });
});

void describe('applyQuery', () => {
    void test('replaces {{query}} with the trimmed value', () => {
        assert.deepStrictEqual(
            applyQuery({ filter: 'contains("{{query}}")' }, '  launch  '),
            { filter: 'contains("launch")' }
        );
    });

    void test('fills a blank has_tag("") or matches(""), JSON-quoting the value', () => {
        assert.deepStrictEqual(applyQuery({ filter: 'has_tag("")' }, 'project'), { filter: 'has_tag("project")' });
        assert.deepStrictEqual(applyQuery({ filter: 'matches("")' }, 'a"b'), { filter: `matches(${JSON.stringify('a"b')})` });
    });

    void test('is a no-op when the query is empty or blank', () => {
        const config = { filter: 'contains("{{query}}")' };
        assert.strictEqual(applyQuery(config, ''), config);
        assert.strictEqual(applyQuery(config, '   '), config);
    });

    void test('is a no-op when filter is not a string', () => {
        const config = { folder: 'Notes' };
        assert.strictEqual(applyQuery(config, 'launch'), config);
    });

    void test('leaves every other config field untouched', () => {
        const config = { folder: 'Notes', filter: 'contains("{{query}}")', showCount: true };
        assert.deepStrictEqual(applyQuery(config, 'x'), { folder: 'Notes', filter: 'contains("x")', showCount: true });
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
            getAbstractFileByPath: (path: string) => (path === 'Notes' ? Object.assign(new TFolder(), { path: 'Notes', name: 'Notes' }) : null),
            getMarkdownFiles: () => [file],
            cachedRead: async () => lines.join('\n'),
        },
        metadataCache: { getFileCache: () => cache },
    } as unknown as App;
}

void describe('generateMocMarkdown with a query already filled in by applyQuery', () => {
    const lines = ['- alpha item', '- beta item'];
    const base = { folder: 'Notes', element: 'List', filter: 'contains("{{query}}")' };

    void test('a filled-in query narrows the results', async () => {
        const result = await generateMocMarkdown(applyQuery(base, 'alpha'), fakeApp(lines), 'x.md', DEFAULT_SETTINGS);
        assert.ok(result.markdownText?.includes('alpha item'));
        assert.ok(!result.markdownText?.includes('beta item'));
    });

    void test('an unfilled {{query}} is treated as a literal, matching nothing (callers must gate on configWantsQuery instead)', async () => {
        const result = await generateMocMarkdown(base, fakeApp(lines), 'x.md', DEFAULT_SETTINGS);
        assert.ok(result.error?.includes('No elements matching filter found'));
    });

    void test('a filter without a query placeholder is unaffected by applyQuery', async () => {
        const config = { folder: 'Notes', element: 'List', filter: 'contains("item")' };
        const result = await generateMocMarkdown(applyQuery(config, 'alpha'), fakeApp(lines), 'x.md', DEFAULT_SETTINGS);
        assert.ok(result.markdownText?.includes('alpha item'));
        assert.ok(result.markdownText?.includes('beta item'));
    });
});

void describe('{{query}} as a parameter', () => {
    void test('is accepted in a filter, where the query box fills it in', () => {
        assert.strictEqual(findParameterError('contains("{{query}}")', 'filter'), null);
        assert.strictEqual(findParameterError('is_incomplete() AND contains("{{query}}")', 'filter'), null);
    });

    void test('is rejected in a path, where nothing fills it in', () => {
        assert.match(findParameterError('Journal/{{query}}', 'path') ?? '', /only works in filter/);
    });

    void test('a misspelling is still an unknown parameter', () => {
        assert.match(findParameterError('contains("{{queyr}}")', 'filter') ?? '', /unknown parameter/);
        assert.match(findParameterError('contains("{{Query}}")', 'filter') ?? '', /unknown parameter/);
    });
});
