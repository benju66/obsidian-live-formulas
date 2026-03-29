import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { TableState } from '../tableState';
import { MathEngine } from '../math';
import type LiveFormulasPlugin from '../main';

interface ParsedTable {
    from: number;
    to: number;
    state: TableState;
    engine: MathEngine;
}

const nativeTableField = StateField.define<ParsedTable[]>({
    create(state: EditorState) {
        return parseTables(state);
    },
    update(value, tr) {
        if (tr.docChanged) {
            return parseTables(tr.state);
        }
        return value;
    },
});

function parseTables(state: EditorState): ParsedTable[] {
    const tables: ParsedTable[] = [];
    const doc = state.doc;
    let inTable = false;
    let startPos = 0;
    let tableLines: string[] = [];

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const text = line.text.trim();
        const isTableLine = text.startsWith('|') || text.endsWith('|');

        if (isTableLine) {
            if (!inTable) {
                inTable = true;
                startPos = line.from;
            }
            tableLines.push(line.text);
        } else {
            if (inTable) {
                const endPos = doc.line(i - 1).to;
                addTable(startPos, endPos, tableLines, tables);
                inTable = false;
                tableLines = [];
            }
        }
    }
    if (inTable) {
        const endPos = doc.line(doc.lines).to;
        addTable(startPos, endPos, tableLines, tables);
    }
    return tables;
}

function addTable(from: number, to: number, lines: string[], tables: ParsedTable[]) {
    const markdown = lines.join('\n');
    const ts = TableState.fromMarkdownText(markdown);
    const engine = new MathEngine(ts);
    tables.push({ from, to, state: ts, engine });
}

class FormulaWidget extends WidgetType {
    constructor(readonly result: string) {
        super();
    }

    eq(other: FormulaWidget) {
        return other.result === this.result;
    }

    toDOM() {
        const span = document.createElement('span');
        span.className = 'live-formula-native-widget';
        span.textContent = this.result;
        span.style.color = 'var(--text-accent)';
        span.style.fontWeight = 'bold';
        return span;
    }
}

const nativeTableViewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            const selection = view.state.selection.main;

            const tables = view.state.field(nativeTableField);

            for (const { from, to } of view.visibleRanges) {
                const text = view.state.doc.sliceString(from, to);
                const regex = /\|\s*(=[^|]+?)\s*(?=\|)/g;
                let match: RegExpExecArray | null;

                while ((match = regex.exec(text)) !== null) {
                    const eqInMatch = match[0].indexOf('=');
                    const start = from + match.index + eqInMatch;
                    const end = start + match[1].length;

                    const cellStart = from + match.index;
                    const cellEnd = cellStart + match[0].length;

                    if (selection.head >= cellStart && selection.head <= cellEnd) {
                        continue;
                    }

                    const formulaText = match[1];
                    let displayValue = `[Calc: ${formulaText}]`;

                    const activeTable = tables.find((t) => start >= t.from && start <= t.to);

                    if (activeTable) {
                        const result = activeTable.engine.evaluateFormula(formulaText);
                        displayValue = String(result);
                    }

                    builder.add(
                        start,
                        end,
                        Decoration.replace({
                            widget: new FormulaWidget(displayValue),
                        })
                    );
                }
            }
            return builder.finish();
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

export function buildNativeTableExtensions(_plugin: LiveFormulasPlugin) {
    return [nativeTableField, nativeTableViewPlugin];
}
