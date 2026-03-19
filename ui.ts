import { Menu } from 'obsidian';
import { evaluateMath } from './math';

// NEW: This "Memory Variable" survives Obsidian's DOM re-renders!
let nextFocusCell: string | null = null;

export const renderTableUI = (el: HTMLElement, tableData: any, saveContent: (newData: any) => Promise<void>) => {
    
    // --- 1. DYNAMIC GRID CALCULATOR ---
    const cellIds = Object.keys(tableData);
    let maxRow = 1;
    let maxColCode = 65; 

    cellIds.forEach(id => {
        const match = id.match(/^([A-Z]+)(\d+)$/);
        if (match) {
            const col = match[1];
            const row = parseInt(match[2], 10);
            if (row > maxRow) maxRow = row;
            if (col.charCodeAt(0) > maxColCode) maxColCode = col.charCodeAt(0);
        }
    });

    if (maxColCode < 66) maxColCode = 66; 

    const cols: string[] = [];
    for (let i = 65; i <= maxColCode; i++) {
        cols.push(String.fromCharCode(i));
    }
    const rows = maxRow;

    // --- 2. DATA MUTATION LOGIC ---
    const insertRow = (targetRow: number) => {
        const newData: any = {};
        for (const [key, value] of Object.entries(tableData)) {
            const match = key.match(/^([A-Z]+)(\d+)$/);
            if (!match) continue;
            const col = match[1];
            const row = parseInt(match[2], 10);
            if (row < targetRow) newData[key] = value;
            else newData[`${col}${row + 1}`] = value;
        }
        for (let i = 65; i <= maxColCode; i++) newData[`${String.fromCharCode(i)}${targetRow}`] = "";
        saveContent(newData);
    };

    const deleteRow = (targetRow: number) => {
        const newData: any = {};
        for (const [key, value] of Object.entries(tableData)) {
            const match = key.match(/^([A-Z]+)(\d+)$/);
            if (!match) continue;
            const col = match[1];
            const row = parseInt(match[2], 10);
            if (row < targetRow) newData[key] = value;
            else if (row > targetRow) newData[`${col}${row - 1}`] = value;
        }
        saveContent(newData);
    };

    const insertCol = (targetColCode: number) => {
        if (maxColCode >= 90) return; 
        const newData: any = {};
        for (const [key, value] of Object.entries(tableData)) {
            const match = key.match(/^([A-Z]+)(\d+)$/);
            if (!match) continue;
            const colCode = match[1].charCodeAt(0);
            const row = parseInt(match[2], 10);
            if (colCode < targetColCode) newData[key] = value;
            else newData[`${String.fromCharCode(colCode + 1)}${row}`] = value;
        }
        for (let r = 1; r <= maxRow; r++) newData[`${String.fromCharCode(targetColCode)}${r}`] = "";
        saveContent(newData);
    };

    const deleteCol = (targetColCode: number) => {
        const newData: any = {};
        for (const [key, value] of Object.entries(tableData)) {
            const match = key.match(/^([A-Z]+)(\d+)$/);
            if (!match) continue;
            const colCode = match[1].charCodeAt(0);
            const row = parseInt(match[2], 10);
            if (colCode < targetColCode) newData[key] = value;
            else if (colCode > targetColCode) newData[`${String.fromCharCode(colCode - 1)}${row}`] = value;
        }
        saveContent(newData);
    };

    // --- 3. VISUAL GRID ---
    const wrapper = el.createEl('div', {
        attr: { style: "position: relative; padding-right: 28px; padding-bottom: 28px; margin-top: 10px; margin-bottom: 10px;" }
    });

    const container = wrapper.createEl('div', { 
        attr: { style: "border: 1px solid var(--background-modifier-border-hover); border-radius: 6px; overflow: hidden;" } 
    });
    
    const table = container.createEl('table', {
        attr: { style: "width: 100%; border-collapse: collapse; margin: 0;" }
    });

    for (let r = 1; r <= rows; r++) {
        const tr = table.createEl('tr');
        
        for (const c of cols) {
            const cellId = `${c}${r}`;
            const rawData = tableData[cellId] !== undefined ? tableData[cellId] : "";
            let displayValue = rawData.toString();
            
            if (typeof rawData === 'string' && rawData.startsWith('=')) {
                const calculatedNumber = evaluateMath(rawData, tableData);
                displayValue = `$${calculatedNumber.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            } else if (typeof rawData === 'number') {
                displayValue = rawData.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }

            const td = tr.createEl('td', {
                attr: { style: "border: 1px solid var(--background-modifier-border); padding: 0; min-width: 120px;" }
            });
            
            const input = td.createEl('input', {
                type: 'text',
                value: displayValue,
                attr: { 
                    'data-col': c,
                    'data-row': r.toString(),
                    style: "width: 100%; box-sizing: border-box; border: none; background: transparent; color: inherit; font-family: inherit; font-size: inherit; padding: 8px 12px; outline: none;" 
                }
            });
            
            if (typeof rawData === 'string' && rawData.startsWith('=')) {
                input.style.fontWeight = 'bold';
                input.style.color = 'var(--text-accent)';
                tr.style.backgroundColor = 'var(--background-secondary)';
            }
            
            if (!isNaN(parseFloat(displayValue.replace(/,/g, '').replace('$', '')))) {
                input.style.textAlign = 'right';
                input.style.fontFamily = 'monospace';
            }

            // --- FOCUS RECOVERY ---
            // When the new table renders, check if this cell is the one we marked for focus
            if (nextFocusCell === cellId) {
                setTimeout(() => {
                    input.focus();
                    input.setSelectionRange(input.value.length, input.value.length);
                }, 50); // A tiny delay ensures Obsidian is fully done updating the DOM
                nextFocusCell = null; // Wipe the memory
            }

            // --- INTERACTIVITY ---
            input.addEventListener('focus', () => {
                input.value = rawData.toString();
                input.style.background = 'var(--background-modifier-active-hover)';
            });

            input.addEventListener('blur', () => {
                input.style.background = 'transparent';
                const newValue = input.value.trim();
                if (newValue === rawData.toString()) {
                    input.value = displayValue; 
                    return;
                }
                let parsedValue: any = newValue;
                if (newValue !== "" && !newValue.startsWith('=')) {
                    const asNumber = parseFloat(newValue.replace(/,/g, ''));
                    if (!isNaN(asNumber)) parsedValue = asNumber;
                }
                tableData[cellId] = parsedValue;
                saveContent(tableData); 
            });

            // --- KEYBOARD NAVIGATION ---
            input.addEventListener('keydown', (e) => {
                // Handle Enter (Up/Down)
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextRow = e.shiftKey ? r - 1 : r + 1;
                    
                    if (nextRow >= 1 && nextRow <= rows) {
                        nextFocusCell = `${c}${nextRow}`; // Write to memory
                        input.blur(); // Trigger save & re-render
                        
                        // Fallback: If no re-render happens (value didn't change), move focus instantly
                        setTimeout(() => {
                            const nextInput = table.querySelector(`input[data-col="${c}"][data-row="${nextRow}"]`) as HTMLInputElement;
                            if (nextInput) nextInput.focus();
                        }, 10);
                    } else {
                        input.blur();
                    }
                }

                // Handle Tab (Left/Right)
                if (e.key === 'Tab') {
                    const colIndex = cols.indexOf(c);
                    let nextCol = c;
                    let nextRow = r;

                    if (!e.shiftKey) {
                        if (colIndex < cols.length - 1) nextCol = cols[colIndex + 1];
                        else if (r < rows) { nextCol = cols[0]; nextRow = r + 1; }
                    } else {
                        if (colIndex > 0) nextCol = cols[colIndex - 1];
                        else if (r > 1) { nextCol = cols[cols.length - 1]; nextRow = r - 1; }
                    }
                    
                    // Write the next tab destination to memory in case the DOM gets destroyed!
                    nextFocusCell = `${nextCol}${nextRow}`;
                }
            });

            // --- RIGHT CLICK CONTEXT MENU ---
            input.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const menu = new Menu();
                
                menu.addItem((item) => { item.setTitle('Insert Row Above').setIcon('arrow-up').onClick(() => insertRow(r)); });
                menu.addItem((item) => { item.setTitle('Insert Row Below').setIcon('arrow-down').onClick(() => insertRow(r + 1)); });
                menu.addItem((item) => { item.setTitle('Delete Row').setIcon('trash').onClick(() => deleteRow(r)); });
                menu.addSeparator(); 
                menu.addItem((item) => { item.setTitle('Insert Column Left').setIcon('arrow-left').onClick(() => insertCol(c.charCodeAt(0))); });
                menu.addItem((item) => { item.setTitle('Insert Column Right').setIcon('arrow-right').onClick(() => insertCol(c.charCodeAt(0) + 1)); });
                menu.addItem((item) => { item.setTitle('Delete Column').setIcon('trash').onClick(() => deleteCol(c.charCodeAt(0))); });
                
                menu.showAtMouseEvent(e);
            });
        }
    }

    // --- HOVER BUTTONS ---
    const btnStyle = "position: absolute; display: flex; align-items: center; justify-content: center; background: var(--interactive-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; cursor: pointer; color: var(--text-muted); opacity: 0; transition: opacity 0.2s ease, background 0.2s ease; font-size: 16px; font-weight: bold;";

    const addColBtn = wrapper.createEl('button', { text: "+", attr: { style: `${btnStyle} right: 0; top: 0; bottom: 28px; width: 24px;` } });
    const addRowBtn = wrapper.createEl('button', { text: "+", attr: { style: `${btnStyle} bottom: 0; left: 0; right: 28px; height: 24px;` } });

    wrapper.addEventListener('mouseenter', () => { addColBtn.style.opacity = '1'; addRowBtn.style.opacity = '1'; });
    wrapper.addEventListener('mouseleave', () => { addColBtn.style.opacity = '0'; addRowBtn.style.opacity = '0'; });
    addColBtn.addEventListener('mouseenter', () => addColBtn.style.background = 'var(--interactive-hover)');
    addColBtn.addEventListener('mouseleave', () => addColBtn.style.background = 'var(--interactive-normal)');
    addRowBtn.addEventListener('mouseenter', () => addRowBtn.style.background = 'var(--interactive-hover)');
    addRowBtn.addEventListener('mouseleave', () => addRowBtn.style.background = 'var(--interactive-normal)');

    addColBtn.addEventListener('click', () => {
        if (maxColCode >= 90) return; 
        const newColChar = String.fromCharCode(maxColCode + 1);
        for (let r = 1; r <= rows; r++) tableData[`${newColChar}${r}`] = "";
        saveContent(tableData);
    });

    addRowBtn.addEventListener('click', () => {
        const newRow = rows + 1;
        cols.forEach(c => { tableData[`${c}${newRow}`] = ""; });
        saveContent(tableData);
    });
};