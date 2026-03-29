import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { TableState, columnIndexToLetters } from '../tableState';
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

const activeCellIndicatorPlugin = ViewPlugin.fromClass(
    class {
        dom: HTMLElement;

        constructor(view: EditorView) {
            this.dom = document.createElement('div');
            this.dom.className = 'live-formula-active-cell-indicator';
            this.dom.style.position = 'absolute';
            this.dom.style.zIndex = '100';
            this.dom.style.padding = '4px 10px';
            this.dom.style.background = 'var(--background-secondary)';
            this.dom.style.border = '1px solid var(--background-modifier-border)';
            this.dom.style.borderRadius = '6px';
            this.dom.style.color = 'var(--text-accent)';
            this.dom.style.fontFamily = 'var(--font-monospace)';
            this.dom.style.fontSize = '0.85em';
            this.dom.style.pointerEvents = 'none';
            this.dom.style.display = 'none';
            this.dom.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            this.dom.style.transition = 'top 0.1s ease-out, left 0.1s ease-out';
            view.dom.appendChild(this.dom);
            this.checkPosition(view);
        }

        update(update: ViewUpdate) {
            if (update.selectionSet || update.docChanged || update.viewportChanged) {
                this.checkPosition(update.view);
            }
        }

        checkPosition(view: EditorView) {
            const pos = view.state.selection.main.head;
            const tables = view.state.field(nativeTableField);
            const activeTable = tables.find((t) => pos >= t.from && pos <= t.to);

            if (!activeTable) {
                this.dom.style.display = 'none';
                return;
            }

            const line = view.state.doc.lineAt(pos);
            const tableStartLine = view.state.doc.lineAt(activeTable.from);

            const rowIndex = line.number - tableStartLine.number - 1;
            if (rowIndex < 1) {
                this.dom.style.display = 'none';
                return;
            }

            const textUpToCursor = line.text.substring(0, pos - line.from);
            const pipesBefore = (textUpToCursor.match(/(?<!\\)\|/g) || []).length;

            if (pipesBefore < 1) {
                this.dom.style.display = 'none';
                return;
            }

            const colLetter = columnIndexToLetters(pipesBefore);
            const cellId = `${colLetter}${rowIndex}`;

            const cellData = activeTable.state.getCell(cellId);
            let displayString = `🎯 ${cellId}`;
            if (cellData?.formula) {
                displayString += ` | ${cellData.formula}`;
            } else if (cellData?.value !== undefined && cellData?.value !== '') {
                displayString += ` | ${cellData.value}`;
            }

            this.dom.textContent = displayString;
            this.dom.style.display = 'block';

            const coords = view.coordsAtPos(pos);
            if (coords) {
                const editorRect = view.dom.getBoundingClientRect();
                this.dom.style.top = `${coords.bottom - editorRect.top + 8}px`;
                this.dom.style.left = `${Math.max(10, coords.left - editorRect.left)}px`;
            }
        }

        destroy() {
            this.dom.remove();
        }
    }
);

export function buildNativeTableExtensions(_plugin: LiveFormulasPlugin) {
    return [nativeTableField, nativeTableViewPlugin, activeCellIndicatorPlugin];
}
