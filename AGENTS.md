# Live Formulas — agent / contributor map

## What this is

Obsidian plugin: editable **markdown tables** with **formulas** inside ` ```live-table ` fenced blocks. Table metadata (`id`, optional `tableName`, formulas, formats) lives in an HTML comment after the opening fence; cell values live in the markdown pipe table body. **`id`** is the stable key used when locating a block on save (not `tableName`).

## Entry points

- **`main.ts`** — `Plugin` lifecycle, `registerMarkdownCodeBlockProcessor('live-table', …)`, debounced save + `forceSave` on the debouncer for unload safety, `performSave` (editor `replaceRange` when active file, else `vault.process`). When **`experimentalNativeTables`**: optional `registerMarkdownPostProcessor` evaluates `=` cells in normal HTML `<table>` (Reading / unfocused preview), skipping `.live-formula-table`.
- **`ui.ts`** — `renderTableUI`: DOM, selection, cell editor, formula bar, clipboard, context menus, undo stacks on `TableState`.
- **`src/nativeTablePlugin.ts`** — Experimental native pipe tables: **viewport-scoped** table parse + cursor-scoped parse (no full-doc `StateField`); `ViewPlugin` masks `=formulas` with `MathEngine`; **active cell indicator** when **`settings.experimentalNativeTables`** is on (`buildNativeTableExtensions`).
- **`tableState.ts`** — `TableState`, parse/serialize markdown, `structureDirty`, stable **`id`** in meta, optional display **`tableName`**.
- **`math.ts`** — `MathEngine`, dependency graph, `formulaToExpr` / evaluation.
- **`dataActions.ts`** — insert/delete row/column, formula reference shifts, fill.
- **`formulaMasking.ts`** — mask strings + scientific notation before regex transforms.

## Build

- Source entry: **`main.ts`** (esbuild bundles to **`main.js`** — do not hand-edit `main.js`).
- Run **`npm run build`** after substantive TS changes.

## Invariants worth preserving

- Saves are **debounced**; **`forceSave`** points at raw `performSave` for lifecycle / plugin unload.
- **`structureDirty`** avoids rebuilding the dependency graph on every numeric cell edit.
- Table identity in the file is **`id`** in JSON meta (used when locating the block after edits). **`tableName`** is display-only.
