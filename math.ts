export const evaluateMath = (formula: string, tableData: any, depth: number = 0): number => {
    // 1. Safety Check: Prevent infinite loops if A1 refers to B1, and B1 refers to A1
    if (depth > 20) return 0; 

    const getValue = (cellId: string): number => {
        const raw = tableData[cellId];
        if (typeof raw === 'number') return raw;
        if (typeof raw === 'string') {
            if (raw.startsWith('=')) return evaluateMath(raw, tableData, depth + 1);
            const parsed = parseFloat(raw.replace(/,/g, ''));
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    };

    // Remove the '=' and make everything uppercase so it's easy to read
    let expression = formula.substring(1).toUpperCase(); 

    // 2. Pre-calculate any SUM ranges (e.g., SUM(B1:B5)) and replace them with raw numbers
    expression = expression.replace(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g, (match: string, startCol: string, startRowStr: string, endCol: string, endRowStr: string) => {
        const startRow = parseInt(startRowStr, 10);
        const endRow = parseInt(endRowStr, 10);
        let total = 0;
        for(let r = startRow; r <= endRow; r++) {
            total += getValue(`${startCol}${r}`);
        }
        return total.toString();
    });

    // 3. Pre-calculate comma SUMs (e.g., SUM(B1, B2))
    expression = expression.replace(/SUM\(([^)]+)\)/g, (match: string, argsStr: string) => {
        const args = argsStr.split(',').map((s: string) => s.trim());
        const total = args.reduce((sum: number, cellId: string) => sum + getValue(cellId), 0);
        return total.toString();
    });

    // 4. Swap all remaining cell references (A1, B2) with their numeric values
    expression = expression.replace(/[A-Z]+\d+/g, (match: string) => {
        return getValue(match).toString();
    });

    // 5. Calculate the final math!
    try {
        // SECURITY: Strip out anything that isn't a number or a basic math symbol
        const sanitized = expression.replace(/[^0-9+\-*/(). ]/g, '');
        
        // Use the native JS function constructor to do the arithmetic
        const result = new Function('return ' + sanitized)();
        return isNaN(result) ? 0 : result;
    } catch (e) {
        console.error("Live Formulas Math Error:", formula, e);
        return 0;
    }
};