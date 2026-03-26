import { TableState } from '../tableState';
import { MathEngine } from '../math';

export class CellEditor {
    public el: HTMLTextAreaElement;
    private activeCellId: string | null = null;
    private activeTd: HTMLElement | null = null;

    constructor(
        private wrapper: HTMLElement,
        private state: TableState,
        private engine: MathEngine,
        private onSave: (updatedCellIds: string[]) => void
    ) {
        this.el = document.createElement('textarea');
        this.el.className = 'live-formula-floating-editor';
        this.el.style.display = 'none';

        // Ensure wrapper can anchor the absolute positioning
        this.wrapper.style.position = 'relative';
        this.wrapper.appendChild(this.el);

        this.attachListeners();
    }

    private attachListeners() {
        // 1. Double-click a cell to open the editor
        this.wrapper.addEventListener('dblclick', (e) => {
            const target = e.target as HTMLElement;
            const td = target.closest('.live-formula-cell') as HTMLElement;
            if (!td) return;

            const cellId = td.getAttribute('data-cell-id');
            if (cellId) this.open(cellId, td);
        });

        // 2. Close and save when clicking away
        this.el.addEventListener('blur', () => this.commitAndClose());

        // 3. Close and save when hitting Enter (without Shift)
        this.el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.commitAndClose();
            }
        });
    }

    public open(cellId: string, td: HTMLElement) {
        this.activeCellId = cellId;
        this.activeTd = td;

        const cell = this.state.getCell(cellId);
        const raw = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
        this.el.value = raw === undefined || raw === null ? '' : raw.toString();

        // Teleport the editor over the target cell
        const wrapperRect = this.wrapper.getBoundingClientRect();
        const tdRect = td.getBoundingClientRect();

        this.el.style.display = 'block';
        this.el.style.top = `${tdRect.top - wrapperRect.top + this.wrapper.scrollTop}px`;
        this.el.style.left = `${tdRect.left - wrapperRect.left + this.wrapper.scrollLeft}px`;
        this.el.style.width = `${tdRect.width + 1}px`; // +1 to cover borders perfectly
        this.el.style.height = `${tdRect.height + 1}px`;

        this.el.focus();
        this.el.setSelectionRange(this.el.value.length, this.el.value.length);
    }

    private commitAndClose() {
        if (!this.activeCellId) return;

        const newValue = this.el.value.trim();
        const cellId = this.activeCellId;
        const cell = this.state.ensureCell(cellId);

        // Basic data parsing
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

        // Trigger Math Engine & Dependency Updates
        const { updated, cyclic } = this.engine.updateCellAndDependents(cellId);
        const cellsToRefresh = cyclic ? [cellId] : updated.length > 0 ? updated : [cellId];

        // Hide editor
        this.el.style.display = 'none';
        this.activeCellId = null;
        this.activeTd = null;

        // Notify UI orchestrator to repaint the changed cells and save to file
        this.onSave(cellsToRefresh);
    }

    public destroy() {
        this.el.remove();
    }
}
