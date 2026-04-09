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

export const fillSmartSeries = (state: TableState, sourceIds: string[], targetIds: string[]) => {
    if (sourceIds.length === 0 || targetIds.length === 0) return;
    
    // Sort sources by Row, then Col
    const parseId = (id: string) => {
        const match = id.match(/^([A-Z]+)(\d+)$/i);
        return match ? { c: lettersToColumnIndex(match[1]), r: parseInt(match[2], 10), id } : null;
    };
    
    let sources = sourceIds.map(parseId).filter(x => x !== null) as {c:number, r:number, id:string}[];
    let targets = targetIds.map(parseId).filter(x => x !== null) as {c:number, r:number, id:string}[];
    
    // Determine fill direction based on targets bounding box compared to sources bounding box
    const sMinR = Math.min(...sources.map(s => s.r));
    const sMaxR = Math.max(...sources.map(s => s.r));
    const sMinC = Math.min(...sources.map(s => s.c));
    const sMaxC = Math.max(...sources.map(s => s.c));
    
    const tMinR = Math.min(...targets.map(t => t.r));
    const tMaxR = Math.max(...targets.map(t => t.r));
    const tMinC = Math.min(...targets.map(t => t.c));
    const tMaxC = Math.max(...targets.map(t => t.c));
    
    const isVerticalFill = tMaxR > sMaxR || tMinR < sMinR;
    const isHorizontalFill = tMaxC > sMaxC || tMinC < sMinC;
    
    // For simplicity, we process row-wise if vertical, col-wise if horizontal
    // Group targets into lanes (columns if vertical, rows if horizontal)
    if (isVerticalFill) {
        for (let col = sMinC; col <= sMaxC; col++) {
            const laneSources = sources.filter(s => s.c === col).sort((a,b) => a.r - b.r);
            const laneTargets = targets.filter(t => t.c === col).sort((a,b) => a.r - b.r);
            if (laneSources.length === 0 || laneTargets.length === 0) continue;
            
            // Check if lane is a numeric series
            let isNumericSeries = false;
            let delta = 0;
            if (laneSources.length > 1) {
                const vals = laneSources.map(s => {
                    const cell = state.getCell(s.id);
                    return cell && typeof cell.value === 'number' && !cell.formula ? cell.value : null;
                });
                if (vals.every(v => v !== null)) {
                    isNumericSeries = true;
                    delta = (vals[vals.length - 1] as number) - (vals[vals.length - 2] as number);
                }
            }
            
            laneTargets.forEach((target, index) => {
                const srcIdx = index % laneSources.length;
                const source = laneSources[srcIdx];
                const sourceCell = state.getCell(source.id);
                if (!sourceCell) return;
                
                if (sourceCell.formula) {
                    const rowOffset = target.r - source.r;
                    const newFormula = shiftFormulaByOffset(sourceCell.formula, 0, rowOffset);
                    state.setCell(target.id, { value: newFormula, formula: newFormula, format: {...sourceCell.format} });
                } else if (isNumericSeries) {
                    const lastVal = state.getCell(laneSources[laneSources.length - 1].id)?.value as number;
                    const iterations = index + 1;
                    const newVal = lastVal + (delta * iterations);
                    state.setCell(target.id, { value: newVal, formula: undefined, format: {...sourceCell.format} });
                } else {
                    state.setCell(target.id, { value: sourceCell.value, formula: undefined, format: {...sourceCell.format} });
                }
            });
        }
    } else if (isHorizontalFill) {
        // Similar logic for horizontal fills
        for (let row = sMinR; row <= sMaxR; row++) {
            const laneSources = sources.filter(s => s.r === row).sort((a,b) => a.c - b.c);
            const laneTargets = targets.filter(t => t.r === row).sort((a,b) => a.c - b.c);
            if (laneSources.length === 0 || laneTargets.length === 0) continue;
            
            let isNumericSeries = false;
            let delta = 0;
            if (laneSources.length > 1) {
                const vals = laneSources.map(s => {
                    const cell = state.getCell(s.id);
                    return cell && typeof cell.value === 'number' && !cell.formula ? cell.value : null;
                });
                if (vals.every(v => v !== null)) {
                    isNumericSeries = true;
                    delta = (vals[vals.length - 1] as number) - (vals[vals.length - 2] as number);
                }
            }
            
            laneTargets.forEach((target, index) => {
                const srcIdx = index % laneSources.length;
                const source = laneSources[srcIdx];
                const sourceCell = state.getCell(source.id);
                if (!sourceCell) return;
                
                if (sourceCell.formula) {
                    const colOffset = target.c - source.c;
                    const newFormula = shiftFormulaByOffset(sourceCell.formula, colOffset, 0);
                    state.setCell(target.id, { value: newFormula, formula: newFormula, format: {...sourceCell.format} });
                } else if (isNumericSeries) {
                    const lastVal = state.getCell(laneSources[laneSources.length - 1].id)?.value as number;
                    const iterations = index + 1;
                    const newVal = lastVal + (delta * iterations);
                    state.setCell(target.id, { value: newVal, formula: undefined, format: {...sourceCell.format} });
                } else {
                    state.setCell(target.id, { value: sourceCell.value, formula: undefined, format: {...sourceCell.format} });
                }
            });
        }
    }
    
    state.markDirty();
};
