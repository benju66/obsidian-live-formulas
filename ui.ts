import { Menu } from 'obsidian';
import { MathEngine } from './math';
import { TableToolbar } from './toolbar';
import { LiveFormulasSettings } from './settings';
import { TableState, lettersToColumnIndex } from './tableState';
import * as Actions from './dataActions';
import { CellEditor } from './src/cellEditor';
import { SelectionManager } from './src/selectionManager';

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

    const rerender = () => {
        if (destroyRef) destroyRef.current();
        el.empty();
        renderTableUI(el, state, settings, saveStateToFile, toggleHeaders, persistPluginSettings, destroyRef);
    };

    // 1. DOM Setup
    const wrapper = el.createEl('div', { cls: 'live-formula-wrapper' });
    const container = wrapper.createEl('div', { cls: 'live-formula-container' });

    // Top Bar (Formula & Toolbar)
    const formulaBarWrapper = container.createEl('div', { cls: 'live-formula-formula-bar' });
    formulaBarWrapper.createEl('span', { text: 'fx', cls: 'live-formula-formula-bar-label' });
    let ribbonToggleBtn: HTMLButtonElement | null = null;
    if (settings.showToolbar) {
        ribbonToggleBtn = formulaBarWrapper.createEl('button', {
            type: 'button',
            cls: 'live-formula-formula-bar-ribbon-toggle',
            text: '⌄',
            attr: { 'aria-label': 'Toggle formatting ribbon', title: 'Toggle formatting ribbon' },
        });
    }
    const formulaBarInput = formulaBarWrapper.createEl('input', { type: 'text', cls: 'live-formula-formula-bar-input' });
    formulaBarInput.disabled = true;

    const tableScroll = container.createEl('div', { cls: 'live-formula-table-scroll' });
    const table = tableScroll.createEl('table', { cls: 'live-formula-table' });

    const refreshCellDisplay = (id: string) => {
        const td = wrapper.querySelector(`td[data-cell-id="${id}"]`) as HTMLElement;
        if (!td) return;

        const cell = state.getCell(id);
        const fmt = cell?.format || {};
        const raw = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
        let out = raw === undefined || raw === null ? '' : raw.toString();
        let num: number | null = null;

        if (typeof raw === 'string' && raw.startsWith('=')) {
            const result = engine.evaluateFormula(raw);
            if (typeof result === 'string') out = result;
            else num = result;
            td.classList.add('live-formula-cell--formula');
        } else {
            if (typeof raw === 'number') num = raw;
            td.classList.remove('live-formula-cell--formula');
        }

        if (num !== null) {
            let decimals = fmt.decimals;
            if (decimals === undefined) decimals = fmt.type === 'currency' ? 2 : undefined;
            const opts = decimals !== undefined ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {};

            if (fmt.type === 'percent') out = `${(num * 100).toLocaleString('en-US', opts)}%`;
            else if (fmt.type === 'currency') {
                const fNum = Math.abs(num).toLocaleString('en-US', opts);
                out =
                    num < 0
                        ? settings.accountingNegatives
                            ? `($${fNum})`
                            : `-$${fNum}`
                        : `${settings.currencySymbol || '$'}${fNum}`;
            } else out = num.toLocaleString('en-US', opts);
        }

        td.textContent = out;
        td.style.textAlign = fmt.align || 'left';
        td.style.fontWeight = fmt.bold ? 'bold' : 'normal';
        td.style.color = out.startsWith('#') ? 'var(--text-error)' : '';
    };

    let selectionManager!: SelectionManager;
    const cellEditor = new CellEditor(wrapper, state, engine, (updatedCellIds, moveDirection) => {
        updatedCellIds.forEach((id) => refreshCellDisplay(id));
        saveStateToFile();
        if (moveDirection) {
            selectionManager.moveActiveCell(moveDirection);
        } else {
            wrapper.focus();
        }
    });
    selectionManager = new SelectionManager(wrapper, state, cellEditor, () => {
        saveStateToFile();
    });

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

            const td = tr.createEl('td', {
                cls: 'live-formula-cell',
                attr: { 'data-cell-id': cellId },
            });

            refreshCellDisplay(cellId);

            td.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const colIdx = lettersToColumnIndex(c);
                const menu = new Menu();
                menu.addItem((i) =>
                    i.setTitle('Insert Row Above').onClick(() => {
                        Actions.insertRow(state, r);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addItem((i) =>
                    i.setTitle('Insert Row Below').onClick(() => {
                        Actions.insertRow(state, r + 1);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addItem((i) =>
                    i.setTitle('Delete Row').onClick(() => {
                        Actions.deleteRow(state, r);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addSeparator();
                menu.addItem((i) =>
                    i.setTitle('Insert Column Left').onClick(() => {
                        Actions.insertCol(state, colIdx, rows);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addItem((i) =>
                    i.setTitle('Insert Column Right').onClick(() => {
                        Actions.insertCol(state, colIdx + 1, rows);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addItem((i) =>
                    i.setTitle('Delete Column').onClick(() => {
                        Actions.deleteCol(state, colIdx);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.showAtMouseEvent(e);
            });
        }
    }

    const destroy = () => {
        cellEditor.destroy();
        selectionManager.destroy();
    };

    selectionManager.onSelectionChange = (activeId) => {
        if (!activeId) {
            formulaBarInput.value = '';
            formulaBarInput.disabled = true;
            return;
        }
        formulaBarInput.disabled = false;
        const cell = state.getCell(activeId);
        const raw = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
        formulaBarInput.value = raw === undefined || raw === null ? '' : raw.toString();
    };

    formulaBarInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const activeId = selectionManager.getActiveCellId();
            if (!activeId) return;

            let newValue = formulaBarInput.value.trim();
            newValue = balanceFormulaParens(newValue);
            const cell = state.ensureCell(activeId);

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

            state.setCell(activeId, cell);
            state.markDirty();

            const { updated, cyclic } = engine.updateCellAndDependents(activeId);
            const cellsToRefresh = cyclic ? [activeId] : updated.length > 0 ? updated : [activeId];
            cellsToRefresh.forEach((id) => refreshCellDisplay(id));
            saveStateToFile();
            wrapper.focus();
        }
    });

    if (settings.showToolbar) {
        const tb = new TableToolbar(container, (key, val) => {
            if (key === 'toggleHeaders') {
                if (toggleHeaders) void toggleHeaders();
                return;
            }

            const ids = selectionManager.getSelectedIds();
            if (ids.length === 0) return;

            for (const id of ids) {
                const cell = state.ensureCell(id);
                if (!cell.format) cell.format = {};

                if (key === 'type') {
                    cell.format.type = cell.format.type === val ? 'plain' : val;
                } else if (key === 'decimals') {
                    let dec = cell.format.decimals;
                    if (dec === undefined) dec = cell.format.type === 'currency' ? 2 : 0;
                    if (val === 'inc') dec++;
                    if (val === 'dec' && dec > 0) dec--;
                    cell.format.decimals = dec;
                } else {
                    (cell.format as Record<string, unknown>)[key] =
                        (cell.format as Record<string, unknown>)[key] === val ? null : val;
                }
                state.setCell(id, cell);
                refreshCellDisplay(id);
            }
            state.markDirty();
            saveStateToFile();
            setTimeout(() => {
                selectionManager.renderSelection();
                wrapper.focus();
            }, 10);
        });
        tb.el.style.display = settings.toolbarVisible !== false ? 'flex' : 'none';
        container.insertBefore(tb.el, tableScroll);
    }

    if (ribbonToggleBtn) {
        ribbonToggleBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            settings.toolbarVisible = !(settings.toolbarVisible !== false);
            const tbEl = container.querySelector('.live-formula-toolbar-ribbon') as HTMLElement;
            if (tbEl) tbEl.style.display = settings.toolbarVisible ? 'flex' : 'none';
            void persistPluginSettings?.();
        });
    }

    if (settings.enableHoverButtons) {
        const addColBtn = wrapper.createEl('button', {
            text: '+',
            cls: 'live-formula-hover-btn live-formula-hover-btn-add-col',
            attr: { type: 'button', 'aria-label': 'Add column' },
        });
        const addRowBtn = wrapper.createEl('button', {
            text: '+',
            cls: 'live-formula-hover-btn live-formula-hover-btn-add-row',
            attr: { type: 'button', 'aria-label': 'Add row' },
        });

        addColBtn.addEventListener('mousedown', (e) => e.preventDefault());
        addColBtn.addEventListener('click', () => {
            Actions.insertCol(state, state.maxCol + 1, rows);
            saveStateToFile();
        });
        addRowBtn.addEventListener('mousedown', (e) => e.preventDefault());
        addRowBtn.addEventListener('click', () => {
            Actions.insertRow(state, rows + 1);
            saveStateToFile();
        });
    }

    if (destroyRef) destroyRef.current = destroy;
    return { destroy };
};
