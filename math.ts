import { Parser } from 'expr-eval';
import type { TableState } from './tableState';
import {
    DependencyGraph,
    extractCellRefsFromFormula,
    maskScientificNotation,
    topologicalSortFormulaCells,
    unmaskScientificNotation,
} from './dependencyGraph';

function replaceBareCellRefs(expr: string): string {
    let result = '';
    let i = 0;
    while (i < expr.length) {
        const slice = expr.slice(i);
        if (slice.startsWith("CELL('")) {
            const end = expr.indexOf("')", i + 6);
            if (end === -1) {
                result += expr.slice(i);
                break;
            }
            result += expr.slice(i, end + 2);
            i = end + 2;
            continue;
        }
        const m = slice.match(/^([A-Z]+\d+)\b/);
        if (m) {
            result += `CELL('${m[1]}')`;
            i += m[1].length;
        } else {
            result += expr[i];
            i++;
        }
    }
    return result;
}

/**
 * Convert a spreadsheet formula (=...) into a safe expr-eval expression using CELL('A1') lookups.
 * Preserves scientific notation via mask/unmask (no character stripping).
 */
export function formulaToExpr(formula: string): string {
    const raw = formula.trim();
    const body = raw.startsWith('=') ? raw.slice(1) : raw;
    const { text: masked, tokens } = maskScientificNotation(body);
    let e = masked.toUpperCase();

    e = e.replace(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g, (_m, sc: string, sr: string, ec: string, er: string) => {
        const r1 = parseInt(sr, 10);
        const r2 = parseInt(er, 10);
        if (sc !== ec) return '0';
        const parts: string[] = [];
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
            parts.push(`CELL('${sc}${r}')`);
        }
        return parts.length ? `SUM(${parts.join(',')})` : '0';
    });

    e = e.replace(/SUM\(([^)]+)\)/g, (_match, inner: string) => {
        const parts = inner.split(',').map((s: string) => {
            const t = s.trim().toUpperCase();
            if (/^[A-Z]+\d+$/.test(t)) return `CELL('${t}')`;
            return s.trim();
        });
        return `SUM(${parts.join(',')})`;
    });

    e = replaceBareCellRefs(e);

    if (tokens.length) {
        e = unmaskScientificNotation(e, tokens);
    }

    return e;
}

export class MathEngine {
    private parser: Parser;
    private dependencyGraph = new DependencyGraph();
    private evalVisiting = new Set<string>();
    private batchNumericCache: Map<string, number> | null = null;

    constructor(private state: TableState) {
        this.parser = new Parser();
        this.parser.functions.CELL = (cellId: string) => this.lookupCell(String(cellId).toUpperCase());
        this.parser.functions.SUM = (...args: number[]) => {
            let s = 0;
            for (const a of args) {
                const n = typeof a === 'number' && !isNaN(a) ? a : 0;
                s += Number.isFinite(n) ? n : 0;
            }
            return s;
        };
    }

    private numericFromCellValue(value: unknown): number {
        if (typeof value === 'number' && !isNaN(value)) return value;
        if (typeof value === 'string') {
            const stripped = value.replace(/,/g, '');
            const n = Number(stripped);
            return isNaN(n) || stripped === '' ? 0 : n;
        }
        return 0;
    }

    private lookupCell(id: string): number {
        if (this.batchNumericCache?.has(id)) {
            return this.batchNumericCache.get(id)!;
        }
        const cell = this.state.getCell(id);
        if (!cell) return 0;
        if (cell.formula) {
            if (this.batchNumericCache !== null) {
                return 0;
            }
            if (this.evalVisiting.has(id)) return NaN;
            this.evalVisiting.add(id);
            try {
                const expr = formulaToExpr(cell.formula);
                const v = this.parser.parse(expr).evaluate({});
                const n = typeof v === 'number' ? v : 0;
                return Number.isFinite(n) ? n : 0;
            } catch {
                return 0;
            } finally {
                this.evalVisiting.delete(id);
            }
        }
        return this.numericFromCellValue(cell.value);
    }

    toExpr(formula: string): string {
        return formulaToExpr(formula);
    }

    evaluateFormula(formula: string): number {
        const prev = this.batchNumericCache;
        this.batchNumericCache = null;
        try {
            const expr = formulaToExpr(formula);
            const v = this.parser.parse(expr).evaluate({});
            const n = typeof v === 'number' ? v : 0;
            return Number.isFinite(n) ? n : 0;
        } catch {
            return 0;
        } finally {
            this.batchNumericCache = prev;
        }
    }

    rebuildDependentsFromState(): void {
        this.dependencyGraph.clear();
        for (const [id, cell] of this.state.cells) {
            if (!cell.formula) continue;
            const refs = extractCellRefsFromFormula(cell.formula);
            for (const r of refs) {
                this.dependencyGraph.addDependency(r, id);
            }
        }
    }

    /**
     * Recalculate transitive formula dependents of startCellId in dependency order.
     * Does not mutate TableState cell values (display-only numbers come from evaluation).
     */
    updateCellAndDependents(startCellId: string): { updated: string[]; cyclic: boolean } {
        this.rebuildDependentsFromState();
        const affected = this.dependencyGraph.getTransitiveDependents(startCellId);
        if (affected.size === 0) {
            return { updated: [], cyclic: false };
        }
        let order: string[];
        try {
            order = topologicalSortFormulaCells(affected, this.state);
        } catch {
            return { updated: [], cyclic: true };
        }

        const updated: string[] = [];
        this.batchNumericCache = new Map();
        try {
            this.evalVisiting.clear();
            for (const id of order) {
                const cell = this.state.getCell(id);
                if (!cell?.formula) continue;
                const expr = formulaToExpr(cell.formula);
                const v = this.parser.parse(expr).evaluate({});
                const num = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                this.batchNumericCache.set(id, num);
                updated.push(id);
            }
        } finally {
            this.batchNumericCache = null;
        }
        return { updated, cyclic: false };
    }
}
