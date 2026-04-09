export interface FormulaDef {
    name: string;
    args: string;
    desc: string;
}

export const FORMULA_CATALOG: FormulaDef[] = [
    { name: 'SUM', args: 'number1, [number2], ...', desc: 'Adds its arguments' },
    { name: 'AVERAGE', args: 'number1, [number2], ...', desc: 'Returns the average of its arguments' },
    { name: 'MIN', args: 'number1, [number2], ...', desc: 'Returns the minimum value' },
    { name: 'MAX', args: 'number1, [number2], ...', desc: 'Returns the maximum value' },
    { name: 'COUNT', args: 'value1, [value2], ...', desc: 'Counts how many numbers are in the list of arguments' },
    { name: 'COUNTA', args: 'value1, [value2], ...', desc: 'Counts how many values are in the list of arguments' },
    { name: 'IF', args: 'logical_test, [value_if_true], [value_if_false]', desc: 'Checks whether a condition is met' },
    { name: 'AND', args: 'logical1, [logical2], ...', desc: 'Checks whether all arguments are true' },
    { name: 'OR', args: 'logical1, [logical2], ...', desc: 'Checks whether any argument is true' },
    { name: 'NOT', args: 'logical', desc: 'Changes false to true, or true to false' },
    { name: 'CONCAT', args: 'text1, [text2], ...', desc: 'Combines the text from multiple ranges' },
    { name: 'TODAY', args: '', desc: 'Returns the current date' },
    { name: 'NOW', args: '', desc: 'Returns the current date and time' },
    { name: 'VLOOKUP', args: 'lookup_value, table_array, col_index_num', desc: 'Looks for a value in the leftmost column of a table' },
    { name: 'ROUND', args: 'number, num_digits', desc: 'Rounds a number to a specified number of digits' },
    { name: 'FLOOR', args: 'number', desc: 'Rounds a number down, toward zero' },
    { name: 'CEIL', args: 'number', desc: 'Rounds a number up, away from zero' },
    { name: 'ABS', args: 'number', desc: 'Returns the absolute value of a number' },
];

export class FormulaAutocomplete {
    public popoverEl: HTMLElement;
    private targetInput: HTMLInputElement | HTMLTextAreaElement | null = null;
    private activeIndex = 0;
    private filtered: FormulaDef[] = [];

    // The current active context (for tooltip only)
    public activeFormulaConf: FormulaDef | null = null;
    public activeArgIndex = 0;

    constructor() {
        this.popoverEl = document.createElement('div');
        this.popoverEl.className = 'live-formula-autocomplete-popover';
        this.popoverEl.style.display = 'none';
        document.body.appendChild(this.popoverEl);

        this.onKeyDown = this.onKeyDown.bind(this);
    }

    public attach(input: HTMLInputElement | HTMLTextAreaElement) {
        if (this.targetInput) this.detach();
        this.targetInput = input;
        this.targetInput.addEventListener('keydown', this.onKeyDown, true); // Use capture phase
    }

    public detach() {
        if (this.targetInput) {
            this.targetInput.removeEventListener('keydown', this.onKeyDown, true);
            this.targetInput = null;
        }
        this.hide();
    }

    private hide() {
        this.popoverEl.style.display = 'none';
        this.filtered = [];
        this.activeFormulaConf = null;
    }

    private positionPopover() {
        if (!this.targetInput) return;
        const rect = this.targetInput.getBoundingClientRect();
        this.popoverEl.style.left = `${rect.left}px`;
        this.popoverEl.style.top = `${rect.bottom + 5}px`;
    }

