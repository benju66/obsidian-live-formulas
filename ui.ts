import { evaluateMath } from './math';

export const renderTableUI = (el: HTMLElement, tableData: any, saveContent: (newData: any) => Promise<void>) => {
    
    // --- DYNAMIC GRID CALCULATOR ---
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

    // --- VISUAL GRID ---
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

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur(); 
            });
        }
    }

    // --- HOVER BUTTONS ---
    const btnStyle = "position: absolute; display: flex; align-items: center; justify-content: center; background: var(--interactive-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; cursor: pointer; color: var(--text-muted); opacity: 0; transition: opacity 0.2s ease, background 0.2s ease; font-size: 16px; font-weight: bold;";

    const addColBtn = wrapper.createEl('button', {
        text: "+", attr: { style: `${btnStyle} right: 0; top: 0; bottom: 28px; width: 24px;` }
    });

    const addRowBtn = wrapper.createEl('button', {
        text: "+", attr: { style: `${btnStyle} bottom: 0; left: 0; right: 28px; height: 24px;` }
    });

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