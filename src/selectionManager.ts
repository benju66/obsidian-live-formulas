import { TableState, lettersToColumnIndex, columnIndexToLetters } from '../tableState';
import { CellEditor } from './cellEditor';

export class SelectionManager {
    private selectedIds = new Set<string>();
    private activeCellId: string | null = null;
    private isDragging = false;
    private startDragId: string | null = null;

    constructor(
        private wrapper: HTMLElement,
        private state: TableState,
        private editor: CellEditor,
        private onStateChange: () => void
    ) {
        // Allow wrapper to intercept keyboard events
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
        if (e.button !== 0) return; // Only process left-clicks

        const target = e.target as HTMLElement;
        const td = target.closest('.live-formula-cell') as HTMLElement;

        if (!td) {
            // Clicked outside the grid entirely
            if (!target.closest('.live-formula-floating-editor')) {
                this.clearSelection();
            }
            return;
        }

        const cellId = td.getAttribute('data-cell-id');
        if (!cellId) return;

        // If the floating editor is currently open on this cell, do not interfere
        if (this.editor.el.style.display === 'block' && this.activeCellId === cellId) return;

        this.isDragging = true;
        this.startDragId = cellId;

        if (e.shiftKey && this.activeCellId) {
            e.preventDefault();
            this.selectRange(this.activeCellId, cellId);
        } else {
            this.clearSelection();
            this.activeCellId = cellId;
            this.selectedIds.add(cellId);
            this.renderSelection();

            // Force focus back to the wrapper so it catches keyboard events
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
        this.wrapper.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected', 'is-active-cell'));
    }

    private renderSelection() {
        this.wrapper.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected', 'is-active-cell'));

        for (const id of this.selectedIds) {
            const td = this.wrapper.querySelector(`td[data-cell-id="${id}"]`);
            if (td) {
                td.classList.add('is-selected');
                if (id === this.activeCellId) td.classList.add('is-active-cell');
            }
        }
    }

    private onKeyDown = (e: KeyboardEvent) => {
        // Ignore if the user is actively typing inside the floating editor
        if (this.editor.el.style.display === 'block') return;
        if (!this.activeCellId) return;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        // 1. Bulk Delete
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            for (const id of this.selectedIds) {
                const cell = this.state.getCell(id);
                this.state.setCell(id, { value: '', formula: undefined, format: cell?.format });
                const td = this.wrapper.querySelector(`td[data-cell-id="${id}"]`) as HTMLElement;
                if (td) td.textContent = ''; // Clear display
            }
            this.state.markDirty();
            this.onStateChange();
            return;
        }

        // 2. Arrow Key Navigation & Enter to Edit
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
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const td = this.wrapper.querySelector(`td[data-cell-id="${this.activeCellId}"]`) as HTMLElement;
                if (td) this.editor.open(this.activeCellId, td);
                return;
            }

            if (moved) {
                e.preventDefault();
                const newId = `${columnIndexToLetters(c)}${r}`;

                // If Shift is held, expand selection. Otherwise move active cell.
                if (e.shiftKey && this.startDragId) {
                    this.selectRange(this.startDragId, newId);
                } else {
                    this.clearSelection();
                    this.activeCellId = newId;
                    this.startDragId = newId;
                    this.selectedIds.add(newId);
                    this.renderSelection();
                }
                return;
            }
        }

        // 3. Type-to-Edit (Excel standard behavior)
        if (e.key.length === 1 && !cmdOrCtrl && !e.altKey) {
            const td = this.wrapper.querySelector(`td[data-cell-id="${this.activeCellId}"]`) as HTMLElement;
            if (td) {
                this.editor.open(this.activeCellId, td);
                this.editor.el.value = ''; // Clear old data to overwrite with new typing
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
