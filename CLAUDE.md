# Maps of Content (Obsidian plugin)

See [AGENTS.md](AGENTS.md) for general Obsidian plugin conventions (build, lint, manifest, releasing). (As of 2026-09-27, `AGENTS.md` is no longer present in this repo; the conventions it described — npm/esbuild, `src/` layout, manifest rules — still hold unless code says otherwise.)

## Commands

- `npm run build`: `tsc -noEmit` then esbuild production bundle.
- `npm run lint`: eslint (obsidianmd rules).
- `npm test`: `test-runner.mjs` bundles every `src/**/*.test.ts` against `obsidian-mock.js` and runs them with `node:test`. Tests may only import modules that do not pull in real Obsidian classes (e.g. do not import `settings.ts` at runtime; use `import type`).
- On Windows, Node lives in `C:\Program Files\nodejs` and may not be on the shell PATH.

## Architecture

- `src/main.ts`: plugin lifecycle; registers the `moc` code block processor (config parsed with `parseYaml`) and commands.
- `src/moc.ts`: filter DSL (tokenizer, parser, evaluator), `generateMocMarkdown` (file selection, sorting, extraction, `applyFnR`, `template`, grouping, rendering; takes an optional `runtimeQuery` argument, see Live query below), `processMocBlock` (toolbar: Copy/Bake, plus the live query search box) and `MocRenderChild` (live refresh, holds the in-memory `queryValue`).
- `src/extractors/`: element extraction, one module per kind.
  - `types.ts`: `ElementType`, `VALID_ELEMENTS`, `RawBlock`, `ExtractContext` (filter and tag helpers are injected to avoid circular imports).
  - `list.ts` (List/Task), `heading.ts`, `section.ts` (Paragraph/Blockquote).
  - `index.ts`: `normalizeElements`, `mergeBlocks`, `extractElements`.
- `src/ui/`: creation wizard (`moc-wizard.ts`), filter tree builder, autocomplete suggesters.
- `src/commands/create-showcase.ts`: generates the demo vault folder; add a note here for every new feature.

## Multiple elements (feature)

`element` in a `moc` block is `string | string[]` (single name, comma string, or YAML list). `normalizeElements` validates, trims and dedupes it.

- With more than one element, `mergeBlocks` sorts blocks by start line and drops any block whose range is covered by an already-kept block (outer wins; identical ranges keep the first requested type). Single-element output is not merged and stays byte-identical to pre-1.5.0 behaviour.
- One shared `filter` is applied per type: Heading matches on heading text only, others on full text; `is_completed()`/`is_incomplete()` only match tasks.
- `pushBlockSeparator` always inserts a blank line between adjacent blocks of different types so a paragraph cannot become a lazy continuation of a list item.
- The wizard keeps `elements: ElementType[]` and emits `element: X` for one type, `element: [X, Y]` for several.

## Live query (feature)

`filter` may contain the single-brace `{query}` placeholder (distinct from the double-brace `{{this.*}}` dynamic parameters, which are expanded once from the note's own context). `configWantsQuery(config)` detects it; `expandQuery(text, query)` does the substitution.

- `processMocBlock` renders an always-visible search box (`.moc-query-bar` / `.moc-query-input`) above the block, *outside* `.moc-toolbar`, when `configWantsQuery(config)` is true — the toolbar itself only appears on hover, which would be wrong for something the user needs to interact with.
- The typed value lives only on `MocRenderChild.queryValue` (in memory, not persisted); typing calls `updateQueryDebounced()` (~300 ms) which re-renders via `generateMocMarkdown(config, app, sourcePath, settings, queryValue)`.
- Before anything is typed, `{query}` expands to `''`, so e.g. `contains("{query}")` matches everything.
- Copy and Bake both read the live `queryValue` at click time, so Bake freezes whatever is currently filtered.
- `{query}` is only expanded in `filter`, not in `folder`.

## Project rules

- Keep a summary of changes and fixes in `CHANGELOG.md` (the "In-progress" section).
- Update this file when architecture, design or features change.
- Do not commit automatically; do not commit `main.js`.
- Versioned docs in `docs-site/versioned_docs/` are frozen snapshots; edit `docs-site/docs/` only (`changelog.md` there is synced automatically).
