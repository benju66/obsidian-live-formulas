import { TableState, CellData, columnIndexToLetters, lettersToColumnIndex } from './tableState';
import { transformFormulaPreservingLiterals } from './formulaMasking';

export const shiftFormulaByOffset = (formula: string, colOffset: number, rowOffset: number): string => {
    return transformFormulaPreservingLiterals(formula, (masked) =>
        masked.replace(/(\$?)([A-Z]+)(\$?)(\d+)\b/gi, (match, colAnchor, colStr, rowAnchor, rowStr) => {
            let c = lettersToColumnIndex(colStr.toUpperCase());
            let r = parseInt(rowStr, 10);

            if (colAnchor !== '$') c += colOffset;
            if (rowAnchor !== '$') r += rowOffset;

            if (r < 1 || c < 1) return '#REF!';
            return `${colAnchor}${columnIndexToLetters(c)}${rowAnchor}${r}`;
        })
    );
};

/**
 * Updates cell references in a formula when a row or column is inserted or deleted,
 * respecting Excel-style absolute anchors ($A$1, $A1, A$1).
 */
export const shiftFormulaReferences = (formula: string, type: 'row' | 'col', threshold: number, amount: number): string => {
    return transformFormulaPreservingLiterals(formula, (masked) =>
        masked.replace(/(\$?)([A-Z]+)(\$?)(\d+)\b/gi, (match, colAnchor, colStr, rowAnchor, rowStr) => {
            let c = lettersToColumnIndex(colStr.toUpperCase());
            let r = parseInt(rowStr, 10);

            const isColAbsolute = colAnchor === '$';
            const isRowAbsolute = rowAnchor === '$';

            if (amount < 0) {
                if (
                    (type === 'row' && r === threshold && !isRowAbsolute) ||
                    (type === 'col' && c === threshold && !isColAbsolute)
                ) {
                    return '#REF!';
                }
                if (type === 'row' && r > threshold && !isRowAbsolute) {
                    r += amount;
                } else if (type === 'col' && c > threshold && !isColAbsolute) {
                    c += amount;
                }
            } else {
                if (type === 'row' && r >= threshold && !isRowAbsolute) {
                    r += amount;
                } else if (type === 'col' && c >= threshold && !isColAbsolute) {
                    c += amount;
                }
            }

            if (r < 1 || c < 1) return '#REF!';

            return `${colAnchor}${columnIndexToLetters(c)}${rowAnchor}${r}`;
        })
    );
};

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

    for (const [, cell] of state.cells) {
        if (cell.formula) {
            cell.formula = shiftFormulaReferences(cell.formula, 'row', targetRow, 1);
            cell.value = cell.formula;
        }
    }

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

    for (const [, cell] of state.cells) {
        if (cell.formula) {
            cell.formula = shiftFormulaReferences(cell.formula, 'row', targetRow, -1);
            cell.value = cell.formula;
        }
    }

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

    for (const [, cell] of state.cells) {
        if (cell.formula) {
            cell.formula = shiftFormulaReferences(cell.formula, 'col', insertBeforeIndex, 1);
            cell.value = cell.formula;
        }
    }

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

    for (const [, cell] of state.cells) {
        if (cell.formula) {
            cell.formula = shiftFormulaReferences(cell.formula, 'col', columnIndex, -1);
            cell.value = cell.formula;
        }
    }

    state.markDirty();
};

/**
 * Copies a formula from a source cell to a target cell,
 * incrementing relative references by the column/row offset between cells.
 */
export const fillFormulaToRange = (state: TableState, sourceCellId: string, targetCellId: string) => {
    const sourceCell = state.getCell(sourceCellId);
    if (!sourceCell) return;

    const formatObj = { ...(sourceCell.format || {}) };

    if (!sourceCell.formula) {
        state.setCell(targetCellId, { value: sourceCell.value, formula: undefined, format: formatObj });
        state.markDirty();
        return;
    }

    const match1 = sourceCellId.match(/^([A-Z]+)(\d+)$/i);
    const match2 = targetCellId.match(/^([A-Z]+)(\d+)$/i);
    if (!match1 || !match2) return;

    const c1 = lettersToColumnIndex(match1[1]);
    const r1 = parseInt(match1[2], 10);
    const c2 = lettersToColumnIndex(match2[1]);
    const r2 = parseInt(match2[2], 10);

    const colOffset = c2 - c1;
    const rowOffset = r2 - r1;

    const newFormula = shiftFormulaByOffset(sourceCell.formula, colOffset, rowOffset);

    state.setCell(targetCellId, { value: newFormula, formula: newFormula, format: formatObj });
    state.markDirty();
};
