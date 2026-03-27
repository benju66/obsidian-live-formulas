import { TableState, lettersToColumnIndex, columnIndexToLetters } from '../tableState';
import { CellEditor } from './cellEditor';

export class SelectionManager {
    public onSelectionChange: ((activeId: string | null) => void) | null = null;
    public onUndo: (() => void) | null = null;
    public onRedo: (() => void) | null = null;
    public onFillRange: ((sourceId: string, targetIds: string[]) => void) | null = null;

    private selectedIds = new Set<string>();
    private activeCellId: string | null = null;
    private isDragging = false;
    private startDragId: string | null = null;
    private isFilling = false;
    private fillTargetIds = new Set<string>();

    public getActiveCellId() {
        return this.activeCellId;
    }

    public getSelectedIds() {
        return Array.from(this.selectedIds);
    }

    public restoreSelection(activeId: string | null, selectedIds: string[]) {
        this.selectedIds = new Set(selectedIds);
        this.activeCellId = activeId;
        this.startDragId = activeId;
        this.renderSelection();
        if (this.activeCellId) {
            this.onSelectionChange?.(this.activeCellId);
        }
    }

    private handleFormulaClick(e: MouseEvent, cellId: string, inputEl: HTMLInputElement | HTMLTextAreaElement) {
        e.preventDefault();
        const val = inputEl.value;
        const start = inputEl.selectionStart ?? val.length;
        const end = inputEl.selectionEnd ?? val.length;
        let textBefore = val.substring(0, start);
        const textAfter = val.substring(end);

        // Handle Shift+Click (Range Selection)
        if (e.shiftKey) {
            // Check if the cursor is immediately after an existing cell or range (e.g., "A1" or "A1:B1")
            const rangeMatch = textBefore.match(/([A-Z]+\d+)(?::[A-Z]+\d+)?$/i);
            if (rangeMatch && rangeMatch.index !== undefined) {
                const startCell = rangeMatch[1];
                const injection = `${startCell}:${cellId}`;
                textBefore = textBefore.substring(0, rangeMatch.index);

                inputEl.value = textBefore + injection + textAfter;
                inputEl.setSelectionRange(textBefore.length + injection.length, textBefore.length + injection.length);
                inputEl.focus();
                inputEl.dispatchEvent(new Event('input'));
                return;
            }
        }

        // Handle Normal/Ctrl Click (Single Cell Selection)
        const prevChar = textBefore.charAt(textBefore.length - 1);
        // We only need a comma if the previous char exists and is NOT an operator or bracket
        const needsComma = !!prevChar && !['(', '=', '+', '-', '*', '/', ',', ':'].includes(prevChar);
        const injection = needsComma ? `,${cellId}` : cellId;

        inputEl.value = textBefore + injection + textAfter;
        inputEl.setSelectionRange(textBefore.length + injection.length, textBefore.length + injection.length);
        inputEl.focus();
        inputEl.dispatchEvent(new Event('input'));
    }

    constructor(
        private wrapper: HTMLElement,
        private state: TableState,
        private editor: CellEditor,
        private onStateChange: () => void
    ) {
        this.wrapper.tabIndex = 0;
        this.wrapper.style.outline = 'none';
        this.attachListeners();
    }

    private attachListeners() {
        this.wrapper.addEventListener('mousedown', this.onMouseDown);
        this.wrapper.addEventListener('mouseover', this.onMouseOver);
        window.addEventListener('mouseup', this.onMouseUp);
        this.wrapper.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('mousedown', this.onDocumentMouseDown);
    }

    private shouldInjectCellReference(inputEl: HTMLInputElement | HTMLTextAreaElement): boolean {
        const val = inputEl.value;
        const cursor = inputEl.selectionStart ?? val.length;
        const textBefore = val.substring(0, cursor);

        let depth = 0;
        for (let i = 0; i < textBefore.length; i++) {
            if (textBefore[i] === '(') depth++;
            else if (textBefore[i] === ')') depth--;
        }

        // Always inject if we are inside parentheses
        if (depth > 0) return true;

        // Otherwise, only inject if immediately following an operator or comma
        return /[\+\-\*\/\=\,\:\<\>\&]\s*$/.test(textBefore);
    }

    private onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;

        const target = e.target as HTMLElement;
        // Detect click on the drag handle
        if (target.classList.contains('live-formula-drag-handle')) {
            e.preventDefault();
            e.stopPropagation();
            this.isFilling = true;
            this.fillTargetIds.clear();
            return;
        }

        const td = target.closest('.live-formula-cell') as HTMLElement;

