# Maps of Content (Obsidian plugin)

See [AGENTS.md](AGENTS.md) for general Obsidian plugin conventions (build, lint, manifest, releasing).

## Commands

- `npm run build`: `tsc -noEmit` then esbuild production bundle.
- `npm run lint`: eslint (obsidianmd rules).
- `npm test`: `test-runner.mjs` bundles every `src/**/*.test.ts` against `obsidian-mock.js` and runs them with `node:test`. Tests may only import modules that do not pull in real Obsidian classes (e.g. do not import `settings.ts` at runtime; use `import type`).
- On Windows, Node lives in `C:\Program Files\nodejs` and may not be on the shell PATH.

## Architecture

- `src/main.ts`: plugin lifecycle; registers the `moc` code block processor (config parsed with `parseYaml`) and commands.
- `src/moc.ts`: filter DSL (tokenizer, parser, evaluator), `generateMocMarkdown` (file selection, sorting, extraction, limit windows, `applyFnR`, `template`, grouping, rendering into `segments` — its `config` is expected to already have any live query filled in, see Live query below), `processMocBlock` (toolbar: Copy/Bake, plus the live query search box) and `MocRenderChild` (live refresh via `MocScope`/`isPathInScope`, per-block rendering with jump-to-source, task write-back, and the in-memory `queryText`).
- `src/extractors/`: element extraction, one module per kind.
  - `types.ts`: `ElementType`, `VALID_ELEMENTS`, `RawBlock`, `ExtractContext` (filter and tag helpers are injected to avoid circular imports).
  - `list.ts` (List/Task), `heading.ts`, `section.ts` (Paragraph/Blockquote).
  - `index.ts`: `normalizeElements`, `mergeBlocks`, `extractElements`.
  - Each `RawBlock` carries `startLine`/`endLine`. `generateMocMarkdown` turns those into the `MatchedBlock.startLine` used by jump-to-source (`BlockRef`) and into `taskLines` via `collectTaskLines`, so extractors stay unaware of both features.
- `src/ui/`: creation wizard (`moc-wizard.ts`), filter tree builder, autocomplete suggesters.
- `src/commands/create-showcase.ts`: generates the demo vault folder; add a note here for every new feature. Notes 13-15 cover interactive tasks, jump to source and renames/moves; 16-17 cover multiple elements and the live query.

## Multiple elements (feature)

`element` in a `moc` block is `string | string[]` (single name, comma string, or YAML list). `normalizeElements` validates, trims and dedupes it.

- With more than one element, `mergeBlocks` sorts blocks by start line and drops any block whose range is covered by an already-kept block (outer wins; identical ranges keep the first requested type). Single-element output is not merged and stays byte-identical to pre-1.5.0 behaviour.
- One shared `filter` is applied per type: Heading matches on heading text only, others on full text; `is_completed()`/`is_incomplete()` only match tasks.
- `pushBlockSeparator` always inserts a blank line between adjacent blocks of different types so a paragraph cannot become a lazy continuation of a list item.
- The wizard keeps `elements: ElementType[]` and emits `element: X` for one type, `element: [X, Y]` for several.

## Live query (feature)

`filter` can ask for a value typed live by the reader, in one of two ways: the `{{query}}` placeholder, or a **blank** `has_tag("")`/`matches("")` (left empty on purpose so the typed text fills it in). `configWantsQuery(config)` detects either form; `applyQuery(config, queryText)` returns a new config with the value filled in (a no-op, returning `config` unchanged, while `queryText` is empty/blank — this is deliberate: it lets `configWantsQuery` still see the unfilled placeholder and show the prompt below, and lets `applyFnR`/output stay untouched until there's something to filter on). `generateMocMarkdown` itself is unchanged — the caller is expected to call `applyQuery` first (this is a config *preprocessing* step, not a parameter threaded through `generateMocMarkdown`).

- `processMocBlock` renders an always-visible search box (`.moc-query-bar` / `.moc-query-input`) above the block, *outside* `.moc-toolbar`, when `configWantsQuery(config)` is true — the toolbar itself only appears on hover, which would be wrong for something the user needs to interact with. The box is `type="search"`, no label; the reference build this was reverse-engineered from uses no `aria-label` either.
- The typed value lives only on `MocRenderChild.queryText` (in memory, not persisted). Typing calls `setQuery(value)`, which debounces (~300 ms, `updateDebouncedQuery`) into a `renderMoc()`.
- `renderMoc()` special-cases the empty state: if `configWantsQuery(this.config)` is true and `queryText` is blank, it shows `QUERY_EMPTY_STATE_MESSAGE` ("Type a tag or phrase above to search.") and returns *without* calling `generateMocMarkdown` at all — an unfilled `{{query}}` is otherwise treated as a literal string by the filter DSL (harmless, but pointless) rather than a parse error, so this early return is the only thing standing between "nothing typed yet" and "silently searches for the literal text `{{query}}`".
- Copy and Bake call `applyQuery(config, childComponent.queryText)` before `generateMocMarkdown`, and refuse with a `Notice` ("Type a query first") while the query is empty — **this is a deliberate deviation from the reference build**, which passes the raw, unfilled `config` to Copy/Bake regardless of what's typed (i.e. ignores the live query there entirely). Confirmed with the user on 2026-09-27; don't revert without checking.
- `{{query}}`/blank-primitive filling only applies inside `filter`, not in `folder`.

The reference bundle this was checked against lives in `dynamic_query/` (untracked, not part of plugin source — it's an installed build someone dropped in for comparison, not a template to copy wholesale). Before trusting anything found there again, diff it against the current build (`main.js`/`styles.css`/`manifest.json`) first — a copy that is byte-identical to this repo's own output means it just doesn't contain what's being asked about, not that the feature has no reference (this happened once; see the `ask-before-guessing-on-inconsistent-reference` memory).

## Project rules

- Keep a summary of changes and fixes in `CHANGELOG.md` (the "In-progress" section).
- Update this file when architecture, design or features change.
- Do not commit automatically; do not commit `main.js`.
- Versioned docs in `docs-site/versioned_docs/` are frozen snapshots; edit `docs-site/docs/` only (`changelog.md` there is synced automatically).
