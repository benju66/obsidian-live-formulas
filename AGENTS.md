# Live Formulas — agent / contributor map

## What this is

Obsidian plugin: editable **markdown tables** with **formulas** inside ` ```live-table ` fenced blocks. Table metadata (formulas, formats, `tableName`) lives in an HTML comment after the opening fence; cell values live in the markdown pipe table body.

## Entry points

- **`main.ts`** — `Plugin` lifecycle, `registerMarkdownCodeBlockProcessor('live-table', …)`, debounced save + `forceSave` on the debouncer for unload safety, `performSave` (editor `replaceRange` when active file, else `vault.process`).
- **`ui.ts`** — `renderTableUI`: DOM, selection, cell editor, formula bar, clipboard, context menus, undo stacks on `TableState`.
- **`tableState.ts`** — `TableState`, parse/serialize markdown, `structureDirty`, `tableName` (UUID).
- **`math.ts`** — `MathEngine`, dependency graph, `formulaToExpr` / evaluation.
- **`dataActions.ts`** — insert/delete row/column, formula reference shifts, fill.
- **`formulaMasking.ts`** — mask strings + scientific notation before regex transforms.

## Build

- Source entry: **`main.ts`** (esbuild bundles to **`main.js`** — do not hand-edit `main.js`).
- Run **`npm run build`** after substantive TS changes.

## Invariants worth preserving

- Saves are **debounced**; **`forceSave`** points at raw `performSave` for lifecycle / plugin unload.
- **`structureDirty`** avoids rebuilding the dependency graph on every numeric cell edit.
- Table identity in the file is **`tableName`** in JSON meta (used when locating the block after edits).
