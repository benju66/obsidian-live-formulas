import { Menu } from 'obsidian';
import { evaluateMath } from './math';
import { TableToolbar } from './toolbar';
import * as Actions from './dataActions';

let nextFocusCell: string | null = null;

export const renderTableUI = (el: HTMLElement, tableData: any, settings: any, saveContent: (newData: any) => Promise<void>) => {
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
        const id = toolbar.activeCellId;
        if (!id || !toolbar.activeInput) return;
        if (!tableData._format[id]) tableData._format[id] = {};
        tableData._format[id][key] = (tableData._format[id][key] === val) ? null : val;
        saveContent(tableData);
        if (key === 'bold') toolbar.activeInput.style.fontWeight = tableData._format[id].bold ? 'bold' : 'normal';
        if (key === 'align') toolbar.activeInput.style.textAlign = tableData._format[id].align || 'left';
    }) : null;

    const container = wrapper.createEl('div', { attr: { style: "border: 1px solid var(--background-modifier-border-hover); border-radius: 6px; overflow: visible;" } });
    const table = container.createEl('table', { attr: { style: "width: 100%; border-collapse: collapse; margin: 0; table-layout: fixed;" } });

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
            
            let displayValue = rawData.toString();
            if (typeof rawData === 'string' && rawData.startsWith('=')) {
                const num = evaluateMath(rawData, tableData);
                const isCurrency = cellFormat.type === 'currency' || (!cellFormat.type && settings.currencySymbol);
                displayValue = isCurrency ? `${settings.currencySymbol || '$'}${num.toLocaleString('en-US', {minimumFractionDigits: 2})}` : num.toString();
            } else if (typeof rawData === 'number') {
                displayValue = rawData.toLocaleString('en-US', {minimumFractionDigits: 2});
            }

            const td = tr.createEl('td', { attr: { style: "border: 1px solid var(--background-modifier-border); padding: 0; min-width: 120px;" } });
            const input = td.createEl('input', {
                type: 'text',
                value: displayValue,
                attr: { 'data-col': c, 'data-row': r.toString(), style: `width: 100%; border: none; background: transparent; padding: 8px 12px; outline: none; text-align: ${cellFormat.align || 'left'}; font-weight: ${cellFormat.bold ? 'bold' : 'normal'}; font-family: ${typeof rawData === 'number' ? 'monospace' : 'inherit'};` }
            });

            if (typeof rawData === 'string' && rawData.startsWith('=')) { input.style.color = 'var(--text-accent)'; tr.style.backgroundColor = 'var(--background-secondary)'; }

            // --- FOCUS RECOVERY ---
            if (nextFocusCell === cellId) {
                setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 20);
                nextFocusCell = null; 
            }

            input.addEventListener('focus', () => {
                input.value = rawData.toString();
                input.style.background = 'var(--background-modifier-active-hover)';
                toolbar?.show(input, cellId, td, r);
            });

            input.addEventListener('blur', () => {
                toolbar?.hide();
                input.style.background = 'transparent';
                const newValue = input.value.trim();
                if (newValue !== rawData.toString()) {
                    let parsedValue: any = newValue;
                    if (newValue !== "" && !newValue.startsWith('=')) {
                        const asNum = parseFloat(newValue.replace(/,/g, ''));
                        if (!isNaN(asNum)) parsedValue = asNum;
                    }
                    tableData[cellId] = parsedValue;
                    saveContent(tableData); 
                } else { input.value = displayValue; }
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
                    const target = table.querySelector(`input[data-col="${moveCol}"][data-row="${moveRow}"]`) as HTMLInputElement;
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
    if (settings?.enableHoverButtons) {
        const btnStyle = "position: absolute; display: flex; align-items: center; justify-content: center; background: var(--interactive-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; cursor: pointer; color: var(--text-muted); opacity: 0; transition: opacity 0.2s ease, background 0.2s ease; font-size: 16px; font-weight: bold;";
        const addColBtn = wrapper.createEl('button', { text: "+", attr: { style: `${btnStyle} right: 0; top: 0; bottom: 28px; width: 24px;` } });
        const addRowBtn = wrapper.createEl('button', { text: "+", attr: { style: `${btnStyle} bottom: 0; left: 0; right: 28px; height: 24px;` } });
        wrapper.addEventListener('mouseenter', () => { addColBtn.style.opacity = '1'; addRowBtn.style.opacity = '1'; });
        wrapper.addEventListener('mouseleave', () => { addColBtn.style.opacity = '0'; addRowBtn.style.opacity = '0'; });
        addColBtn.addEventListener('click', () => Actions.insertCol(tableData, maxColCode + 1, rows, maxColCode, saveContent));
        addRowBtn.addEventListener('click', () => Actions.insertRow(tableData, rows + 1, maxColCode, saveContent));
    }
};