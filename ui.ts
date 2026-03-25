import { Menu } from 'obsidian';
import { MathEngine } from './math';
import { TableToolbar } from './toolbar';
import { LiveFormulasSettings } from './settings';
import * as Actions from './dataActions';
import { TableState, CellData, lettersToColumnIndex, columnIndexToLetters } from './tableState';

let nextFocusCell: string | null = null;

/** Phase 4: drag-to-select range in formulas; module scope so window mouseup / mouseover share one ref. */
let formulaDragState: {
    activeInput: HTMLInputElement | HTMLTextAreaElement;
    anchorCellId: string;
    startPos: number;
    endPos: number;
} | null = null;

if (typeof window !== 'undefined') {
    window.addEventListener('mouseup', () => {
        if (formulaDragState) formulaDragState = null;
    });
}

const ALIGN_CLASSES = [
    'live-formula-cell-input--align-left',
    'live-formula-cell-input--align-center',
    'live-formula-cell-input--align-right',
] as const;

export const renderTableUI = (
    el: HTMLElement,
    state: TableState,
    settings: LiveFormulasSettings,
    saveStateToFile: () => void,
    toggleHeaders?: () => Promise<void>
) => {
    const rerender = () => {
        formulaDragState = null;
        justInjectedFormula = false;
        state.clearDirty();
        el.empty();
        renderTableUI(el, state, settings, saveStateToFile, toggleHeaders);
    };

    const engine = new MathEngine(state);
    const cellInputs = new Map<string, { ta: HTMLTextAreaElement; td: HTMLElement; adjustHeight: () => void }>();
    const selectedCellIds = new Set<string>();
    let lastActiveCellId: string | null = null;
    /** Suppresses bulk-selection click handling after a formula point-mode injection (see module `formulaDragState`). */
    let justInjectedFormula = false;

    const cols = state.getColumnLetters();
    const rows = state.maxRow;

    const wrapper = el.createEl('div', { cls: 'live-formula-wrapper' });
    let toolbar: TableToolbar | null = null;

    const container = wrapper.createEl('div', { cls: 'live-formula-container' });

    const formulaBarWrapper = container.createEl('div', { cls: 'live-formula-formula-bar' });
    formulaBarWrapper.createEl('span', { text: 'fx', cls: 'live-formula-formula-bar-label' });
    const formulaBarInput = formulaBarWrapper.createEl('input', {
        type: 'text',
        cls: 'live-formula-formula-bar-input',
    });

    const tableScroll = container.createEl('div', { cls: 'live-formula-table-scroll' });
    const table = tableScroll.createEl('table', { cls: 'live-formula-table' });

    const getDisplayStringForCell = (id: string): string => {
        const cell = state.getCell(id);
        const fmt = (cell?.format || {}) as CellData['format'];
        const raw = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
        let out = raw === undefined || raw === null ? '' : raw.toString();
        const formula = typeof raw === 'string' && raw.startsWith('=');
        let num: number | null = null;

        if (formula) num = engine.evaluateFormula(raw as string);
        else if (typeof raw === 'number') num = raw;

        if (num !== null) {
            const useCurrency = fmt.type === 'currency';
            const usePercent = fmt.type === 'percent';

            let decimals: number | undefined = fmt.decimals;
            if (decimals === undefined) {
                if (useCurrency) decimals = 2;
                else decimals = undefined;
            }

            const formatOptions =
                decimals !== undefined
                    ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
                    : {};

            if (usePercent) {
                out = `${(num * 100).toLocaleString('en-US', formatOptions)}%`;
            } else if (useCurrency) {
                out = `${settings.currencySymbol || '$'}${num.toLocaleString('en-US', formatOptions)}`;
            } else {
                out = num.toLocaleString('en-US', formatOptions);
            }
        }
        return out;
    };

    const applyFormulaCellStyle = (ta: HTMLTextAreaElement, td: HTMLElement, id: string) => {
        const cell = state.getCell(id);
        const raw = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
        const formula = typeof raw === 'string' && raw.startsWith('=');
        ta.classList.toggle('live-formula-cell-input--formula', formula);
        td.classList.toggle('live-formula-cell--formula', formula);
    };

    const syncCellPresentation = (ta: HTMLTextAreaElement, td: HTMLElement, cellId: string) => {
        const cell = state.getCell(cellId);
        const fmt = (cell?.format || {}) as CellData['format'];
        const rawData = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
        for (const c of ALIGN_CLASSES) ta.classList.remove(c);
        ta.classList.add(`live-formula-cell-input--align-${fmt.align || 'left'}`);
        ta.classList.toggle('live-formula-cell-input--bold', !!fmt.bold);
        ta.classList.toggle('live-formula-cell-input--number', typeof rawData === 'number');
        applyFormulaCellStyle(ta, td, cellId);
    };

    const refreshCellDisplay = (cid: string) => {
        const meta = cellInputs.get(cid);
        if (!meta) return;
        const { ta, td, adjustHeight } = meta;
        if (document.activeElement === ta) return;
        ta.value = getDisplayStringForCell(cid);
        syncCellPresentation(ta, td, cid);
        adjustHeight();
    };

    const commitCellValue = (ta: HTMLTextAreaElement, id: string, adjust: () => void): boolean => {
        const priorCell = state.getCell(id);
        const prior = priorCell !== undefined ? (priorCell.formula !== undefined ? priorCell.formula : priorCell.value) : undefined;
        const newValue = ta.value.trim();
        const fmt = { ...(priorCell?.format || {}) };

        let parsed: any = newValue;
        let isNumber = false;

        if (newValue !== '' && !newValue.startsWith('=')) {
            const stripped = newValue.replace(/,/g, '');
            const asNum = Number(stripped);
            if (!isNaN(asNum) && stripped !== '') {
                parsed = asNum;
                isNumber = true;
            }
        }

        if (isNumber && typeof prior === 'number' && parsed === prior) {
            ta.value = getDisplayStringForCell(id);
            adjust();
            return false;
        } else if (!isNumber && newValue === (prior !== undefined ? prior.toString() : '')) {
            ta.value = getDisplayStringForCell(id);
            adjust();
            return false;
        }

        if (typeof parsed === 'string' && parsed.startsWith('=')) {
            state.setCell(id, { value: parsed, formula: parsed, format: fmt });
        } else {
            state.setCell(id, { value: parsed, formula: undefined, format: fmt });
        }
        state.markDirty();
        const { updated, cyclic } = engine.updateCellAndDependents(id);
        if (!cyclic) {
            for (const cid of updated) {
                if (cid !== id) refreshCellDisplay(cid);
            }
        }
        adjust();
        return true;
    };

    let skipCellPopulateOnFocus = false;
    type FormulaBarLink = { input: HTMLTextAreaElement; cellId: string; adjustHeight: () => void; td: HTMLElement };
    let formulaBarLink: FormulaBarLink | null = null;

    formulaBarInput.addEventListener('blur', (ev) => {
        const rt = ev.relatedTarget as Node | null;
        const link = formulaBarLink;
        if (!link) return;
        if (rt === link.input) return;
        if (rt && toolbar?.el.contains(rt)) return;

        link.input.classList.remove('is-linked-focus');
        link.td.classList.remove('is-linked-focus');

        const movingToOtherCell = rt instanceof HTMLTextAreaElement && table.contains(rt);

        link.input.value = formulaBarInput.value;
        const didSave = commitCellValue(link.input, link.cellId, link.adjustHeight);
        syncCellPresentation(link.input, link.td, link.cellId);

        if (didSave && movingToOtherCell) {
            const col = (rt as HTMLElement).getAttribute('data-col');
            const row = (rt as HTMLElement).getAttribute('data-row');
            if (col && row) nextFocusCell = `${col}${row}`;
        }

        if (!movingToOtherCell) {
            formulaBarInput.value = '';
            formulaBarInput.oninput = null;
            formulaBarInput.onkeydown = null;
            formulaBarLink = null;
            toolbar?.setActiveCell(null, null);
        }
    });

    const applyToolbarFormatToCell = (cellId: string, key: string, val: any) => {
        const cell = state.ensureCell(cellId);
        if (!cell.format) cell.format = {};

        if (key === 'type') {
            const currentType = cell.format.type;
            if (currentType === val) {
                cell.format.type = 'plain';
            } else {
                cell.format.type = val;
            }
        } else if (key === 'decimals') {
            let currentDecimals = cell.format.decimals;
            if (currentDecimals === undefined) currentDecimals = 2;

            if (val === 'inc') currentDecimals++;
            if (val === 'dec' && currentDecimals > 0) currentDecimals--;

            cell.format.decimals = currentDecimals;
        } else {
            (cell.format as Record<string, unknown>)[key] = (cell.format as Record<string, unknown>)[key] === val ? null : val;
        }

        state.setCell(cellId, cell);
        state.markDirty();

        const meta = cellInputs.get(cellId);
        if (!meta) return;
        const { ta, td, adjustHeight } = meta;

        if (key === 'type' || key === 'decimals') {
            const shown = getDisplayStringForCell(cellId);
            ta.value = shown;
            if (formulaBarLink?.cellId === cellId) formulaBarInput.value = shown;
            ta.style.height = 'auto';
            ta.style.height = `${ta.scrollHeight}px`;
        }
        syncCellPresentation(ta, td, cellId);
        adjustHeight();
    };

    if (settings.showToolbar) {
        toolbar = new TableToolbar(container, (key, val) => {
            const tb = toolbar;
            if (!tb) return;

            if (key === 'toggleHeaders') {
                if (tb.activeCellId) nextFocusCell = tb.activeCellId;
                if (toggleHeaders) void toggleHeaders();
                return;
            }

            const idList =
                selectedCellIds.size > 0 ? [...selectedCellIds] : tb.activeCellId && tb.activeInput ? [tb.activeCellId] : [];
            if (idList.length === 0) return;

            for (const id of idList) {
                applyToolbarFormatToCell(id, key, val);
            }
        });
        container.insertBefore(toolbar.el, tableScroll);
    }

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
            const cellFormat = (cell?.format || {}) as CellData['format'];
            const rawData = cell !== undefined ? (cell.formula !== undefined ? cell.formula : cell.value) : '';
            const displayValue = getDisplayStringForCell(cellId);

            const td = tr.createEl('td', { cls: 'live-formula-cell' });
            const input = td.createEl('textarea', {
                cls: 'live-formula-cell-input',
                attr: {
                    'data-col': c,
                    'data-row': r.toString(),
                    'data-cell-id': cellId,
                    rows: '1',
                    spellcheck: 'true',
                },
            }) as HTMLTextAreaElement;

            input.value = displayValue;
            syncCellPresentation(input, td, cellId);

            const adjustHeight = () => {
                input.style.height = 'auto';
                input.style.height = `${input.scrollHeight}px`;
            };
            requestAnimationFrame(() => adjustHeight());

            cellInputs.set(cellId, { ta: input, td, adjustHeight });

            if (nextFocusCell === cellId) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        input.focus();
                        input.setSelectionRange(input.value.length, input.value.length);
                    });
                });
                nextFocusCell = null;
            }

            input.addEventListener('focus', () => {
                formulaBarLink = { input, cellId, adjustHeight, td };
                lastActiveCellId = cellId;

                input.classList.add('is-linked-focus');
                td.classList.add('is-linked-focus');
                toolbar?.setActiveCell(input, cellId);

                let editValue = rawData === undefined || rawData === null ? '' : rawData.toString();
                if (typeof rawData === 'number') {
                    let dec = cellFormat.decimals;
                    if (dec === undefined && cellFormat.type === 'currency') dec = 2;
                    if (dec !== undefined) editValue = rawData.toFixed(dec);
                }

                if (skipCellPopulateOnFocus) {
                    skipCellPopulateOnFocus = false;
                    formulaBarInput.value = input.value;
                } else {
                    input.value = editValue;
                    formulaBarInput.value = editValue;
                }

                adjustHeight();

                formulaBarInput.oninput = (e) => {
                    input.value = (e.target as HTMLInputElement).value;
                    const cellRef = state.ensureCell(cellId);
                    cellRef.value = input.value;
                    state.markDirty();
                    adjustHeight();
                };

                formulaBarInput.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.value = formulaBarInput.value;
                        const cellRef = state.ensureCell(cellId);
                        cellRef.value = input.value;
                        state.markDirty();
                        adjustHeight();
                        skipCellPopulateOnFocus = true;
                        input.focus();
                        input.blur();
                    }
                };
            });

            input.addEventListener('input', () => {
                adjustHeight();
                const cellRef = state.ensureCell(cellId);
                cellRef.value = input.value;
                state.markDirty();
                if (formulaBarLink?.input === input) {
                    formulaBarInput.value = input.value;
                }
            });

            input.addEventListener('blur', (ev) => {
                const rt = ev.relatedTarget as Node | null;
                const focusStaysInSheetChrome =
                    rt === formulaBarInput ||
                    (rt && formulaBarWrapper.contains(rt)) ||
                    (rt && toolbar?.el.contains(rt));

                if (focusStaysInSheetChrome) {
                    return;
                }

                input.classList.remove('is-linked-focus');
                td.classList.remove('is-linked-focus');
                toolbar?.setActiveCell(null, null);

                const didSave = commitCellValue(input, cellId, adjustHeight);
                syncCellPresentation(input, td, cellId);

                if (didSave && rt instanceof HTMLTextAreaElement && table.contains(rt)) {
                    const col = rt.getAttribute('data-col');
                    const row = rt.getAttribute('data-row');
                    if (col && row) nextFocusCell = `${col}${row}`;
                }

                setTimeout(() => {
                    const ae = document.activeElement;
                    const editingInGrid = ae instanceof HTMLTextAreaElement && table.contains(ae);
                    if (!editingInGrid && ae !== formulaBarInput) {
                        formulaBarInput.value = '';
                        formulaBarInput.oninput = null;
                        formulaBarInput.onkeydown = null;
                        formulaBarLink = null;
                    }
                }, 50);
            });

            input.addEventListener('keydown', (e) => {
                let moveCol = c,
                    moveRow = r;

                if (e.key === 'Enter') {
                    e.preventDefault();
                    moveRow = e.shiftKey ? r - 1 : r + 1;
                } else if (e.key === 'Tab') {
                    const idx = cols.indexOf(c);
                    if (!e.shiftKey) {
                        if (idx < cols.length - 1) moveCol = cols[idx + 1];
                        else if (r < rows) {
                            moveCol = cols[0];
                            moveRow = r + 1;
                        }
                    } else {
                        if (idx > 0) moveCol = cols[idx - 1];
                        else if (r > 1) {
                            moveCol = cols[cols.length - 1];
                            moveRow = r - 1;
                        }
                    }
                } else if (e.key === 'ArrowDown') moveRow = r + 1;
                else if (e.key === 'ArrowUp') moveRow = r - 1;
                else if (e.key === 'ArrowRight' && input.selectionEnd === input.value.length) {
                    const idx = cols.indexOf(c);
                    if (idx < cols.length - 1) moveCol = cols[idx + 1];
                } else if (e.key === 'ArrowLeft' && input.selectionStart === 0) {
                    const idx = cols.indexOf(c);
                    if (idx > 0) moveCol = cols[idx - 1];
                } else {
                    return;
                }

                if (moveCol !== c || moveRow !== r) {
                    e.preventDefault();
                    nextFocusCell = `${moveCol}${moveRow}`;
                    const target = table.querySelector(
                        `textarea[data-col="${CSS.escape(moveCol)}"][data-row="${moveRow}"]`
                    ) as HTMLTextAreaElement;
                    if (target) target.focus();
                    else input.blur();
                }
            });

            input.addEventListener('contextmenu', (e) => {
                if (e.shiftKey) {
                    e.stopPropagation();
                    return;
                }

                e.preventDefault();
                const colIdx = lettersToColumnIndex(c);
                const menu = new Menu();
                menu.addItem((i) =>
                    i.setTitle('Insert Row Above').setIcon('arrow-up').onClick(() => {
                        Actions.insertRow(state, r);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addItem((i) =>
                    i.setTitle('Insert Row Below').setIcon('arrow-down').onClick(() => {
                        Actions.insertRow(state, r + 1);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addItem((i) =>
                    i.setTitle('Delete Row').setIcon('trash').onClick(() => {
                        Actions.deleteRow(state, r);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addSeparator();
                menu.addItem((i) =>
                    i.setTitle('Insert Column Left').setIcon('arrow-left').onClick(() => {
                        Actions.insertCol(state, colIdx, rows);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addItem((i) =>
                    i.setTitle('Insert Column Right').setIcon('arrow-right').onClick(() => {
                        Actions.insertCol(state, colIdx + 1, rows);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.addItem((i) =>
                    i.setTitle('Delete Column').setIcon('trash').onClick(() => {
                        Actions.deleteCol(state, colIdx);
                        saveStateToFile();
                        rerender();
                    })
                );
                menu.showAtMouseEvent(e);
            });
        }
    }

    tableScroll.addEventListener(
        'mousedown',
        (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            const ta = t.closest?.('textarea[data-cell-id]') as HTMLTextAreaElement | null;
            if (!ta || !table.contains(ta)) return;

            const cellId = ta.getAttribute('data-cell-id');
            if (!cellId) return;

            const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
            const isFormulaBarFocused = activeEl === formulaBarInput;
            const isCellInputFocused = !!(formulaBarLink && activeEl === formulaBarLink.input);
            const isFormula = !!(activeEl && activeEl.value.startsWith('='));

            let isPointMode = false;
            if ((isFormulaBarFocused || isCellInputFocused) && isFormula && activeEl) {
                const s = activeEl.selectionStart ?? activeEl.value.length;
                const prevChar = activeEl.value.charAt(s - 1);

                const afterOperator = ['=', '(', ',', '+', '-', '*', '/'].includes(prevChar);
                if (afterOperator || e.ctrlKey || e.metaKey) {
                    isPointMode = true;
                }
            }

            if (isPointMode && activeEl) {
                e.preventDefault();
                justInjectedFormula = true;

                const s = activeEl.selectionStart ?? activeEl.value.length;
                const end = activeEl.selectionEnd ?? activeEl.value.length;
                const currentVal = activeEl.value;

                let prefix = '';
                if (e.ctrlKey || e.metaKey) {
                    const prevChar = currentVal.charAt(s - 1);
                    if (prevChar && !['(', '=', '+', '-', '*', '/', ','].includes(prevChar)) {
                        prefix = ',';
                    }
                }

                const insertedString = prefix + cellId;
                const newVal = currentVal.substring(0, s) + insertedString + currentVal.substring(end);
                activeEl.value = newVal;

                const injectionStart = s + prefix.length;
                const injectionEnd = s + insertedString.length;
                activeEl.setSelectionRange(injectionEnd, injectionEnd);

                if (activeEl === formulaBarInput && formulaBarLink) {
                    formulaBarLink.input.value = newVal;
                    formulaBarLink.adjustHeight();
                } else if (formulaBarLink) {
                    formulaBarInput.value = newVal;
                    formulaBarLink.adjustHeight();
                }

                if (formulaBarLink) {
                    const cellRef = state.ensureCell(formulaBarLink.cellId);
                    cellRef.value = newVal;
                    state.markDirty();
                }

                formulaDragState = {
                    activeInput: activeEl,
                    anchorCellId: cellId,
                    startPos: injectionStart,
                    endPos: injectionEnd,
                };

                if (!e.shiftKey) lastActiveCellId = cellId;

                return;
            }

            if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
            }
        },
        true
    );

    tableScroll.addEventListener('mouseover', (e: MouseEvent) => {
        if (!formulaDragState) return;

        if (e.buttons !== 1) {
            formulaDragState = null;
            return;
        }

        const t = e.target as HTMLElement;
        const ta = t.closest?.('textarea[data-cell-id]') as HTMLTextAreaElement | null;
        if (!ta || !table.contains(ta)) return;

        const currentCellId = ta.getAttribute('data-cell-id');
        if (!currentCellId) return;

        const { activeInput, anchorCellId, startPos, endPos } = formulaDragState;

        const match1 = anchorCellId.match(/^([A-Z]+)(\d+)$/i);
        const match2 = currentCellId.match(/^([A-Z]+)(\d+)$/i);
        if (!match1 || !match2) return;

        const c1 = lettersToColumnIndex(match1[1]);
        const r1 = parseInt(match1[2], 10);
        const c2 = lettersToColumnIndex(match2[1]);
        const r2 = parseInt(match2[2], 10);

        const minC = columnIndexToLetters(Math.min(c1, c2));
        const maxC = columnIndexToLetters(Math.max(c1, c2));
        const minR = Math.min(r1, r2);
        const maxR = Math.max(r1, r2);

        let rangeText = '';
        if (minC === maxC && minR === maxR) {
            rangeText = `${minC}${minR}`;
        } else {
            rangeText = `${minC}${minR}:${maxC}${maxR}`;
        }

        const currentVal = activeInput.value;
        const newVal = currentVal.substring(0, startPos) + rangeText + currentVal.substring(endPos);
        activeInput.value = newVal;

        const newEndPos = startPos + rangeText.length;
        activeInput.setSelectionRange(newEndPos, newEndPos);

        formulaDragState.endPos = newEndPos;

        if (activeInput === formulaBarInput && formulaBarLink) {
            formulaBarLink.input.value = newVal;
            formulaBarLink.adjustHeight();
        } else if (formulaBarLink) {
            formulaBarInput.value = newVal;
            formulaBarLink.adjustHeight();
        }

        if (formulaBarLink) {
            const cellRef = state.ensureCell(formulaBarLink.cellId);
            cellRef.value = newVal;
            state.markDirty();
        }
    });

    wrapper.addEventListener('click', (e: MouseEvent) => {
        if (justInjectedFormula) {
            justInjectedFormula = false;
            return;
        }

        const target = e.target as HTMLElement;
        const cellInput = target.closest('textarea[data-cell-id]') as HTMLTextAreaElement;
        if (!cellInput) return;

        const cellId = cellInput.getAttribute('data-cell-id');
        if (!cellId) return;

        if (e.shiftKey && lastActiveCellId) {
            e.preventDefault();

            if (!e.ctrlKey && !e.metaKey) {
                selectedCellIds.clear();
                wrapper.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
            }

            const match1 = lastActiveCellId.match(/^([A-Z]+)(\d+)$/i);
            const match2 = cellId.match(/^([A-Z]+)(\d+)$/i);

            if (match1 && match2) {
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
                        const id = `${colStr}${r}`;
                        selectedCellIds.add(id);
                        const el = wrapper.querySelector(`textarea[data-cell-id="${CSS.escape(id)}"]`);
                        if (el) el.classList.add('is-selected');
                    }
                }
            }
            cellInput.blur();
        } else if (e.ctrlKey || e.metaKey) {
            e.preventDefault();

            if (selectedCellIds.has(cellId)) {
                selectedCellIds.delete(cellId);
                cellInput.classList.remove('is-selected');
            } else {
                selectedCellIds.add(cellId);
                cellInput.classList.add('is-selected');
                cellInput.blur();
            }
            lastActiveCellId = cellId;
        } else {
            selectedCellIds.clear();
            wrapper.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
            lastActiveCellId = cellId;
        }
    });

    wrapper.addEventListener('focusout', (ev) => {
        const rt = ev.relatedTarget as Node | null;
        if (rt && table.contains(rt)) return;
        saveStateToFile();
    });

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
            rerender();
        });
        addRowBtn.addEventListener('mousedown', (e) => e.preventDefault());
        addRowBtn.addEventListener('click', () => {
            Actions.insertRow(state, rows + 1);
            saveStateToFile();
            rerender();
        });
    }
};
