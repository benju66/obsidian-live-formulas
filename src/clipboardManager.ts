import { MathEngine } from '../math';
import { TableState, CellData, lettersToColumnIndex, columnIndexToLetters } from '../tableState';
import * as Actions from '../dataActions';
import type { SelectionManager } from './selectionManager';

export interface InternalClipboard {
    text: string;
    matrix: any[][];
    minC: number;
    minR: number;
}

/** Shared across all live-table instances so copy/paste preserves formulas between tables. */
let pluginClipboard: InternalClipboard | null = null;

export interface ClipboardManagerDeps {
    state: TableState;
    selectionManager: SelectionManager;
    engine: MathEngine;
    wrapper: HTMLElement;
    refreshCellDisplay: (id: string) => void;
    saveWithHistory: () => void;
    rerender: () => void;
}

export interface ClipboardHandlers {
    executeCopy: () => boolean;
    executeCut: () => void;
    executePaste: (text: string) => void;
}

/**
 * Clipboard copy/cut/paste for the live table. Holds internal plugin clipboard for structured paste.
 */
export function createClipboardManager(deps: ClipboardManagerDeps): ClipboardHandlers {
    const executeCopy = (): boolean => {
        const { state, selectionManager, wrapper } = deps;
        const selectedIds = selectionManager.getSelectedIds();
        if (selectedIds.length === 0) return false;

        let minR = Infinity,
            maxR = -Infinity,
            minC = Infinity,
            maxC = -Infinity;
        selectedIds.forEach((id) => {
            const match = id.match(/^([A-Z]+)(\d+)$/i);
            if (match) {
                const c = lettersToColumnIndex(match[1]);
                const r = parseInt(match[2], 10);
                if (c < minC) minC = c;
                if (c > maxC) maxC = c;
                if (r < minR) minR = r;
                if (r > maxR) maxR = r;
            }
        });

        const matrix: any[][] = [];
        const tsvRows: string[] = [];

        for (let r = minR; r <= maxR; r++) {
            const rowData: any[] = [];
            const tsvCols: string[] = [];
            for (let c = minC; c <= maxC; c++) {
                const id = `${columnIndexToLetters(c)}${r}`;
                const cell = state.getCell(id);
                rowData.push(cell ? JSON.parse(JSON.stringify(cell)) : null);
                const td = wrapper.querySelector(`td[data-cell-id="${id}"]`);
                tsvCols.push(td ? td.textContent || '' : cell ? String(cell.value || '') : '');
            }
            matrix.push(rowData);
            tsvRows.push(tsvCols.join('\t'));
        }

        const tsv = tsvRows.join('\n');
        void navigator.clipboard.writeText(tsv);
        pluginClipboard = { text: tsv, matrix, minC, minR };

        wrapper.querySelectorAll('.is-copied-highlight').forEach((el) => el.classList.remove('is-copied-highlight'));
        selectedIds.forEach((id) => {
            const td = wrapper.querySelector(`td[data-cell-id="${id}"]`);
            if (td) td.classList.add('is-copied-highlight');
        });
        return true;
    };

    const executeCut = () => {
        const { state, selectionManager, engine, refreshCellDisplay, saveWithHistory } = deps;
        if (!executeCopy()) return;

        const selectedIds = selectionManager.getSelectedIds();
        selectedIds.forEach((id) => {
            const cell = state.ensureCell(id);
            cell.value = '';
            cell.formula = undefined;
            state.setCell(id, cell);

            const { updated } = engine.updateCellAndDependents(id);
            [id, ...updated].forEach((uid) => refreshCellDisplay(uid));
        });

        state.markDirty();
        saveWithHistory();
    };

    const executePaste = (text: string) => {
        const { state, selectionManager, engine, refreshCellDisplay, saveWithHistory, rerender } = deps;
        const activeId = selectionManager.getActiveCellId();
        if (!activeId) return;

        const match = activeId.match(/^([A-Z]+)(\d+)$/i);
        if (!match) return;
        const startCol = lettersToColumnIndex(match[1]);
        const startRow = parseInt(match[2], 10);

        let requiredRows = startRow;
        let requiredCols = startCol;

        if (pluginClipboard && pluginClipboard.text === text) {
            requiredRows = startRow + pluginClipboard.matrix.length - 1;
            requiredCols = startCol + (pluginClipboard.matrix[0]?.length || 1) - 1;
        } else {
            const pasteLines = text.split(/\r?\n/);
            const validRows = pasteLines[pasteLines.length - 1] === '' ? pasteLines.length - 1 : pasteLines.length;
            requiredRows = startRow + validRows - 1;

            let maxColsInText = 0;
            for (let i = 0; i < validRows; i++) {
                maxColsInText = Math.max(maxColsInText, pasteLines[i].split('\t').length);
            }
            requiredCols = startCol + maxColsInText - 1;
        }

        requiredRows = Math.min(requiredRows, 200);
        requiredCols = Math.min(requiredCols, 200);

        let didExpand = false;
        while (state.maxRow < requiredRows) {
            Actions.insertRow(state, state.maxRow + 1);
            didExpand = true;
        }
        while (state.maxCol < requiredCols) {
            Actions.insertCol(state, state.maxCol + 1, state.maxRow);
            didExpand = true;
        }

        if (didExpand) {
            state.recalculateExtents();
        }

        const cellsToRefresh = new Set<string>();
        let needsRerender = didExpand;

        if (pluginClipboard && pluginClipboard.text === text) {
            const matrix = pluginClipboard.matrix;
            const dCol = startCol - pluginClipboard.minC;
            const dRow = startRow - pluginClipboard.minR;
            for (let rowOffset = 0; rowOffset < matrix.length; rowOffset++) {
                for (let colOffset = 0; colOffset < matrix[rowOffset].length; colOffset++) {
                    const sourceCell = matrix[rowOffset][colOffset];
                    if (!sourceCell) continue;

                    const targetCol = startCol + colOffset;
                    const targetRow = startRow + rowOffset;
                    const targetId = `${columnIndexToLetters(targetCol)}${targetRow}`;

                    if (targetCol > state.maxCol || targetRow > state.maxRow) needsRerender = true;

                    const newCell = { ...sourceCell } as CellData;
                    if (newCell.formula) {
                        newCell.formula = Actions.shiftFormulaByOffset(newCell.formula, dCol, dRow);
                    }
                    state.setCell(targetId, newCell);
                    cellsToRefresh.add(targetId);
                }
            }
        } else {
            const pasteLines = text.split(/\r?\n/);
            for (let rowOffset = 0; rowOffset < pasteLines.length; rowOffset++) {
                if (!pasteLines[rowOffset] && rowOffset === pasteLines.length - 1) continue;
                const rowCells = pasteLines[rowOffset].split('\t');
                for (let colOffset = 0; colOffset < rowCells.length; colOffset++) {
                    const targetCol = startCol + colOffset;
                    const targetRow = startRow + rowOffset;
                    const targetId = `${columnIndexToLetters(targetCol)}${targetRow}`;

                    if (targetCol > state.maxCol || targetRow > state.maxRow) needsRerender = true;

                    let parsed: string | number = rowCells[colOffset].trim();
                    const asNum = Number(parsed.replace(/,/g, ''));
                    if (!isNaN(asNum) && parsed !== '') parsed = asNum;

                    const cell = state.ensureCell(targetId);
                    cell.value = parsed;
                    cell.formula = typeof parsed === 'string' && parsed.startsWith('=') ? parsed : undefined;
                    state.setCell(targetId, cell);
                    cellsToRefresh.add(targetId);
                }
            }
        }

        state.recalculateExtents();
        state.markDirty();

        const toProcess = [...cellsToRefresh];
        for (let i = 0; i < toProcess.length; i++) {
            const id = toProcess[i];
            const { updated } = engine.updateCellAndDependents(id);
            for (const depId of updated) {
                if (!cellsToRefresh.has(depId)) {
                    cellsToRefresh.add(depId);
                    toProcess.push(depId);
                }
            }
        }

        if (needsRerender) {
            saveWithHistory();
            rerender();
        } else {
            cellsToRefresh.forEach((id) => refreshCellDisplay(id));
            saveWithHistory();
        }
    };

    return { executeCopy, executeCut, executePaste };
}
