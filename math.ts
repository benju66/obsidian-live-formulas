export const evaluateMath = (formula: string, tableData: any): number => {
    // Helper to extract clean numbers from cells
    const getValue = (cellId: string): number => {
        const raw = tableData[cellId];
        if (typeof raw === 'number') return raw;
        if (typeof raw === 'string') {
            if (raw.startsWith('=')) return evaluateMath(raw, tableData); // Recursive for nested formulas
            const parsed = parseFloat(raw.replace(/,/g, ''));
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    };

    // 1. Range Formulas: =SUM(B1:B5)
    const rangeMatch = formula.match(/=SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/);
    if (rangeMatch) {
        const col = rangeMatch[1]; 
        const startRow = parseInt(rangeMatch[2], 10);
        const endRow = parseInt(rangeMatch[4], 10);
        let total = 0;
        for(let r = startRow; r <= endRow; r++) {
            total += getValue(`${col}${r}`);
        }
        return total;
    }

    // 2. Comma Formulas: =SUM(B1, B2)
    const sumMatch = formula.match(/=SUM\(([^)]+)\)/);
    if (sumMatch) {
        const args = sumMatch[1].split(',').map(s => s.trim());
        return args.reduce((total, cellId) => total + getValue(cellId), 0);
    }
    
    return 0;
};