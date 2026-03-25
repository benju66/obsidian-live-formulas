import { TableState, CellData, columnIndexToLetters, lettersToColumnIndex } from './tableState';

function cloneCell(c: CellData): CellData {
    return {
        value: c.value,
        formula: c.formula,
        format: { ...(c.format || {}) },
    };
}

export const insertRow = (state: TableState, targetRow: number) => {
    const cols = state.getColumnLetters();
    const next = new Map<string, CellData>();

    for (const [key, cell] of state.cells) {
        const match = key.match(/^([A-Z]+)(\d+)$/i);
        if (!match) continue;
        const col = match[1];
        const row = parseInt(match[2], 10);
        if (row < targetRow) next.set(key, cloneCell(cell));
        else next.set(`${col}${row + 1}`, cloneCell(cell));
    }
    for (const c of cols) {
        next.set(`${c}${targetRow}`, { value: '', format: {} });
    }

    state.cells = next;
    state.recalculateExtents();
    state.markDirty();
};

export const deleteRow = (state: TableState, targetRow: number) => {
    const next = new Map<string, CellData>();

    for (const [key, cell] of state.cells) {
        const match = key.match(/^([A-Z]+)(\d+)$/i);
        if (!match) continue;
        const col = match[1];
        const row = parseInt(match[2], 10);
        if (row < targetRow) next.set(key, cloneCell(cell));
        else if (row > targetRow) next.set(`${col}${row - 1}`, cloneCell(cell));
    }

    state.cells = next;
    state.recalculateExtents();
    state.markDirty();
};

/**
 * Insert a new empty column before the given 1-based column index (1 = before A).
 * Use insertBeforeIndex = state.maxCol + 1 to append a column at the end.
 */
export const insertCol = (state: TableState, insertBeforeIndex: number, maxRow: number) => {
    const next = new Map<string, CellData>();

    for (const [key, cell] of state.cells) {
        const match = key.match(/^([A-Z]+)(\d+)$/i);
        if (!match) continue;
        const colLetters = match[1];
        const row = parseInt(match[2], 10);
        const colIdx = lettersToColumnIndex(colLetters);
        if (colIdx < insertBeforeIndex) next.set(key, cloneCell(cell));
        else next.set(`${columnIndexToLetters(colIdx + 1)}${row}`, cloneCell(cell));
    }
    for (let r = 1; r <= maxRow; r++) {
        next.set(`${columnIndexToLetters(insertBeforeIndex)}${r}`, { value: '', format: {} });
    }

    state.cells = next;
    state.recalculateExtents();
    state.markDirty();
};

/** Delete the column at 1-based Excel index (1 = A). */
export const deleteCol = (state: TableState, columnIndex: number) => {
    const next = new Map<string, CellData>();

    for (const [key, cell] of state.cells) {
        const match = key.match(/^([A-Z]+)(\d+)$/i);
        if (!match) continue;
        const colLetters = match[1];
        const row = parseInt(match[2], 10);
        const colIdx = lettersToColumnIndex(colLetters);
        if (colIdx < columnIndex) next.set(key, cloneCell(cell));
        else if (colIdx > columnIndex) next.set(`${columnIndexToLetters(colIdx - 1)}${row}`, cloneCell(cell));
    }

    state.cells = next;
    state.recalculateExtents();
    state.markDirty();
};
