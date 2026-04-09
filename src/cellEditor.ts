import { TableState } from '../tableState';
import { MathEngine } from '../math';
import { FormulaAutocomplete } from './formulaAutocomplete';

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
    private autocomplete: FormulaAutocomplete;
    public pointMode = false;
    public pointCellId: string | null = null;
    public pointTrackingData: { start: number, end: number, needsComma: boolean } | null = null;
    public onPointNavigate?: (direction: 'Up' | 'Down' | 'Left' | 'Right', shiftKey: boolean) => void;

    constructor(
        private wrapper: HTMLElement,
        private state: TableState,
        private engine: MathEngine,
        private onSave: (updatedCellIds: string[], moveDirection?: CellEditorMoveDirection) => void,
        private onInput?: (val: string) => void
    ) {
        this.autocomplete = new FormulaAutocomplete();
        this.el = document.createElement('textarea');
        this.el.className = 'live-formula-floating-editor';
        this.el.style.display = 'none';

        this.el.style.position = 'fixed';
        this.el.style.zIndex = '999999';
        document.body.appendChild(this.el);

        this.el.addEventListener('input', () => {
            this.onInput?.(this.el.value);
            this.autocomplete.onInput();
        });

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
            // Stop Obsidian from capturing shortcuts (fixing editing speed issues)
            e.stopPropagation();

            // Check if we implicitly enter Point Mode
            const val = this.el.value;
            const cursor = this.el.selectionStart ?? val.length;
            const textBefore = val.substring(0, cursor);
            const prevChar = textBefore.charAt(textBefore.length - 1);
            const isAfterOperator = !!prevChar && ['(', '=', '+', '-', '*', '/', ',', ':'].includes(prevChar);

            // An arrow key immediately following an operator puts us in point mode!
            if (isAfterOperator || this.pointMode) {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                    this.pointMode = true; // Lock into point mode
                    const dir = e.key.replace('Arrow', '') as 'Up' | 'Down' | 'Left' | 'Right';
                    
                    if (!this.pointCellId) {
                        this.pointCellId = this.activeCellId;
                        const needsComma = !!prevChar && !['(', '=', '+', '-', '*', '/', ',', ':'].includes(prevChar);
                        this.pointTrackingData = { start: cursor, end: cursor, needsComma };
                    }
                    
                    this.onPointNavigate?.(dir, e.shiftKey);
                    return;
                }
            }
            
            // Any normal keystroke that isn't pointing resets point mode!
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
                this.pointMode = false;
                this.pointCellId = null;
                this.pointTrackingData = null;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                this.commitAndClose(e.shiftKey ? 'Up' : 'Down');
            } else if (e.key === 'Tab') {
                e.preventDefault();
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
        this.el.focus({ preventScroll: true });
        this.onInput?.(this.el.value);
    }
    
    public updatePointReference(newCellId: string) {
        if (!this.pointTrackingData) return;
        this.pointCellId = newCellId;
        
        const { start, end, needsComma } = this.pointTrackingData;
        const injection = needsComma ? `,${newCellId}` : newCellId;
        
        const val = this.el.value;
        this.el.value = val.substring(0, start) + injection + val.substring(end);
        
        const newEnd = start + injection.length;
        this.el.setSelectionRange(newEnd, newEnd);
        this.pointTrackingData.end = newEnd;
        
        this.el.focus({ preventScroll: true });
        this.onInput?.(this.el.value);
        this.autocomplete.onInput();
    }

    public open(cellId: string, td: HTMLElement, shouldFocus: boolean = true) {
        this.activeCellId = cellId;
        this.activeTd = td;

        const rect = td.getBoundingClientRect();

        this.el.style.top = `${rect.top}px`;
        this.el.style.left = `${rect.left}px`;
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
            this.el.focus({ preventScroll: true });
            const len = this.el.value.length;
            this.el.setSelectionRange(len, len);
        }
        
        this.pointMode = false; // Default to Edit Mode when opening
        this.pointCellId = null;
        this.pointTrackingData = null;
        
        this.autocomplete.attach(this.el);
        this.autocomplete.onInput();
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

        const isFormula = typeof parsed === 'string' && parsed.startsWith('=');
        const newFormula = isFormula ? (parsed as string) : undefined;
        const newValueField = parsed;

        const valueChanged = cell.formula !== newFormula || cell.value !== newValueField;

        if (valueChanged) {
            cell.value = newValueField;
            cell.formula = newFormula;
            this.state.setCell(cellId, cell);
            this.state.markDirty();
        }

        const cellsToRefresh: string[] = [];
        if (valueChanged) {
            const { updated, cyclic } = this.engine.updateCellAndDependents(cellId);
            cellsToRefresh.push(...(cyclic ? [cellId] : updated.length > 0 ? updated : [cellId]));
        }

        this.el.style.display = 'none';

        this.el.blur();

        this.activeCellId = null;
        this.activeTd = null;
        this.autocomplete.detach();

        this.onSave(cellsToRefresh, moveDirection);

        this.isCommitting = false;
    }

    public destroy() {
        this.autocomplete.destroy();
        this.el.remove();
    }
}
