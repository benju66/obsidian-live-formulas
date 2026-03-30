import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { TableState, columnIndexToLetters } from '../tableState';
import { MathEngine } from '../math';
import type LiveFormulasPlugin from '../main';

interface ParsedTable {
    from: number;
    to: number;
    state: TableState;
    engine: MathEngine;
}

function addTable(from: number, to: number, lines: string[], tables: ParsedTable[]) {
    const markdown = lines.join('\n');
    const ts = TableState.fromMarkdownText(markdown);
    const engine = new MathEngine(ts);
    tables.push({ from, to, state: ts, engine });
}

/**
 * Scans only the currently visible lines in the editor viewport to find tables.
 * This prevents massive lag on large documents compared to full-file parsing.
 */
function getVisibleTables(view: EditorView): ParsedTable[] {
    const tables: ParsedTable[] = [];
    const doc = view.state.doc;
    const processedLines = new Set<number>();

    for (const { from, to } of view.visibleRanges) {
        const startLine = doc.lineAt(from).number;
        const endLine = doc.lineAt(to).number;

        for (let i = startLine; i <= endLine; i++) {
            if (processedLines.has(i)) continue;

            const line = doc.line(i);
            const text = line.text.trim();

            if (text.startsWith('|') || text.endsWith('|')) {
                let tableStartLine = i;
                while (tableStartLine > 1) {
                    const prevLine = doc.line(tableStartLine - 1).text.trim();
                    if (!(prevLine.startsWith('|') || prevLine.endsWith('|'))) break;
                    tableStartLine--;
                }

                let tableEndLine = i;
                while (tableEndLine < doc.lines) {
                    const nextLine = doc.line(tableEndLine + 1).text.trim();
                    if (!(nextLine.startsWith('|') || nextLine.endsWith('|'))) break;
                    tableEndLine++;
                }

                for (let j = tableStartLine; j <= tableEndLine; j++) {
                    processedLines.add(j);
                }

                const tableStartPos = doc.line(tableStartLine).from;
                const tableEndPos = doc.line(tableEndLine).to;
                const lines: string[] = [];
                for (let j = tableStartLine; j <= tableEndLine; j++) {
                    lines.push(doc.line(j).text);
                }

                addTable(tableStartPos, tableEndPos, lines, tables);
            }
        }
    }
    return tables;
}

/**
 * Scans up and down from a specific position (like the cursor) to parse a single table.
 */
function getTableAtPos(state: EditorState, pos: number): ParsedTable | null {
    const doc = state.doc;
    const line = doc.lineAt(pos);
    const text = line.text.trim();

    if (!(text.startsWith('|') || text.endsWith('|'))) return null;

    let tableStartLine = line.number;
    while (tableStartLine > 1) {
        const prevLine = doc.line(tableStartLine - 1).text.trim();
        if (!(prevLine.startsWith('|') || prevLine.endsWith('|'))) break;
        tableStartLine--;
    }

    let tableEndLine = line.number;
    while (tableEndLine < doc.lines) {
        const nextLine = doc.line(tableEndLine + 1).text.trim();
        if (!(nextLine.startsWith('|') || nextLine.endsWith('|'))) break;
        tableEndLine++;
    }

    const tableStartPos = doc.line(tableStartLine).from;
    const tableEndPos = doc.line(tableEndLine).to;
    const lines: string[] = [];
    for (let j = tableStartLine; j <= tableEndLine; j++) {
        lines.push(doc.line(j).text);
    }

    const tables: ParsedTable[] = [];
    addTable(tableStartPos, tableEndPos, lines, tables);
    return tables[0] || null;
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
        visibleTablesCache: ParsedTable[] = [];

        constructor(view: EditorView) {
            this.visibleTablesCache = getVisibleTables(view);
            this.decorations = this.buildDecorations(view, this.visibleTablesCache);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.visibleTablesCache = getVisibleTables(update.view);
                this.decorations = this.buildDecorations(update.view, this.visibleTablesCache);
            } else if (update.selectionSet) {
                this.decorations = this.buildDecorations(update.view, this.visibleTablesCache);
            }
        }

        buildDecorations(view: EditorView, visibleTables: ParsedTable[]): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            const selection = view.state.selection.main;

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

                    const activeTable = visibleTables.find((t) => start >= t.from && start <= t.to);

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

            this.dom.style.position = 'fixed';
            this.dom.style.zIndex = '999999';
            this.dom.style.padding = '6px 12px';
            this.dom.style.background = 'var(--background-primary)';
            this.dom.style.border = '1px solid var(--background-modifier-border)';
            this.dom.style.borderRadius = '8px';
            this.dom.style.color = 'var(--text-normal)';
            this.dom.style.fontFamily = 'var(--font-monospace)';
            this.dom.style.fontSize = '13px';
            this.dom.style.pointerEvents = 'none';
            this.dom.style.display = 'none';
            this.dom.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';

            document.body.appendChild(this.dom);
            this.checkPosition(view);
        }

        update(update: ViewUpdate) {
            if (update.selectionSet || update.docChanged || update.viewportChanged) {
                this.checkPosition(update.view);
            }
        }

        checkPosition(view: EditorView) {
            const pos = view.state.selection.main.head;

            const activeTable = getTableAtPos(view.state, pos);

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

            let pipesBefore = 0;
            for (let i = 0; i < textUpToCursor.length; i++) {
                if (textUpToCursor[i] === '|' && (i === 0 || textUpToCursor[i - 1] !== '\\')) {
                    pipesBefore++;
                }
            }

            if (pipesBefore < 1) {
                this.dom.style.display = 'none';
                return;
            }

            const colLetter = columnIndexToLetters(pipesBefore);
            const cellId = `${colLetter}${rowIndex}`;

            const cellData = activeTable.state.getCell(cellId);

            let displayHtml = `<strong style="color: var(--text-accent);">🎯 ${cellId}</strong>`;
            if (cellData?.formula) {
                displayHtml += ` <span style="margin-left: 6px; color: var(--text-normal);">${cellData.formula}</span>`;
            } else if (cellData?.value !== undefined && cellData?.value !== '') {
                displayHtml += ` <span style="margin-left: 6px; color: var(--text-muted);">${cellData.value}</span>`;
            }

            this.dom.innerHTML = displayHtml;
            this.dom.style.display = 'block';

            const coords = view.coordsAtPos(pos);
            if (coords) {
                this.dom.style.top = `${coords.bottom + 12}px`;
                this.dom.style.left = `${coords.left}px`;
            } else {
                const editorRect = view.dom.getBoundingClientRect();
                this.dom.style.top = `${editorRect.bottom - 40}px`;
                this.dom.style.left = `${editorRect.left + 20}px`;
            }
        }

        destroy() {
            this.dom.remove();
        }
    }
);

export function buildNativeTableExtensions(_plugin: LiveFormulasPlugin) {
    return [nativeTableViewPlugin, activeCellIndicatorPlugin];
}
