import { type TableState, columnIndexToLetters, lettersToColumnIndex } from './tableState';

/** Masks scientific notation so `1e-3` is not mistaken for cell E3. */
export function maskScientificNotation(input: string): { text: string; tokens: string[] } {
    const tokens: string[] = [];
    const text = input.replace(/\d+(\.\d+)?[Ee][+-]?\d+/g, (match) => {
        tokens.push(match);
        return `__SCI_${tokens.length}__`;
    });
    return { text, tokens };
}

export function unmaskScientificNotation(text: string, tokens: string[]): string {
    let out = text;
    for (let i = 0; i < tokens.length; i++) {
        out = out.split(`__SCI_${i + 1}__`).join(tokens[i]);
    }
    return out;
}

/**
 * All cell ids (uppercase) referenced by a formula string.
 * Supports SUM ranges, SUM lists, and bare A1-style refs.
 */
export function extractCellRefsFromFormula(formula: string): string[] {
    const refs = new Set<string>();
    const body = (formula.trim().startsWith('=') ? formula.trim().slice(1) : formula.trim()).trim();
    const { text: masked } = maskScientificNotation(body);
    const u = masked.toUpperCase();

    let m: RegExpExecArray | null;
    const rangeRe = /SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g;
    while ((m = rangeRe.exec(u))) {
        const sc = m[1];
        const sr = parseInt(m[2], 10);
        const ec = m[3];
        const er = parseInt(m[4], 10);

        const c1 = lettersToColumnIndex(sc);
        const c2 = lettersToColumnIndex(ec);
        const minC = Math.min(c1, c2);
        const maxC = Math.max(c1, c2);
        const minR = Math.min(sr, er);
        const maxR = Math.max(sr, er);

        for (let col = minC; col <= maxC; col++) {
            const colStr = columnIndexToLetters(col);
            for (let row = minR; row <= maxR; row++) {
                refs.add(`${colStr}${row}`);
            }
        }
    }

    const sumListRe = /SUM\(([^)]+)\)/g;
    while ((m = sumListRe.exec(u))) {
        const parts = m[1].split(',').map((s) => s.trim().toUpperCase());
        for (const p of parts) {
            if (/^[A-Z]+\d+$/.test(p)) refs.add(p);
        }
    }

    const bareRe = /\b([A-Z]+\d+)\b/g;
    while ((m = bareRe.exec(u))) {
        refs.add(m[1]);
    }

    return [...refs];
}

export class DependencyGraph {
    /** refCell -> formula cells that reference refCell */
    dependents: Map<string, Set<string>> = new Map();

    clear(): void {
        this.dependents.clear();
    }

    /** refCell is referenced by dependentCell's formula. */
    addDependency(refCell: string, dependentCell: string): void {
        const r = refCell.toUpperCase();
        const d = dependentCell.toUpperCase();
        if (!this.dependents.has(r)) this.dependents.set(r, new Set());
        this.dependents.get(r)!.add(d);
    }

    getTransitiveDependents(start: string): Set<string> {
        const s = start.toUpperCase();
        const out = new Set<string>();
        const queue = [...(this.dependents.get(s) || [])];
        while (queue.length) {
            const c = queue.shift()!;
            if (out.has(c)) continue;
            out.add(c);
            for (const d of this.dependents.get(c) || []) queue.push(d);
        }
        return out;
    }
}

/**
 * DFS postorder: dependencies (formula cells) before dependents.
 * Throws if a cycle is detected among formula cells.
 */
export function topologicalSortFormulaCells(affected: Set<string>, state: TableState): string[] {
    const order: string[] = [];
    const visiting = new Set<string>();
    const done = new Set<string>();

    function visit(F: string): void {
        if (done.has(F)) return;
        if (visiting.has(F)) throw new Error('cycle');
        const cell = state.getCell(F);
        if (!cell?.formula) return;
        visiting.add(F);
        for (const R of extractCellRefsFromFormula(cell.formula)) {
            const refCell = state.getCell(R);
            if (refCell?.formula) visit(R);
        }
        visiting.delete(F);
        done.add(F);
        order.push(F);
    }

    for (const F of affected) {
        if (state.getCell(F)?.formula) visit(F);
    }

    return order;
}
