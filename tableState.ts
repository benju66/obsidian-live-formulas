/** Cell id -> optional formula + format (values live in the markdown table body). */
export type LiveTableMeta = Record<
    string,
    { formula?: string; format?: CellData['format'] }
>;

export interface CellData {
    value: any;
    formula?: string;
    format: {
        bold?: boolean;
        align?: 'left' | 'center' | 'right';
        type?: 'plain' | 'currency' | 'percent';
        decimals?: number;
    };
}

const META_PREFIX = '<!-- obsidian-live-formulas:';
const META_SUFFIX = ' -->';

function emptyFormat(): CellData['format'] {
    return {};
}

/** 1-based column index → Excel-style letters (1→A, 26→Z, 27→AA). */
export function columnIndexToLetters(index: number): string {
    let n = index;
    let s = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s || 'A';
}

/** Excel-style column letters → 1-based index (A→1, Z→26, AA→27). */
export function lettersToColumnIndex(letters: string): number {
    let n = 0;
    const u = letters.toUpperCase();
    for (let i = 0; i < u.length; i++) {
        n = n * 26 + (u.charCodeAt(i) - 64);
    }
    return n;
}

function splitTableLine(line: string): string[] {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);

    const parts: string[] = [];
    let current = '';

    // Custom loop to safely split on '|' while ignoring '\|'
    // Compatible with all JS engines (avoids iOS <16.4 WebKit regex crash)
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '|' && (i === 0 || s[i - 1] !== '\\')) {
            parts.push(current);
            current = '';
        } else {
            current += s[i];
        }
    }
    parts.push(current);

    // Unescape the markdown pipe if the user manually typed \|
    return parts.map((c) => c.trim().replace(/\\\|/g, '|'));
}

