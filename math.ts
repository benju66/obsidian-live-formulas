import { Parser } from 'expr-eval';
import { TableState, lettersToColumnIndex, columnIndexToLetters } from './tableState';
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
        // Safely skip both single and double quoted strings
        if (expr[i] === '"' || expr[i] === "'") {
            const quote = expr[i];
            const end = expr.indexOf(quote, i + 1);
            if (end === -1) {
                result += expr.slice(i);
                break;
            }
            result += expr.slice(i, end + 1);
            i = end + 1;
            continue;
        }
        // Match cell refs with optional $ anchors
        const m = slice.match(/^(\$?[A-Z]+\$?\d+)\b/);
        if (m) {
            const clean = m[1].replace(/\$/g, '');
            result += `CELL('${clean}')`;
            i += m[1].length;
        } else {
            result += expr[i];
            i++;
        }
    }
    return result;
}

/** Wrap unquoted A1:B10 ranges in single quotes so expr-eval does not treat `:` as an operator. */
function preprocessExcelRanges(body: string): string {
    return body.replace(/(?<!["'])\b(\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+)\b(?!["'])/gi, "'$1'");
}

/**
 * Convert a spreadsheet formula (=...) into a safe expr-eval expression using CELL('A1') lookups.
 * SUM ranges expand before range quoting; preserves string case (masked before uppercase) and scientific notation.
 */
export function formulaToExpr(formula: string): string {
    const raw = formula.trim();
    let body = raw.startsWith('=') ? raw.slice(1) : raw;

    // 1. Mask strings BEFORE toUpperCase() to preserve case-sensitivity
    const stringTokens: string[] = [];
    body = body.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
        stringTokens.push(match);
        return `"__STR${stringTokens.length - 1}__"`;
    });

    // 2. Mask scientific notation
    const { text: masked, tokens } = maskScientificNotation(body);

    // 3. UpperCase execution
    let e = masked.toUpperCase();

    // 4. Expand SUM ranges (e.g. SUM(A1:B2) or SUM($A$1:B2))
    e = e.replace(/SUM\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)/g, (_m, sc: string, sr: string, ec: string, er: string) => {
        const r1 = parseInt(sr, 10);
        const r2 = parseInt(er, 10);
        const c1 = lettersToColumnIndex(sc);
        const c2 = lettersToColumnIndex(ec);

        const parts: string[] = [];
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
            const colStr = columnIndexToLetters(c);
            for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
                parts.push(`CELL('${colStr}${r}')`);
            }
        }
        return parts.length ? `SUM(${parts.join(',')})` : '0';
    });

    // Expand SUM lists (e.g. SUM(A1, B2)) ignoring $ anchors
    e = e.replace(/SUM\(([^)]+)\)/g, (_match, inner: string) => {
        const parts = inner.split(',').map((s: string) => {
            const t = s.trim().toUpperCase();
            if (/^\$?[A-Z]+\$?\d+$/.test(t)) {
                const clean = t.replace(/\$/g, '');
                return `CELL('${clean}')`;
            }
            return s.trim();
        });
        return `SUM(${parts.join(',')})`;
    });

    // 5. Quote remaining ranges for VLOOKUP (e.g. A1:B10 -> 'A1:B10')
    e = preprocessExcelRanges(e);

    // 6. Replace bare cell references
    e = replaceBareCellRefs(e);

    // 7. Unmask scientific
    if (tokens.length) {
        e = unmaskScientificNotation(e, tokens);
    }

    // 8. Unmask strings back to their original case
    e = e.replace(/"__STR(\d+)__"/g, (_, i) => stringTokens[parseInt(i, 10)]);

    return e;
}

export class MathEngine {
    private parser: Parser;
    private dependencyGraph = new DependencyGraph();
    private evalVisiting = new Set<string>();
    private batchNumericCache: Map<string, unknown> | null = null;

