import { TableState } from '../tableState';
import { MathEngine } from '../math';

const balanceFormulaParens = (formula: string): string => {
    if (!formula.startsWith('=')) return formula;
    let depth = 0;
    for (const ch of formula) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
    }
    if (depth > 0) return formula + ')'.repeat(Math.min(depth, 32));
    return formula;
};

export type CellEditorMoveDirection = 'Up' | 'Down' | 'Left' | 'Right';

export class CellEditor {
    public el: HTMLTextAreaElement;
    private activeCellId: string | null = null;
    private activeTd: HTMLElement | null = null;

    constructor(
        private wrapper: HTMLElement,
        private state: TableState,
        private engine: MathEngine,
        private onSave: (updatedCellIds: string[], moveDirection?: CellEditorMoveDirection) => void
    ) {
        this.el = document.createElement('textarea');
        this.el.className = 'live-formula-floating-editor';
        this.el.style.display = 'none';

        this.wrapper.style.position = 'relative';
        this.wrapper.appendChild(this.el);

        this.attachListeners();
    }

    private attachListeners() {
        this.wrapper.addEventListener('dblclick', (e) => {
            const target = e.target as HTMLElement;
            const td = target.closest('.live-formula-cell') as HTMLElement;
            if (td) {
                const cellId = td.getAttribute('data-cell-id');
                if (cellId) this.open(cellId, td);
            }
        });

        this.el.addEventListener('blur', () => this.commitAndClose());

        this.el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.commitAndClose(e.shiftKey ? 'Up' : 'Down');
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.commitAndClose(e.shiftKey ? 'Left' : 'Right');
            }
        });
    }

    public injectReference(cellId: string) {
        const start = this.el.selectionStart ?? this.el.value.length;
        const end = this.el.selectionEnd ?? this.el.value.length;
        this.el.value = this.el.value.substring(0, start) + cellId + this.el.value.substring(end);
        this.el.setSelectionRange(start + cellId.length, start + cellId.length);
        this.el.focus();
    }

    public open(cellId: string, td: HTMLElement) {
        this.activeCellId = cellId;
        this.activeTd = td;

        const cell = this.state.getCell(cellId);
        const raw = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
        this.el.value = raw === undefined || raw === null ? '' : raw.toString();

        const wrapperRect = this.wrapper.getBoundingClientRect();
        const tdRect = td.getBoundingClientRect();

        this.el.style.display = 'block';
        this.el.style.top = `${tdRect.top - wrapperRect.top + this.wrapper.scrollTop}px`;
        this.el.style.left = `${tdRect.left - wrapperRect.left + this.wrapper.scrollLeft}px`;
        this.el.style.width = `${tdRect.width + 1}px`;
        this.el.style.height = `${tdRect.height + 1}px`;

        this.el.focus();
        this.el.setSelectionRange(this.el.value.length, this.el.value.length);
    }

    private commitAndClose(moveDirection?: CellEditorMoveDirection) {
        if (!this.activeCellId) return;

        let newValue = this.el.value.trim();
        newValue = balanceFormulaParens(newValue);

        const cellId = this.activeCellId;
        const cell = this.state.ensureCell(cellId);

        let parsed: string | number = newValue;
        if (newValue !== '' && !newValue.startsWith('=')) {
            const asNum = Number(newValue.replace(/,/g, ''));
            if (!isNaN(asNum)) parsed = asNum;
        }

        if (typeof parsed === 'string' && parsed.startsWith('=')) {
            cell.value = parsed;
            cell.formula = parsed;
        } else {
            cell.value = parsed;
            cell.formula = undefined;
        }

        this.state.setCell(cellId, cell);
        this.state.markDirty();

        const { updated, cyclic } = this.engine.updateCellAndDependents(cellId);
        const cellsToRefresh = cyclic ? [cellId] : updated.length > 0 ? updated : [cellId];

        this.el.style.display = 'none';
        this.activeCellId = null;
        this.activeTd = null;

        this.onSave(cellsToRefresh, moveDirection);
    }

    public destroy() {
        this.el.remove();
    }
}