    private renderList() {
        this.popoverEl.innerHTML = '';
        if (this.filtered.length === 0) {
            this.hide();
            return;
        }

        this.popoverEl.style.display = 'block';
        this.positionPopover();

        this.filtered.forEach((def, index) => {
            const item = document.createElement('div');
            item.className = 'live-formula-autocomplete-item' + (index === this.activeIndex ? ' is-active' : '');
            
            const nameEl = document.createElement('div');
            nameEl.className = 'live-formula-autocomplete-name';
            nameEl.textContent = def.name;

            const descEl = document.createElement('div');
            descEl.className = 'live-formula-autocomplete-desc';
            descEl.textContent = def.desc;

            item.appendChild(nameEl);
            item.appendChild(descEl);

            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.commitSuggestion(def);
            });

            this.popoverEl.appendChild(item);
        });
    }

    private renderTooltip() {
        this.popoverEl.innerHTML = '';
        if (!this.activeFormulaConf) {
            this.hide();
            return;
        }

        this.popoverEl.style.display = 'block';
        this.positionPopover();

        const item = document.createElement('div');
        item.className = 'live-formula-tooltip';
        
        const nameEl = document.createElement('strong');
        nameEl.textContent = this.activeFormulaConf.name + '(';
        item.appendChild(nameEl);

        const argsArr = this.activeFormulaConf.args.split(',').map(s => s.trim());
        argsArr.forEach((arg, i) => {
            const span = document.createElement('span');
            span.textContent = arg;
            if (i === this.activeArgIndex || (i === argsArr.length - 1 && this.activeArgIndex >= i)) {
                span.className = 'is-active-arg';
            }
            item.appendChild(span);
            if (i < argsArr.length - 1) {
                const comma = document.createElement('span');
                comma.textContent = ', ';
                item.appendChild(comma);
            }
        });

        const closeParen = document.createElement('strong');
        closeParen.textContent = ')';
        item.appendChild(closeParen);

        this.popoverEl.appendChild(item);
    }

    public onInput() {
        if (!this.targetInput) return;
        const val = this.targetInput.value;
        const cursorPos = this.targetInput.selectionStart ?? val.length;

        // 1. Check if we're inside a function parenthesis (Tooltip Mode)
        const textBeforeCursor = val.substring(0, cursorPos);
        
        // Find the last unclosed function call before cursor
        const lastOpenParenIdx = textBeforeCursor.lastIndexOf('(');
        if (lastOpenParenIdx !== -1) {
            // Count parens to ensure it's not closed
            const textAfterOpenParen = val.substring(lastOpenParenIdx);
            let depth = 0;
            let isClosedOrEscaped = false;
            for (let i = 0; i < textAfterOpenParen.length; i++) {
                if (textAfterOpenParen[i] === '(') depth++;
                else if (textAfterOpenParen[i] === ')') depth--;

                if (depth === 0) {
                    if (cursorPos > lastOpenParenIdx + i) isClosedOrEscaped = true;
                    break;
                }
            }

            if (!isClosedOrEscaped) {
                // We are actively typing arguments inside a parenthesis!
                const matchName = textBeforeCursor.substring(0, lastOpenParenIdx).match(/([A-Z]+)$/i);
                if (matchName) {
                    const funcName = matchName[1].toUpperCase();
                    const def = FORMULA_CATALOG.find(f => f.name === funcName);
                    if (def) {
                        this.activeFormulaConf = def;
                        // Count commas to find argument index
                        const innerText = textBeforeCursor.substring(lastOpenParenIdx + 1);
                        // Simplified comma counting (doesn't account for nested strings)
                        this.activeArgIndex = (innerText.match(/,/g) || []).length;
                        this.filtered = [];
                        this.renderTooltip();
                        return;
                    }
                }
            }
        }

        this.activeFormulaConf = null;

        // 2. Check if we're typing a function name (Autocomplete Mode)
        const match = textBeforeCursor.match(/(?:^|[=+/*-])([A-Z]*)$/i);
        if (match && match[1].length > 0 && textBeforeCursor.startsWith('=')) {
            const query = match[1].toUpperCase();
            this.filtered = FORMULA_CATALOG.filter(f => f.name.startsWith(query));
            this.activeIndex = 0;
            if (this.filtered.length > 0) {
                // If there's an exact match, Excel drops the autocomplete? 
                // Actually if they typed `SUM`, we still show `SUM`.
                this.renderList();
                return;
            }
        }

        this.hide();
    }

    private onKeyDown(e: KeyboardEvent) {
        if (this.filtered.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
                this.renderList();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
                this.renderList();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                this.commitSuggestion(this.filtered[this.activeIndex]);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this.commitSuggestion(this.filtered[this.activeIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            }
        }
    }

    private commitSuggestion(def: FormulaDef) {
        if (!this.targetInput) return;
        const val = this.targetInput.value;
        const cursorPos = this.targetInput.selectionStart ?? val.length;
        const textBeforeCursor = val.substring(0, cursorPos);
        
        const match = textBeforeCursor.match(/([A-Z]*)$/i);
        if (match) {
            const queryLength = match[1].length;
            const replacement = def.name + '(';
            
            const newTextBefore = textBeforeCursor.substring(0, textBeforeCursor.length - queryLength) + replacement;
            const newTextAfter = val.substring(cursorPos);
            
            this.targetInput.value = newTextBefore + newTextAfter;
            
            const newCursorPos = newTextBefore.length;
            this.targetInput.setSelectionRange(newCursorPos, newCursorPos);
            
            // Trigger input event to show tooltip immediately
            this.targetInput.dispatchEvent(new Event('input'));
        }
        
        this.hide();
    }

    public destroy() {
        this.detach();
        if (this.popoverEl.parentNode) {
            this.popoverEl.parentNode.removeChild(this.popoverEl);
        }
    }
}