function parseCellText(text: string): { value: any; formula?: string } {
    // Migration layer: seamlessly convert legacy &#124; from older saves back to standard pipes
    const t = text.trim().replace(/&#124;/g, '|');

    if (t.startsWith('=')) {
        return { value: t, formula: t };
    }
    if (t === '') return { value: '' };
    const stripped = t.replace(/,/g, '');
    const asNum = Number(stripped);
    if (!isNaN(asNum) && stripped !== '') {
        return { value: asNum };
    }
    return { value: t };
}

function isSeparatorRow(parts: string[]): boolean {
    if (parts.length === 0) return false;
    return parts.every((p) => /^-+$/.test(p.replace(/:/g, '').trim()) || /^:?-+:?$/.test(p));
}

export class TableState {
    cells: Map<string, CellData> = new Map();
    maxRow = 1;
    maxCol = 1;
    dirty = false;

    // FIX: Track if the dependency graph needs rebuilding
    structureDirty = true;

    // FIX: Unique id per table; legacy tables without meta get one on first load
    public tableName = Math.random().toString(36).slice(2, 9);

    markDirty(): void {
        this.dirty = true;
    }

    clearDirty(): void {
        this.dirty = false;
    }

    getCell(id: string): CellData | undefined {
        return this.cells.get(id);
    }

    setCell(id: string, data: CellData): void {
        const m = id.match(/^([A-Z]+)(\d+)$/i);
        if (m) {
            const col = lettersToColumnIndex(m[1]);
            const row = parseInt(m[2], 10);
            if (row > this.maxRow) this.maxRow = row;
            if (col > this.maxCol) this.maxCol = col;
        }
        if (!data.format) data.format = emptyFormat();

        // FIX: Formula add/remove/edit requires graph rebuild; plain value edits do not
        const existing = this.cells.get(id);
        if (!existing || existing.formula !== data.formula) {
            this.structureDirty = true;
        }

        this.cells.set(id, data);
    }

    ensureCell(id: string): CellData {
        let c = this.cells.get(id);
        if (!c) {
            c = { value: '', format: emptyFormat() };
            this.setCell(id, c);
        }
        return c;
    }

    /** Column headers A.. for current width (single- and multi-letter supported). */
    getColumnLetters(): string[] {
        const out: string[] = [];
        for (let c = 1; c <= this.maxCol; c++) out.push(columnIndexToLetters(c));
        return out;
    }

    /** Flat record for formula evaluation (same shape as legacy tableData). */
    toMathRecord(): Record<string, any> {
        const out: Record<string, any> = {};
        for (const [id, cell] of this.cells) {
            if (cell.formula) {
                const f = cell.formula;
                out[id] = f.startsWith('=') ? f : `=${f}`;
            } else {
                out[id] = cell.value;
            }
        }
        return out;
    }

    toMarkdownText(): string {
        const meta: Record<string, unknown> = {};
        if (this.tableName) meta.tableName = this.tableName;
        for (const [id, cell] of this.cells) {
            const hasFormula = !!cell.formula;
            const fmt = cell.format || emptyFormat();
            const hasFormat =
                fmt.bold ||
                fmt.align ||
                (fmt.type && fmt.type !== 'plain') ||
                fmt.decimals !== undefined;
            if (hasFormula || hasFormat) {
                (meta as LiveTableMeta)[id] = {};
                if (hasFormula) (meta as LiveTableMeta)[id].formula = cell.formula;
                if (hasFormat) (meta as LiveTableMeta)[id].format = { ...fmt };
            }
        }

        const metaJson = JSON.stringify(meta);
        const lines: string[] = [`${META_PREFIX}${metaJson}${META_SUFFIX}`];

        const cols = this.maxCol;
        const rows = this.maxRow;
        const headerParts: string[] = [];
        for (let c = 1; c <= cols; c++) headerParts.push(columnIndexToLetters(c));

        lines.push('| ' + headerParts.join(' | ') + ' |');
        lines.push('| ' + headerParts.map(() => '---').join(' | ') + ' |');

        for (let r = 1; r <= rows; r++) {
            const parts: string[] = [];
            for (let c = 1; c <= cols; c++) {
                const id = `${columnIndexToLetters(c)}${r}`;
                const cell = this.cells.get(id);
                parts.push(stringifyCellForMarkdown(cell));
            }
            lines.push('| ' + parts.join(' | ') + ' |');
        }

        return lines.join('\n');
    }

    static fromMarkdownText(text: string): TableState {
        const state = new TableState();
        const raw = text.replace(/\r\n/g, '\n').trim();
        if (!raw) {
            state.seedDefaultGrid();
            return state;
        }

        let rest = raw;
        let meta: LiveTableMeta = {};
        const metaMatch = rest.match(/^\s*<!--\s*obsidian-live-formulas:\s*([\s\S]*?)\s*-->\s*/);
        if (metaMatch) {
            try {
                meta = JSON.parse(metaMatch[1]) as LiveTableMeta;
            } catch {
                meta = {};
            }
            rest = rest.slice(metaMatch[0].length);
            const metaJson = meta as Record<string, unknown>;
            if (typeof metaJson.tableName === 'string') state.tableName = metaJson.tableName;
        }

        const tableLines = rest
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        if (tableLines.length < 2) {
            state.mergeMeta(meta);
            state.recomputeExtents();
            if (state.cells.size === 0) state.seedDefaultGrid();
            return state;
        }

        const headerParts = splitTableLine(tableLines[0]);
        const sepParts = splitTableLine(tableLines[1]);
        if (!isSeparatorRow(sepParts)) {
            state.mergeMeta(meta);
            state.recomputeExtents();
            if (state.cells.size === 0) state.seedDefaultGrid();
            return state;
        }

        const numCols = headerParts.length;
        state.maxCol = Math.max(state.maxCol, numCols);

        for (let i = 0; i < numCols; i++) {
            state.maxCol = Math.max(state.maxCol, i + 1);
        }

        const bodyLines = tableLines.slice(2);
        let rowNum = 0;
        for (const line of bodyLines) {
            rowNum++;
            const parts = splitTableLine(line);
            for (let c = 0; c < numCols; c++) {
                const id = `${columnIndexToLetters(c + 1)}${rowNum}`;
                const cellText = parts[c] ?? '';
                const parsed = parseCellText(cellText);
                const m = meta[id];
                const format = (m?.format && { ...m.format }) || emptyFormat();
                const formulaFromMeta = m?.formula;
                const formulaFromCell = parsed.formula;
                let formulaStr = formulaFromMeta ?? formulaFromCell;
                if (formulaStr && !formulaStr.startsWith('=')) {
                    formulaStr = `=${formulaStr}`;
                }
                if (formulaStr) {
                    state.setCell(id, {
                        value: formulaStr,
                        formula: formulaStr,
                        format,
                    });
                } else {
                    state.setCell(id, {
                        value: parsed.value,
                        format,
                    });
                }
            }
        }

        state.maxRow = Math.max(state.maxRow, rowNum || 1);

        state.recomputeExtents();
        return state;
    }

    /** Try legacy JSON blocks first, then markdown. */
    static parseBlockSource(source: string): TableState {
        const t = source.trim();
        if (!t) {
            const s = new TableState();
            s.seedDefaultGrid();
            return s;
        }
        if (t.startsWith('{')) {
            try {
                return TableState.fromLegacyJson(JSON.parse(t) as Record<string, any>);
            } catch {
                /* fall through */
            }
        }
        return TableState.fromMarkdownText(t);
    }

    /** Apply meta entries that might not have been in table body (edge cases). */
    private mergeMeta(meta: LiveTableMeta): void {
        for (const [id, entry] of Object.entries(meta)) {
            if (!/^([A-Z]+)(\d+)$/i.test(id)) continue;
            const cur = this.cells.get(id) || { value: '', format: emptyFormat() };
            if (entry.formula) {
                const f = entry.formula.startsWith('=') ? entry.formula : `=${entry.formula}`;
                cur.formula = f;
                cur.value = f;
            }
            if (entry.format) {
                cur.format = { ...cur.format, ...entry.format };
            }
            this.setCell(id, cur);
        }
    }

    private recomputeExtents(): void {
        let mr = 1;
        let mc = 1;
        for (const id of this.cells.keys()) {
            const m = id.match(/^([A-Z]+)(\d+)$/i);
            if (!m) continue;
            const col = lettersToColumnIndex(m[1]);
            const row = parseInt(m[2], 10);
            if (row > mr) mr = row;
            if (col > mc) mc = col;
        }
        this.maxRow = mr;
        this.maxCol = mc;
    }

    /** Call after bulk cell map edits (row/column insert/delete). */
    recalculateExtents(): void {
        this.recomputeExtents();
    }

    /** Empty grid; `rows` / `cols` are 1–based counts (default 2×2). */
    seedDefaultGrid(rows = 2, cols = 2): void {
        this.cells.clear();
        this.maxRow = rows;
        this.maxCol = cols;
        for (let r = 1; r <= rows; r++) {
            for (let c = 1; c <= cols; c++) {
                const colStr = columnIndexToLetters(c);
                this.setCell(`${colStr}${r}`, { value: '', format: emptyFormat() });
            }
        }
    }

    static fromLegacyJson(obj: Record<string, any>): TableState {
        const state = new TableState();
        const fmtRoot = (obj._format && typeof obj._format === 'object' ? obj._format : {}) as Record<string, CellData['format']>;

        for (const [key, rawVal] of Object.entries(obj)) {
            if (key === '_format') continue;
            const m = key.match(/^([A-Z]+)(\d+)$/i);
            if (!m) continue;
            const format = { ...emptyFormat(), ...(fmtRoot[key] || {}) };
            let value: any = rawVal;
            let formula: string | undefined;
            if (typeof rawVal === 'string' && rawVal.startsWith('=')) {
                formula = rawVal;
                value = rawVal;
            }
            state.setCell(key, { value, formula, format });
        }

        state.recomputeExtents();
        if (state.cells.size === 0) state.seedDefaultGrid();
        return state;
    }
}

function stringifyCellForMarkdown(cell: CellData | undefined): string {
    if (!cell) return '';
    let rawStr = '';
    if (cell.formula) {
        const f = cell.formula;
        rawStr = f.startsWith('=') ? f : `=${f}`;
    } else {
        const v = cell.value;
        if (v !== undefined && v !== null) {
            rawStr = String(v);
        }
    }

    // Custom loop to safely escape '|' to '\|' without regex lookbehinds
    let escapedStr = '';
    for (let i = 0; i < rawStr.length; i++) {
        if (rawStr[i] === '|' && (i === 0 || rawStr[i - 1] !== '\\')) {
            escapedStr += '\\|';
        } else {
            escapedStr += rawStr[i];
        }
    }
    return escapedStr;
}
