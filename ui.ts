import { MathEngine } from './math';
import { LiveFormulasSettings } from './settings';
import { TableState } from './tableState';
import { CellEditor } from './src/cellEditor';
import { SelectionManager } from './src/selectionManager';

export const renderTableUI = (
    el: HTMLElement,
    state: TableState,
    settings: LiveFormulasSettings,
    saveStateToFile: () => void,
    toggleHeaders?: () => Promise<void>,
    persistPluginSettings?: () => Promise<void>,
    destroyRef?: { current: () => void }
) => {
    const engine = new MathEngine(state);
    const cols = state.getColumnLetters();
    const rows = state.maxRow;

    // 1. DOM Setup
    const wrapper = el.createEl('div', { cls: 'live-formula-wrapper' });
    const container = wrapper.createEl('div', { cls: 'live-formula-container' });

    // Top Bar (Formula & Toolbar)
    const formulaBarWrapper = container.createEl('div', { cls: 'live-formula-formula-bar' });
    formulaBarWrapper.createEl('span', { text: 'fx', cls: 'live-formula-formula-bar-label' });
    const formulaBarInput = formulaBarWrapper.createEl('input', { type: 'text', cls: 'live-formula-formula-bar-input' });

    const tableScroll = container.createEl('div', { cls: 'live-formula-table-scroll' });
    const table = tableScroll.createEl('table', { cls: 'live-formula-table' });

    // UI Refresher: Updates a specific <td> element without rebuilding the table
    const refreshCellDisplay = (id: string) => {
        const td = wrapper.querySelector(`td[data-cell-id="${id}"]`) as HTMLElement;
        if (!td) return;

        const cell = state.getCell(id);
        const raw = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
        let displayValue = raw === undefined || raw === null ? '' : raw.toString();

        if (typeof raw === 'string' && raw.startsWith('=')) {
            const result = engine.evaluateFormula(raw);
            displayValue = typeof result === 'string' ? result : result?.toString() || '';
        } else if (typeof raw === 'number') {
            displayValue = raw.toString();
        }

        td.textContent = displayValue;
    };

    const cellEditor = new CellEditor(wrapper, state, engine, (updatedCellIds) => {
        updatedCellIds.forEach((id) => refreshCellDisplay(id));
        saveStateToFile();
    });
    const selectionManager = new SelectionManager(wrapper);

    // 3. Draw the Display Grid (Plain HTML TDs, no Textareas)
    if (settings.showHeaders) {
        const hr = table.createEl('tr');
        hr.createEl('th', { cls: 'live-formula-corner-th' });
        cols.forEach((c) => hr.createEl('th', { text: c, cls: 'live-formula-col-head' }));
    }

    for (let r = 1; r <= rows; r++) {
        const tr = table.createEl('tr');
        if (settings.showHeaders) {
            tr.createEl('td', { text: r.toString(), cls: 'live-formula-row-head' });
        }

        for (const c of cols) {
            const cellId = `${c}${r}`;
            const cell = state.getCell(cellId);

            // Calculate Display Value
            const raw = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
            let displayValue = raw === undefined || raw === null ? '' : raw.toString();
            if (typeof raw === 'string' && raw.startsWith('=')) {
                const result = engine.evaluateFormula(raw);
                displayValue = typeof result === 'string' ? result : result?.toString() || '';
            } else if (typeof raw === 'number') {
                displayValue = raw.toString();
            }

            // Create Plain Display Cell
            tr.createEl('td', {
                cls: 'live-formula-cell',
                attr: { 'data-cell-id': cellId },
                text: displayValue,
            });
        }
    }

    const destroy = () => {
        cellEditor.destroy();
        selectionManager.destroy();
    };

    if (destroyRef) destroyRef.current = destroy;
    return { destroy };
};