        // 1. Handling click when the floating cell editor is active
        if (td && this.editor.el.style.display === 'block') {
            if (this.editor.el.value.startsWith('=')) {
                if (this.shouldInjectCellReference(this.editor.el)) {
                    const cellId = td.getAttribute('data-cell-id');
                    if (cellId) {
                        this.handleFormulaClick(e, cellId, this.editor.el);
                    }
                    return; // Keep focus in editor
                } else {
                    // Formula is complete/closed. Commit it to allow standard selection to proceed.
                    this.editor.commitAndClose();
                }
            } else {
                this.editor.commitAndClose();
            }
        }

        // 2. Handling click when the top formula bar is active
        const activeEl = document.activeElement as HTMLInputElement | null;
        if (td && activeEl && activeEl.classList.contains('live-formula-formula-bar-input')) {
            const cellId = td.getAttribute('data-cell-id');
            if (cellId) {
                if (activeEl.value.startsWith('=')) {
                    if (this.shouldInjectCellReference(activeEl)) {
                        this.handleFormulaClick(e, cellId, activeEl);
                        return;
                    } else {
                        // Formula is complete. Drop focus so the table can natively select the clicked cell.
                        activeEl.blur();
                    }
                } else {
                    e.preventDefault();
                    const start = activeEl.selectionStart ?? activeEl.value.length;
                    const end = activeEl.selectionEnd ?? activeEl.value.length;
                    activeEl.value = activeEl.value.substring(0, start) + cellId + activeEl.value.substring(end);
                    activeEl.setSelectionRange(start + cellId.length, start + cellId.length);
                    activeEl.focus();
                    activeEl.dispatchEvent(new Event('input'));
                    return;
                }
            }
        }

        if (!td) {
            if (
                !target.closest('.live-formula-floating-editor') &&
                !target.closest('.live-formula-toolbar-ribbon') &&
                !target.closest('.live-formula-formula-bar')
            ) {
                this.clearSelection();
            }
            return;
        }

        const cellId = td.getAttribute('data-cell-id');
        if (!cellId) return;

