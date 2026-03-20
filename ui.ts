import { Menu } from 'obsidian';
import { evaluateMath } from './math';
import { TableToolbar } from './toolbar';
import { LiveFormulasSettings } from './settings';
import * as Actions from './dataActions';

let nextFocusCell: string | null = null;

export const renderTableUI = (el: HTMLElement, tableData: any, settings: LiveFormulasSettings, saveContent: (newData: any) => Promise<void>) => {
    if (!tableData._format) tableData._format = {};

    // --- 1. DYNAMIC GRID CALCULATOR ---
    const cellIds = Object.keys(tableData).filter(k => k !== '_format');
    let maxRow = 1;
    let maxColCode = 65; 

    cellIds.forEach(id => {
        const match = id.match(/^([A-Z]+)(\d+)$/);
        if (match) {
            const row = parseInt(match[2], 10);
            if (row > maxRow) maxRow = row;
            if (match[1].charCodeAt(0) > maxColCode) maxColCode = match[1].charCodeAt(0);
        }
    });

    if (maxColCode < 66) maxColCode = 66; 
    const cols = Array.from({length: maxColCode - 64}, (_, i) => String.fromCharCode(65 + i));
    const rows = maxRow;

    // --- 2. WRAPPER & TOOLBAR ---
    const wrapper = el.createEl('div', { attr: { style: "position: relative; padding-right: 28px; padding-bottom: 28px; margin: 10px 0;" } });

    const toolbar = settings.showToolbar ? new TableToolbar(wrapper, (key, val) => {
        const tb = toolbar;
        if (!tb) return;
        const id = tb.activeCellId;
        if (!id || !tb.activeInput) return;
        if (!tableData._format[id]) tableData._format[id] = {};

        // Fix: Properly toggle between 'currency' and 'plain'
        if (key === 'type' && val === 'currency') {
            const currentType = tableData._format[id].type;
            // If it's already currency (or default currency), force to 'plain'
            if (currentType === 'currency' || (!currentType && settings.currencySymbol)) {
                tableData._format[id].type = 'plain';
            } else {
                tableData._format[id].type = 'currency';
            }
        } else {
            tableData._format[id][key] = (tableData._format[id][key] === val) ? null : val;
        }

        saveContent(tableData);

        // Live DOM Updates
        if (key === 'bold') tb.activeInput.style.fontWeight = tableData._format[id].bold ? 'bold' : 'normal';
        if (key === 'align') tb.activeInput.style.textAlign = tableData._format[id].align || 'left';

        // Visual Feedback for Currency:
        // Blur the input to stop editing and instantly show the formatted number
        if (key === 'type') {
            tb.activeInput.blur();
        }
    }) : null;

    const container = wrapper.createEl('div', { attr: { style: "border: 1px solid var(--background-modifier-border-hover); border-radius: 6px; overflow: visible;" } });

    // --- FORMULA BAR ---
    const formulaBarWrapper = container.createEl('div', { attr: { style: "display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border);" } });
    formulaBarWrapper.createEl('span', { text: 'fx', attr: { style: "font-style: italic; color: var(--text-muted); font-weight: bold; font-family: serif;" } });
    const formulaBarInput = formulaBarWrapper.createEl('input', {
        type: 'text',
        attr: { style: "flex-grow: 1; border: none; background: transparent; outline: none; color: var(--text-normal); font-family: monospace; font-size: 13px;" }
    });

    const table = container.createEl('table', { attr: { style: "width: 100%; border-collapse: collapse; margin: 0; table-layout: fixed;" } });

    const getDisplayStringForCell = (id: string): string => {
        const fmt = tableData._format[id] || {};
        const raw = tableData[id] !== undefined ? tableData[id] : "";
        let out = raw.toString();
        const formula = typeof raw === 'string' && raw.startsWith('=');
        let num: number | null = null;
        if (formula) num = evaluateMath(raw, tableData);
        else if (typeof raw === 'number') num = raw;
        if (num !== null) {
            const useCurrency = fmt.type === 'currency' || (!fmt.type && settings.currencySymbol);
            const plain = fmt.type === 'plain';
            out = useCurrency && !plain
                ? `${settings.currencySymbol || '$'}${num.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                : num.toLocaleString('en-US', { minimumFractionDigits: 2 });
        }
        return out;
    };

    const commitCellValue = (ta: HTMLTextAreaElement, id: string, adjust: () => void): boolean => {
        const prior = tableData[id];
        const priorStr = prior !== undefined ? prior.toString() : '';
        const newValue = ta.value.trim();
        if (newValue !== priorStr) {
            let parsed: any = newValue;
            if (newValue !== '' && !newValue.startsWith('=')) {
                const stripped = newValue.replace(/,/g, '');
                const asNum = Number(stripped);
                if (!isNaN(asNum) && stripped !== '') parsed = asNum;
            }
            tableData[id] = parsed;
            saveContent(tableData);
            adjust();
            return true; // We saved, table will rebuild!
        } else {
            ta.value = getDisplayStringForCell(id);
            adjust();
            return false; // No changes, no rebuild
        }
    };

    const applyFormulaCellStyle = (ta: HTMLTextAreaElement, td: HTMLElement, id: string) => {
        const raw = tableData[id];
        const formula = typeof raw === 'string' && raw.startsWith('=');
        if (formula) {
            ta.style.color = 'var(--text-accent)';
            td.style.backgroundColor = 'var(--background-secondary)';
        } else {
            ta.style.color = '';
            td.style.backgroundColor = '';
        }
    };

    let skipCellPopulateOnFocus = false;
    type FormulaBarLink = { input: HTMLTextAreaElement; cellId: string; adjustHeight: () => void; td: HTMLElement };
    let formulaBarLink: FormulaBarLink | null = null;

    formulaBarInput.addEventListener('blur', (ev) => {
        const rt = ev.relatedTarget as Node | null;
        const link = formulaBarLink;
        if (!link) return;
        if (rt === link.input) return;

        const movingToOtherCell = rt instanceof HTMLTextAreaElement && table.contains(rt);

        link.input.value = formulaBarInput.value;
        const didSave = commitCellValue(link.input, link.cellId, link.adjustHeight);
        applyFormulaCellStyle(link.input, link.td, link.cellId);

        // NEW: If we saved, capture the cell the user just clicked so focus survives the rebuild
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
        }
    });

    // --- 3. HEADERS ---
    if (settings.showHeaders) {
        const hr = table.createEl('tr');
        hr.createEl('th', { attr: { style: "width: 40px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border);" } });
        cols.forEach(c => hr.createEl('th', { text: c, attr: { style: "background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-muted); font-size: 11px; padding: 4px;" } }));
    }

    for (let r = 1; r <= rows; r++) {
        const tr = table.createEl('tr');
        if (settings.showHeaders) {
            tr.createEl('td', { text: r.toString(), attr: { style: "width: 40px; text-align: center; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-muted); font-size: 11px;" } });
        }

        for (const c of cols) {
            const cellId = `${c}${r}`;
            const cellFormat = tableData._format[cellId] || {};
            const rawData = tableData[cellId] !== undefined ? tableData[cellId] : "";
            const displayValue = getDisplayStringForCell(cellId);
            const isFormula = typeof rawData === 'string' && rawData.startsWith('=');

            const td = tr.createEl('td', { attr: { style: "border: 1px solid var(--background-modifier-border); padding: 0; min-width: 120px;" } });
            const input = td.createEl('textarea', {
                attr: {
                    'data-col': c, 'data-row': r.toString(), rows: "1",
                    style: `width: 100%; border: none; background: transparent; padding: 8px 12px; outline: none; text-align: ${cellFormat.align || 'left'}; font-weight: ${cellFormat.bold ? 'bold' : 'normal'}; font-family: ${typeof rawData === 'number' ? 'monospace' : 'inherit'}; resize: none; overflow: hidden; word-wrap: break-word; white-space: pre-wrap; display: block; line-height: 1.4;`
                }
            }) as HTMLTextAreaElement;

            input.value = displayValue;

            const adjustHeight = () => {
                input.style.height = 'auto';
                input.style.height = `${input.scrollHeight}px`;
            };
            setTimeout(adjustHeight, 10);

            if (isFormula) { input.style.color = 'var(--text-accent)'; td.style.backgroundColor = 'var(--background-secondary)'; }

            // --- FOCUS RECOVERY ---
            if (nextFocusCell === cellId) {
                setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 20);
                nextFocusCell = null; 
            }

            input.addEventListener('focus', () => {
                formulaBarLink = { input, cellId, adjustHeight, td };
                if (skipCellPopulateOnFocus) {
                    skipCellPopulateOnFocus = false;
                    formulaBarInput.value = input.value;
                } else {
                    input.value = rawData.toString();
                    formulaBarInput.value = rawData.toString();
                }
                input.style.background = 'var(--background-modifier-active-hover)';
                toolbar?.show(input, cellId, td, r);
                adjustHeight();

                formulaBarInput.oninput = (e) => {
                    input.value = (e.target as HTMLInputElement).value;
                    adjustHeight();
                };

                formulaBarInput.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.value = formulaBarInput.value;
                        adjustHeight();
                        skipCellPopulateOnFocus = true;
                        input.focus();
                        input.blur();
                    }
                };
            });

            input.addEventListener('input', () => {
                adjustHeight();
                if (formulaBarLink?.input === input) {
                    formulaBarInput.value = input.value;
                }
            });

            input.addEventListener('blur', (ev) => {
                const rt = ev.relatedTarget as Node | null;
                if (rt === formulaBarInput || (rt && formulaBarWrapper.contains(rt))) {
                    input.style.background = 'transparent';
                    toolbar?.hide();
                    return;
                }

                toolbar?.hide();
                input.style.background = 'transparent';

                // Track if a save happened
                const didSave = commitCellValue(input, cellId, adjustHeight);
                applyFormulaCellStyle(input, td, cellId);

                // NEW: If we saved, capture the cell the user just clicked
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

            // --- KEYBOARD NAVIGATION (Now with Arrow Keys) ---
            input.addEventListener('keydown', (e) => {
                let moveCol = c, moveRow = r;

                if (e.key === 'Enter') { e.preventDefault(); moveRow = e.shiftKey ? r - 1 : r + 1; }
                else if (e.key === 'Tab') { 
                    const idx = cols.indexOf(c);
                    if (!e.shiftKey) { if (idx < cols.length - 1) moveCol = cols[idx + 1]; else if (r < rows) { moveCol = cols[0]; moveRow = r + 1; } }
                    else { if (idx > 0) moveCol = cols[idx - 1]; else if (r > 1) { moveCol = cols[cols.length - 1]; moveRow = r - 1; } }
                }
                // ARROW KEYS: Only move if the cursor is at the very start or end of the text
                else if (e.key === 'ArrowDown') moveRow = r + 1;
                else if (e.key === 'ArrowUp') moveRow = r - 1;
                else if (e.key === 'ArrowRight' && input.selectionEnd === input.value.length) {
                    const idx = cols.indexOf(c); if (idx < cols.length - 1) moveCol = cols[idx + 1];
                }
                else if (e.key === 'ArrowLeft' && input.selectionStart === 0) {
                    const idx = cols.indexOf(c); if (idx > 0) moveCol = cols[idx - 1];
                } else { return; }

                if (moveCol !== c || moveRow !== r) {
                    e.preventDefault();
                    nextFocusCell = `${moveCol}${moveRow}`;
                    const target = table.querySelector(`textarea[data-col="${moveCol}"][data-row="${moveRow}"]`) as HTMLTextAreaElement;
                    if (target) target.focus(); else input.blur();
                }
            });

            // --- CONTEXT MENU ---
            input.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const menu = new Menu();
                menu.addItem(i => i.setTitle('Insert Row Above').setIcon('arrow-up').onClick(() => Actions.insertRow(tableData, r, maxColCode, saveContent)));
                menu.addItem(i => i.setTitle('Insert Row Below').setIcon('arrow-down').onClick(() => Actions.insertRow(tableData, r + 1, maxColCode, saveContent)));
                menu.addItem(i => i.setTitle('Delete Row').setIcon('trash').onClick(() => Actions.deleteRow(tableData, r, saveContent)));
                menu.addSeparator(); 
                menu.addItem(i => i.setTitle('Insert Column Left').setIcon('arrow-left').onClick(() => Actions.insertCol(tableData, c.charCodeAt(0), rows, maxColCode, saveContent)));
                menu.addItem(i => i.setTitle('Insert Column Right').setIcon('arrow-right').onClick(() => Actions.insertCol(tableData, c.charCodeAt(0) + 1, rows, maxColCode, saveContent)));
                menu.addItem(i => i.setTitle('Delete Column').setIcon('trash').onClick(() => Actions.deleteCol(tableData, c.charCodeAt(0), saveContent)));
                menu.showAtMouseEvent(e);
            });
        }
    }

    // --- HOVER BUTTONS ---
    if (settings.enableHoverButtons) {
        const btnStyle = "position: absolute; display: flex; align-items: center; justify-content: center; background: var(--interactive-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; cursor: pointer; color: var(--text-muted); opacity: 0; transition: opacity 0.2s ease, background 0.2s ease; font-size: 16px; font-weight: bold;";
        const addColBtn = wrapper.createEl('button', { text: "+", attr: { style: `${btnStyle} right: 0; top: 0; bottom: 28px; width: 24px;` } });
        const addRowBtn = wrapper.createEl('button', { text: "+", attr: { style: `${btnStyle} bottom: 0; left: 0; right: 28px; height: 24px;` } });
        wrapper.addEventListener('mouseenter', () => { addColBtn.style.opacity = '1'; addRowBtn.style.opacity = '1'; });
        wrapper.addEventListener('mouseleave', () => { addColBtn.style.opacity = '0'; addRowBtn.style.opacity = '0'; });
        addColBtn.addEventListener('click', () => Actions.insertCol(tableData, maxColCode + 1, rows, maxColCode, saveContent));
        addRowBtn.addEventListener('click', () => Actions.insertRow(tableData, rows + 1, maxColCode, saveContent));
    }
};