    constructor(private state: TableState) {
        this.parser = new Parser();

        this.parser.functions.CELL = (cellId: string) => {
            return this.lookupCellRaw(String(cellId).toUpperCase());
        };

        this.parser.functions.SUM = (...args: number[]) => {
            let s = 0;
            for (const a of args) {
                const n = typeof a === 'number' && !isNaN(a) ? a : 0;
                s += Number.isFinite(n) ? n : 0;
            }
            return s;
        };

        this.parser.functions.IF = (condition: unknown, trueVal: unknown, falseVal: unknown) => {
            return condition ? trueVal : falseVal;
        };

        this.parser.functions.AND = (...args: unknown[]) => {
            return args.every((arg) => !!arg);
        };

        this.parser.functions.OR = (...args: unknown[]) => {
            return args.some((arg) => !!arg);
        };

        this.parser.functions.NOT = (condition: unknown) => {
            return !condition;
        };

        this.parser.functions.CONCAT = (...args: unknown[]) => {
            return args.map(String).join('');
        };

        this.parser.functions.TODAY = () => {
            const d = new Date();
            return d.toISOString().split('T')[0];
        };

        this.parser.functions.NOW = () => {
            const d = new Date();
            return d.toISOString().slice(0, 16).replace('T', ' ');
        };

        // Lookup & Reference Functions
        this.parser.functions.VLOOKUP = (
            lookupValue: unknown,
            rangeStr: string,
            colIndex: number,
            _exactMatch = false
        ) => {
            const cleanRange = String(rangeStr).replace(/['"]/g, '').replace(/\$/g, '');
            const match = cleanRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
            if (!match) return '#N/A';

            const c1 = lettersToColumnIndex(match[1].toUpperCase());
            const r1 = parseInt(match[2], 10);
            const c2 = lettersToColumnIndex(match[3].toUpperCase());
            const r2 = parseInt(match[4], 10);

            const minC = Math.min(c1, c2);
            const maxC = Math.max(c1, c2);
            const minR = Math.min(r1, r2);
            const maxR = Math.max(r1, r2);

            if (colIndex < 1 || colIndex > maxC - minC + 1) return '#REF!';

            const targetCol = minC + colIndex - 1;

            const cellFn = this.parser.functions.CELL as (id: string) => unknown;
            for (let r = minR; r <= maxR; r++) {
                const searchCellId = `${columnIndexToLetters(minC)}${r}`;
                const searchVal = cellFn(searchCellId);
                if (searchVal == lookupValue) {
                    const returnCellId = `${columnIndexToLetters(targetCol)}${r}`;
                    return cellFn(returnCellId);
                }
            }

            return '#N/A';
        };
    }

    private lookupCellRaw(id: string): unknown {
        if (this.batchNumericCache?.has(id)) {
            return this.batchNumericCache.get(id)!;
        }
        const cell = this.state.getCell(id);
        if (!cell) return '';
        if (cell.formula) {
            if (this.batchNumericCache !== null) {
                return 0;
            }
            if (this.evalVisiting.has(id)) return NaN;
            this.evalVisiting.add(id);
            try {
                const expr = formulaToExpr(cell.formula);
                const v = this.parser.parse(expr).evaluate({ TRUE: true, FALSE: false });
                if (typeof v === 'number' && !Number.isFinite(v)) return '#NUM!';
                return v;
            } catch {
                return '#VALUE!';
            } finally {
                this.evalVisiting.delete(id);
            }
        }
        const v = cell.value;
        if (v === undefined || v === null || v === '') return '';
        if (typeof v === 'number') return v;
        return v;
    }

    toExpr(formula: string): string {
        return formulaToExpr(formula);
    }

    evaluateFormula(formula: string): number | string {
        const prev = this.batchNumericCache;
        this.batchNumericCache = null;
        try {
            const expr = formulaToExpr(formula);
            const v = this.parser.parse(expr).evaluate({ TRUE: true, FALSE: false });
            if (typeof v === 'number' && !Number.isFinite(v)) return '#NUM!';
            if (typeof v === 'boolean') return String(v);
            return v as number | string;
        } catch {
            return '#VALUE!';
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
                const v = this.parser.parse(expr).evaluate({ TRUE: true, FALSE: false });
                this.batchNumericCache.set(id, v);
                updated.push(id);
            }
        } finally {
            this.batchNumericCache = null;
        }
        return { updated, cyclic: false };
    }
}