        this.isDragging = true;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        if (e.shiftKey && this.activeCellId) {
            e.preventDefault();
            this.selectRange(this.activeCellId, cellId);
            this.onSelectionChange?.(this.activeCellId);
        } else if (cmdOrCtrl) {
            e.preventDefault();
            if (this.selectedIds.has(cellId)) {
                this.selectedIds.delete(cellId);
                if (this.activeCellId === cellId) {
                    this.activeCellId = this.selectedIds.size > 0 ? Array.from(this.selectedIds)[0] : null;
                }
            } else {
                this.selectedIds.add(cellId);
                this.activeCellId = cellId;
            }
            this.startDragId = this.activeCellId;
            this.renderSelection();
            this.onSelectionChange?.(this.activeCellId);
            this.wrapper.focus();
        } else {
            this.clearSelection();
            this.activeCellId = cellId;
            this.startDragId = cellId;
            this.selectedIds.add(cellId);
            this.renderSelection();
            this.onSelectionChange?.(this.activeCellId);
            this.wrapper.focus();
        }
    };

    private onMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const td = target.closest('.live-formula-cell') as HTMLElement;
        if (!td) return;
        const hoverId = td.getAttribute('data-cell-id');
        if (!hoverId) return;

        if (this.isFilling && this.activeCellId) {
            this.fillTargetIds.clear();
            const match1 = this.activeCellId.match(/^([A-Z]+)(\d+)$/i);
            const match2 = hoverId.match(/^([A-Z]+)(\d+)$/i);
            if (!match1 || !match2) return;

            const c1 = lettersToColumnIndex(match1[1]);
            const r1 = parseInt(match1[2], 10);
            const c2 = lettersToColumnIndex(match2[1]);
            const r2 = parseInt(match2[2], 10);

            // Force straight lines (vertical or horizontal only)
            if (Math.abs(c2 - c1) > Math.abs(r2 - r1)) {
                // Horizontal fill
                const minC = Math.min(c1, c2);
                const maxC = Math.max(c1, c2);
                for (let c = minC; c <= maxC; c++) {
                    this.fillTargetIds.add(`${columnIndexToLetters(c)}${r1}`);
                }
            } else {
                // Vertical fill
                const minR = Math.min(r1, r2);
                const maxR = Math.max(r1, r2);
                for (let r = minR; r <= maxR; r++) {
                    this.fillTargetIds.add(`${columnIndexToLetters(c1)}${r}`);
                }
            }
            this.renderSelection();
            return;
        }

        if (this.isDragging && this.startDragId) {
            this.selectRange(this.startDragId, hoverId);
            this.onSelectionChange?.(this.activeCellId);
        }
    };

    private onMouseUp = () => {
        this.isDragging = false;
        if (this.isFilling) {
            this.isFilling = false;
            if (this.fillTargetIds.size > 0 && this.activeCellId && this.onFillRange) {
                this.onFillRange(this.activeCellId, Array.from(this.fillTargetIds));
            }
            this.fillTargetIds.clear();
            this.renderSelection();
        }
    };

    private onDocumentMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!this.wrapper.contains(target) && !target.closest('.live-formula-floating-editor') && !target.closest('.menu')) {
            if (this.selectedIds.size > 0 || this.activeCellId) {
                this.clearSelection();
            }
        }
    };

    private selectRange(startId: string, endId: string) {
        this.selectedIds.clear();

        const match1 = startId.match(/^([A-Z]+)(\d+)$/i);
        const match2 = endId.match(/^([A-Z]+)(\d+)$/i);
        if (!match1 || !match2) return;

        const c1 = lettersToColumnIndex(match1[1]);
        const r1 = parseInt(match1[2], 10);
        const c2 = lettersToColumnIndex(match2[1]);
        const r2 = parseInt(match2[2], 10);

        const minC = Math.min(c1, c2);
        const maxC = Math.max(c1, c2);
        const minR = Math.min(r1, r2);
        const maxR = Math.max(r1, r2);

        for (let c = minC; c <= maxC; c++) {
            const colStr = columnIndexToLetters(c);
            for (let r = minR; r <= maxR; r++) {
                this.selectedIds.add(`${colStr}${r}`);
            }
        }
        this.renderSelection();
    }

    public selectColumn(colStr: string) {
        this.selectedIds.clear();
        for (let r = 1; r <= this.state.maxRow; r++) {
            this.selectedIds.add(`${colStr}${r}`);
        }
        this.activeCellId = `${colStr}1`;
        this.startDragId = this.activeCellId;
        this.renderSelection();
        this.onSelectionChange?.(this.activeCellId);
    }

    public selectRow(rowNum: number) {
        this.selectedIds.clear();
        const cols = this.state.getColumnLetters();
        for (const c of cols) {
            this.selectedIds.add(`${c}${rowNum}`);
        }
        this.activeCellId = `${cols[0] ?? 'A'}${rowNum}`;
        this.startDragId = this.activeCellId;
        this.renderSelection();
        this.onSelectionChange?.(this.activeCellId);
    }

    public expandColumnSelection(colStr: string) {
        if (!this.activeCellId) {
            this.selectColumn(colStr);
            return;
        }
        const match = this.activeCellId.match(/^([A-Z]+)(\d+)$/i);
        if (!match) return;

        const startCol = lettersToColumnIndex(match[1]);
        const endCol = lettersToColumnIndex(colStr);

        this.selectedIds.clear();
        const minC = Math.min(startCol, endCol);
        const maxC = Math.max(startCol, endCol);

        for (let c = minC; c <= maxC; c++) {
            const cL = columnIndexToLetters(c);
            for (let r = 1; r <= this.state.maxRow; r++) {
                this.selectedIds.add(`${cL}${r}`);
            }
        }
        this.renderSelection();
        this.onSelectionChange?.(this.activeCellId);
    }

    public expandRowSelection(rowNum: number) {
        if (!this.activeCellId) {
            this.selectRow(rowNum);
            return;
        }
        const match = this.activeCellId.match(/^([A-Z]+)(\d+)$/i);
        if (!match) return;

        const startRow = parseInt(match[2], 10);

        this.selectedIds.clear();
        const minR = Math.min(startRow, rowNum);
        const maxR = Math.max(startRow, rowNum);
        const cols = this.state.getColumnLetters();

        for (let r = minR; r <= maxR; r++) {
            for (const c of cols) {
                this.selectedIds.add(`${c}${r}`);
            }
        }
        this.renderSelection();
        this.onSelectionChange?.(this.activeCellId);
    }

    private clearSelection() {
        this.selectedIds.clear();
        this.activeCellId = null;
        this.isFilling = false;
        this.fillTargetIds.clear();
        this.onSelectionChange?.(null);
        this.wrapper.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected', 'is-active-cell'));
        this.wrapper.querySelectorAll('.live-formula-drag-handle').forEach((el) => el.remove());
        this.wrapper.querySelectorAll('.is-fill-highlight').forEach((el) => el.classList.remove('is-fill-highlight'));
        this.wrapper.querySelectorAll('.is-copied-highlight').forEach((el) => el.classList.remove('is-copied-highlight'));
    }

    public renderSelection() {
        // Clean up old selection UI
        this.wrapper.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected', 'is-active-cell'));
        this.wrapper.querySelectorAll('.live-formula-drag-handle').forEach((el) => el.remove());
        this.wrapper.querySelectorAll('.is-fill-highlight').forEach((el) => el.classList.remove('is-fill-highlight'));
        this.wrapper.querySelectorAll('.is-copied-highlight').forEach((el) => el.classList.remove('is-copied-highlight'));

        for (const id of this.selectedIds) {
            const td = this.wrapper.querySelector(`td[data-cell-id="${id}"]`);
            if (td) {
                td.classList.add('is-selected');
                if (id === this.activeCellId) {
                    td.classList.add('is-active-cell');
                    // Inject the drag handle if only one cell is selected
                    if (this.selectedIds.size === 1) {
                        const handle = document.createElement('div');
                        handle.className = 'live-formula-drag-handle';
                        td.appendChild(handle);
                    }
                }
            }
        }

        // Render fill highlight
        for (const id of this.fillTargetIds) {
            const td = this.wrapper.querySelector(`td[data-cell-id="${id}"]`);
            if (td && id !== this.activeCellId) {
                td.classList.add('is-fill-highlight');
            }
        }
    }

    public moveActiveCell(direction: 'Up' | 'Down' | 'Left' | 'Right') {
        if (!this.activeCellId) return;
        const match = this.activeCellId.match(/^([A-Z]+)(\d+)$/i);
        if (!match) return;

        let r = parseInt(match[2], 10);
        let c = lettersToColumnIndex(match[1]);

        if (direction === 'Up') r = Math.max(1, r - 1);
        else if (direction === 'Down') r = Math.min(this.state.maxRow, r + 1);
        else if (direction === 'Left') c = Math.max(1, c - 1);
        else if (direction === 'Right') c = Math.min(this.state.maxCol, c + 1);

        const newId = `${columnIndexToLetters(c)}${r}`;
        this.clearSelection();
        this.activeCellId = newId;
        this.startDragId = newId;
        this.selectedIds.add(newId);
        this.renderSelection();
        this.onSelectionChange?.(this.activeCellId);
        this.wrapper.focus();
    }

    private onKeyDown = (e: KeyboardEvent) => {
        if (document.activeElement?.classList.contains('live-formula-formula-bar-input')) return;
        if (this.editor.el.style.display === 'block') return;
        if (!this.activeCellId) return;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        if (e.key === 'Tab') {
            e.preventDefault();
            this.moveActiveCell(e.shiftKey ? 'Left' : 'Right');
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            this.moveActiveCell(e.shiftKey ? 'Up' : 'Down');
            return;
        }
        if (e.key === 'F2') {
            e.preventDefault();
            const td = this.wrapper.querySelector(`td[data-cell-id="${this.activeCellId}"]`) as HTMLElement;
            if (td) this.editor.open(this.activeCellId, td);
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            for (const id of this.selectedIds) {
                const cell = this.state.getCell(id);
                this.state.setCell(id, {
                    value: '',
                    formula: undefined,
                    format: cell?.format || {},
                });
                const td = this.wrapper.querySelector(`td[data-cell-id="${id}"]`) as HTMLElement;
                if (td) td.textContent = '';
            }
            this.state.markDirty();
            this.onStateChange();
            return;
        }

        const match = this.activeCellId.match(/^([A-Z]+)(\d+)$/i);
        if (match) {
            const cLetter = match[1];
            let r = parseInt(match[2], 10);
            let c = lettersToColumnIndex(cLetter);

            let moved = false;
            if (e.key === 'ArrowUp') {
                r = Math.max(1, r - 1);
                moved = true;
            } else if (e.key === 'ArrowDown') {
                r = Math.min(this.state.maxRow, r + 1);
                moved = true;
            } else if (e.key === 'ArrowLeft') {
                c = Math.max(1, c - 1);
                moved = true;
            } else if (e.key === 'ArrowRight') {
                c = Math.min(this.state.maxCol, c + 1);
                moved = true;
            }

            if (moved) {
                e.preventDefault();
                const newId = `${columnIndexToLetters(c)}${r}`;

                if (e.shiftKey && this.startDragId) {
                    this.selectRange(this.startDragId, newId);
                    this.activeCellId = newId;
                    this.renderSelection();
                } else {
                    this.clearSelection();
                    this.activeCellId = newId;
                    this.startDragId = newId;
                    this.selectedIds.add(newId);
                    this.renderSelection();
                }
                this.onSelectionChange?.(this.activeCellId);
                return;
            }
        }

        if (e.key.length === 1 && !cmdOrCtrl && !e.altKey) {
            e.preventDefault();
            const td = this.wrapper.querySelector(`td[data-cell-id="${this.activeCellId}"]`) as HTMLElement;
            if (td) {
                this.editor.open(this.activeCellId, td);
                this.editor.el.value = e.key;
            }
        }
    };

    public destroy() {
        this.wrapper.removeEventListener('mousedown', this.onMouseDown);
        this.wrapper.removeEventListener('mouseover', this.onMouseOver);
        window.removeEventListener('mouseup', this.onMouseUp);
        this.wrapper.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('mousedown', this.onDocumentMouseDown);
    }
}
