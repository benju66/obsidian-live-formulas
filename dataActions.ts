export const insertRow = (tableData: any, targetRow: number, maxColCode: number, saveContent: (newData: any) => Promise<void>) => {
    const newData: any = { _format: tableData._format };
    const cols = Array.from({length: maxColCode - 64}, (_, i) => String.fromCharCode(65 + i));
    
    for (const [key, value] of Object.entries(tableData)) {
        if (key === '_format') continue;
        const match = key.match(/^([A-Z]+)(\d+)$/);
        if (!match) continue;
        const col = match[1];
        const row = parseInt(match[2], 10);
        if (row < targetRow) newData[key] = value;
        else newData[`${col}${row + 1}`] = value;
    }
    cols.forEach(c => newData[`${c}${targetRow}`] = "");
    saveContent(newData);
};

export const deleteRow = (tableData: any, targetRow: number, saveContent: (newData: any) => Promise<void>) => {
    const newData: any = { _format: tableData._format };
    for (const [key, value] of Object.entries(tableData)) {
        if (key === '_format') continue;
        const match = key.match(/^([A-Z]+)(\d+)$/);
        if (!match) continue;
        const col = match[1];
        const row = parseInt(match[2], 10);
        if (row < targetRow) newData[key] = value;
        else if (row > targetRow) newData[`${col}${row - 1}`] = value;
    }
    saveContent(newData);
};

export const insertCol = (tableData: any, targetColCode: number, maxRow: number, maxColCode: number, saveContent: (newData: any) => Promise<void>) => {
    if (maxColCode >= 90) return; 
    const newData: any = { _format: tableData._format };
    for (const [key, value] of Object.entries(tableData)) {
        if (key === '_format') continue;
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

export const deleteCol = (tableData: any, targetColCode: number, saveContent: (newData: any) => Promise<void>) => {
    const newData: any = { _format: tableData._format };
    for (const [key, value] of Object.entries(tableData)) {
        if (key === '_format') continue;
        const match = key.match(/^([A-Z]+)(\d+)$/);
        if (!match) continue;
        const colCode = match[1].charCodeAt(0);
        const row = parseInt(match[2], 10);
        if (colCode < targetColCode) newData[key] = value;
        else if (colCode > targetColCode) newData[`${String.fromCharCode(colCode - 1)}${row}`] = value;
    }
    saveContent(newData);
};