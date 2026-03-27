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
    private isCommitting = false;

    constructor(
        private wrapper: HTMLElement,
        private state: TableState,
        private engine: MathEngine,
        private onSave: (updatedCellIds: string[], moveDirection?: CellEditorMoveDirection) => void,
        private onInput?: (val: string) => void
    ) {
        this.el = document.createElement('textarea');
        this.el.className = 'live-formula-floating-editor';
        this.el.style.display = 'none';

        this.wrapper.style.position = 'relative';
        this.wrapper.appendChild(this.el);

        this.el.addEventListener('input', () => this.onInput?.(this.el.value));

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
                e.stopPropagation();
                this.commitAndClose(e.shiftKey ? 'Up' : 'Down');
            } else if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                this.commitAndClose(e.shiftKey ? 'Left' : 'Right');
            }
        });
    }

    public injectReference(cellId: string, needsComma = false) {
        const start = this.el.selectionStart ?? this.el.value.length;
        const end = this.el.selectionEnd ?? this.el.value.length;
        const injection = needsComma ? `,${cellId}` : cellId;
        this.el.value = this.el.value.substring(0, start) + injection + this.el.value.substring(end);
        this.el.setSelectionRange(start + injection.length, start + injection.length);
        this.el.focus();
        this.onInput?.(this.el.value);
    }

    public open(cellId: string, td: HTMLElement, shouldFocus: boolean = true) {
        this.activeCellId = cellId;
        this.activeTd = td;

        const rect = td.getBoundingClientRect();
        const wrapperRect = this.wrapper.getBoundingClientRect();

        this.el.style.top = `${rect.top - wrapperRect.top + this.wrapper.scrollTop}px`;
        this.el.style.left = `${rect.left - wrapperRect.left + this.wrapper.scrollLeft}px`;
        this.el.style.width = `${Math.max(rect.width, 120)}px`;
        this.el.style.height = `${Math.max(rect.height, 28)}px`;
        this.el.style.display = 'block';

        const cell = this.state.getCell(cellId);
        let valStr = '';
        if (cell) {
            valStr =
                cell.formula !== undefined
                    ? cell.formula
                    : cell.value !== undefined && cell.value !== null
                      ? String(cell.value)
                      : '';
        }
        this.el.value = valStr;

        this.onInput?.(this.el.value);

        if (shouldFocus) {
            this.el.focus();
            const len = this.el.value.length;
            this.el.setSelectionRange(len, len);
        }
    }

    public commitAndClose(moveDirection?: CellEditorMoveDirection) {
        if (!this.activeCellId || this.isCommitting) return;
        this.isCommitting = true;

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

        setTimeout(() => {
            this.isCommitting = false;
        }, 20);
    }

    public destroy() {
        this.el.remove();
    }
}
