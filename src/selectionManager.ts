import { TableState, lettersToColumnIndex, columnIndexToLetters } from '../tableState';
import { CellEditor } from './cellEditor';

export class SelectionManager {
    public onSelectionChange: ((activeId: string | null) => void) | null = null;
    public onUndo: (() => void) | null = null;
    public onRedo: (() => void) | null = null;

    private selectedIds = new Set<string>();
    private activeCellId: string | null = null;
    private isDragging = false;
    private startDragId: string | null = null;

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
    }

    private onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;

        const target = e.target as HTMLElement;
        const td = target.closest('.live-formula-cell') as HTMLElement;

        if (td && this.editor.el.style.display === 'block') {
            if (this.editor.el.value.startsWith('=')) {
                const cellId = td.getAttribute('data-cell-id');
                if (cellId) {
                    e.preventDefault();
                    const val = this.editor.el.value;
                    const prevChar = val.charAt((this.editor.el.selectionStart ?? val.length) - 1);
                    const needsComma =
                        e.ctrlKey ||
                        e.metaKey ||
                        !!(prevChar && !['(', '=', '+', '-', '*', '/', ','].includes(prevChar));
                    this.editor.injectReference(cellId, needsComma);
                }
                return;
            } else {
                this.editor.commitAndClose();
            }
        }

        const activeEl = document.activeElement as HTMLInputElement | null;
        if (td && activeEl && activeEl.classList.contains('live-formula-formula-bar-input')) {
            const cellId = td.getAttribute('data-cell-id');
            if (cellId) {
                e.preventDefault();
                if (activeEl.value.startsWith('=')) {
                    const prevChar = activeEl.value.charAt((activeEl.selectionStart ?? activeEl.value.length) - 1);
                    const needsComma =
                        e.ctrlKey ||
                        e.metaKey ||
                        !!(prevChar && !['(', '=', '+', '-', '*', '/', ','].includes(prevChar));
                    const injection = needsComma ? `,${cellId}` : cellId;
                    const start = activeEl.selectionStart ?? activeEl.value.length;
                    const end = activeEl.selectionEnd ?? activeEl.value.length;
                    activeEl.value = activeEl.value.substring(0, start) + injection + activeEl.value.substring(end);
                    activeEl.setSelectionRange(start + injection.length, start + injection.length);
                    activeEl.focus();
                } else {
                    const start = activeEl.selectionStart ?? activeEl.value.length;
                    const end = activeEl.selectionEnd ?? activeEl.value.length;
                    activeEl.value = activeEl.value.substring(0, start) + cellId + activeEl.value.substring(end);
                    activeEl.setSelectionRange(start + cellId.length, start + cellId.length);
                    activeEl.focus();
                }
            }
            return;
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
        if (!this.isDragging || !this.startDragId) return;

        const target = e.target as HTMLElement;
        const td = target.closest('.live-formula-cell') as HTMLElement;
        if (!td) return;

        const hoverId = td.getAttribute('data-cell-id');
        if (!hoverId) return;

        this.selectRange(this.startDragId, hoverId);
    };

    private onMouseUp = () => {
        this.isDragging = false;
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

    private clearSelection() {
        this.selectedIds.clear();
        this.activeCellId = null;
        this.onSelectionChange?.(null);
        this.wrapper.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected', 'is-active-cell'));
    }

    public renderSelection() {
        this.wrapper.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected', 'is-active-cell'));

        for (const id of this.selectedIds) {
            const td = this.wrapper.querySelector(`td[data-cell-id="${id}"]`);
            if (td) {
                td.classList.add('is-selected');
                if (id === this.activeCellId) td.classList.add('is-active-cell');
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

        if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            this.onUndo?.();
            return;
        }
        if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.onRedo?.();
            return;
        }

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
                this.state.setCell(id, { value: '', formula: undefined, format: cell?.format });
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
    }
}
